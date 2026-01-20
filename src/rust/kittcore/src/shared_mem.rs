use std::alloc::{alloc, dealloc, Layout};
use std::mem;
use std::slice;
use std::collections::HashSet;

use crate::scanner::discovery::{DiscoveryEngine, CandidateStats, CandidateStatus, canonicalize, CanonToken};
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

    // Track which keys are present in THIS document
    let mut active_keys = HashSet::new();

    DISCOVERY_ENGINE.with(|engine_cell| {
        let mut engine = engine_cell.borrow_mut();

        // 1. Harvester (Observe Tokens)
        for word in text.split_whitespace() {
            // Track presence
            if let Some((key, _)) = canonicalize(word) {
                active_keys.insert(key);
            }

            // NEW CHECK
            if crate::scanner::dafsa::is_known_entity(word) {
                continue;
            }

            if word.chars().next().map_or(false, |c| c.is_uppercase()) {
                engine.observe_token(word);
            }
        }
        
        // 2. Virus (Observe Relations & Infer Kinds)
        engine.scan_text_for_relations(text);
    });
    
    // 3. Pack Results (Read from persistent engine, filtered by active_keys)
    let mut packed_candidates = Vec::with_capacity(active_keys.len());
    
    DISCOVERY_ENGINE.with(|engine_cell| {
        let engine = engine_cell.borrow();
        
        for key in active_keys {
            if let Some(stats) = engine.registry.stats.get(&key) {
                // Return BOTH Watching (0) and Promoted (1) candidates
                // Filter out Ignored (2)
                if stats.status != CandidateStatus::Ignored {
                    let token_bytes = stats.display.as_bytes();
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

                    // Score = Frequency + (Centrality * 5.0)
                    // High centrality (connected to known entities) boosts score significantly.
                    let centrality = engine.registry.graph.get_degree(&key);
                    // let centrality = 0;
                    let score = (stats.count as f32) + (centrality as f32 * 5.0);

                    packed_candidates.push(CandidatePacked {
                        start: 0, 
                        token_ptr,
                        token_len: token_bytes.len() as u32,
                        kind: stats.inferred_kind.map(|k| k as u8).unwrap_or(255), // 255 = None
                        score,
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scanner::dafsa::{compile_dictionary, RuntimeDictionary, RegisteredEntity, EntityKind, set_global_dictionary};
    use std::sync::Arc;
    use std::slice;

    #[test]
    fn test_scan_shared_integrates_global_dict() {
        // 1. Setup Global Dictionary with "Luffy"
        let entities = vec![
            RegisteredEntity {
                id: "e1".to_string(),
                label: "Luffy".to_string(),
                kind: EntityKind::CHARACTER,
                aliases: vec![],
                narrative_id: None,
            }
        ];
        let compiled = compile_dictionary(1, 0, &entities).unwrap();
        let dict = RuntimeDictionary::load(compiled).unwrap();
        set_global_dictionary(Arc::new(dict));

        // 2. Scan text containing "Luffy" and "Zoro" (new)
        let text = "Luffy vs Zoro";
        let ptr = scan_shared(text.as_ptr(), text.len());
        
        assert!(!ptr.is_null(), "Result ptr should not be null");

        unsafe {
            let header = &*ptr;
            println!("Got {} candidates", header.candidate_count);
            
            let slice = slice::from_raw_parts(header.candidates_ptr, header.candidate_count as usize);
            let mut found_zoro = false;
            let mut found_luffy = false;

            for c in slice {
                let token_slice = slice::from_raw_parts(c.token_ptr, c.token_len as usize);
                let token = std::str::from_utf8(token_slice).unwrap();
                println!("Candidate: {}", token);
                
                if token == "Zoro" { found_zoro = true; }
                if token == "Luffy" { found_luffy = true; }
            }
            
            // Clean up
            free_result_deep(ptr);

            assert!(found_zoro, "Zoro should be a candidate (Watching)");
            assert!(!found_luffy, "Luffy should NOT be a candidate (Known Entity)");
        }
    }
}