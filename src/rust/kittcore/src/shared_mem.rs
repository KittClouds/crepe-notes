use std::alloc::{alloc, dealloc, Layout};
use std::mem;
use std::slice;

use crate::scanner::discovery::{DiscoveryEngine, CandidateStats, CandidateStatus};
use crate::scanner::dafsa::types::EntityKind;

// =============================================================================
// Memory Management (Exported)
// =============================================================================

/// Allocate memory in WASM linear memory
#[no_mangle]
pub extern "C" fn alloc_u8(size: usize) -> *mut u8 {
    // Prevent UB from 0-sized layout by enforcing min size of 1
    let size = if size == 0 { 1 } else { size };
    let layout = Layout::from_size_align(size, 8).unwrap();
    unsafe { alloc(layout) }
}

/// Deallocate memory in WASM linear memory
#[no_mangle]
pub extern "C" fn dealloc_u8(ptr: *mut u8, size: usize) {
    if ptr.is_null() { return; }
    // Match alloc logic: size 0 was allocated as size 1
    let size = if size == 0 { 1 } else { size };
    let layout = Layout::from_size_align(size, 8).unwrap();
    unsafe { dealloc(ptr, layout) }
}

/// Deallocate the scan result (header + candidates + relations)
#[no_mangle]
pub extern "C" fn free_scan_result(ptr: *mut ScanResultHeader) {
    if ptr.is_null() { return; }
    unsafe {
        let _ = Box::from_raw(ptr); 
    }
}

// =============================================================================
// Binary Structures (Packed)
// =============================================================================

#[repr(C)]
pub struct ScanResultHeader {
    pub candidate_count: u32,
    pub candidates_ptr: *const CandidatePacked,
    pub candidate_capacity: u32,
    pub relation_count: u32,
    pub relations_ptr: *const RelationPacked,
}

#[repr(C)]
pub struct CandidatePacked {
    pub start: u32, 
    pub token_ptr: *const u8,
    pub token_len: u32,
    
    pub kind: u8, // EntityKind as u8
    pub score: f32,
    pub status: u8, // CandidateStatus
}

#[repr(C)]
pub struct RelationPacked {
    pub source: u32,
    pub target: u32,
}

// =============================================================================
// Shared Scanner
// =============================================================================

/// Scans text from a shared buffer using DiscoveryEngine
#[no_mangle]
pub extern "C" fn scan_shared(text_ptr: *const u8, text_len: usize) -> *mut ScanResultHeader {
    // 1. Reconstruct string slice (unsafe)
    let text = unsafe {
        let slice = slice::from_raw_parts(text_ptr, text_len);
        std::str::from_utf8(slice).unwrap_or("")
    };

    if text.is_empty() {
        return std::ptr::null_mut();
    }

    // 2. Initialize Engine (Persistent via thread_local)
    thread_local! {
        static DISCOVERY_ENGINE: std::cell::RefCell<DiscoveryEngine> = std::cell::RefCell::new(DiscoveryEngine::new(3));
    }

    DISCOVERY_ENGINE.with(|engine_cell| {
        let mut engine = engine_cell.borrow_mut();

        // 1. Harvester (Observe Tokens)
        for word in text.split_whitespace() {
            if word.chars().next().map_or(false, |c| c.is_uppercase()) {
                engine.observe_token(word);
            }
        }
        
        // 2. Virus (Observe Relations & Infer Kinds)
        engine.scan_text_for_relations(text);
    });
    
    // 3. Pack Results (Read from persistent engine)
    let mut packed_candidates = Vec::new();
    
    DISCOVERY_ENGINE.with(|engine_cell| {
        let engine = engine_cell.borrow();
        
        for (token, stats) in &engine.registry.stats {
        for (token, stats) in &engine.registry.stats {
            // Return BOTH Watching (0) and Promoted (1) candidates
            // Filter out Ignored (2)
            if stats.status != CandidateStatus::Ignored {
                let token_bytes = token.as_bytes();
                let len = token_bytes.len();
                
                let token_ptr = if len > 0 {
                    // Use alignment 8 to match alloc_u8
                    let token_layout = Layout::from_size_align(len, 8).unwrap();
                    let ptr = unsafe { alloc(token_layout) };
                    unsafe {
                        std::ptr::copy_nonoverlapping(token_bytes.as_ptr(), ptr, len);
                    }
                    ptr
                } else {
                    std::ptr::null_mut()
                };

                packed_candidates.push(CandidatePacked {
                    start: 0, 
                    token_ptr,
                    token_len: token_bytes.len() as u32,
                    kind: stats.inferred_kind.map(|k| k as u8).unwrap_or(255), // 255 = None
                    score: 0.0,
                    status: stats.status as u8,
                });
            }
        }
        }
    });

    // Leak the candidates vector to get a raw pointer
    packed_candidates.shrink_to_fit(); 
    
    let candidates_len = packed_candidates.len();
    let candidates_cap = packed_candidates.capacity();
    let candidates_ptr = packed_candidates.as_ptr();
    std::mem::forget(packed_candidates); // Leak it so it's not freed

    let header = Box::new(ScanResultHeader {
        candidate_count: candidates_len as u32,
        candidates_ptr, 
        candidate_capacity: candidates_cap as u32,
        relation_count: 0,
        relations_ptr: std::ptr::null(),
    });

    Box::into_raw(header)
}

// Cleanup helper for the packed strings
#[no_mangle]
pub extern "C" fn free_result_deep(header_ptr: *mut ScanResultHeader) {
    if header_ptr.is_null() { return; }
    unsafe {
        let header = Box::from_raw(header_ptr);
        
        // Free candidates array
        if !header.candidates_ptr.is_null() && header.candidate_count > 0 {
             let slice = slice::from_raw_parts_mut(
                header.candidates_ptr as *mut CandidatePacked, 
                header.candidate_count as usize
            );
            
            // Free each token string
            for c in slice {
                if !c.token_ptr.is_null() && c.token_len > 0 {
                    dealloc_u8(c.token_ptr as *mut u8, c.token_len as usize);
                }
            }
            
            // Free the array itself using exact capacity
            let _ = Vec::from_raw_parts(
                header.candidates_ptr as *mut CandidatePacked,
                header.candidate_count as usize,
                header.candidate_capacity as usize // Use captured capacity
            );
        }
    }
}
