//! CozoDB Shared Memory Interface
//!
//! Exports `extern "C"` functions for CozoDB operations.
//! Uses the same pattern as `shared_mem.rs` for the scanner.

use std::cell::RefCell;
use std::slice;

use crate::db::cozo_graph::{CozoGraph, CozoError};

// =============================================================================
// Thread-Local Singleton
// =============================================================================

thread_local! {
    pub static COZO_DB: RefCell<Option<CozoGraph>> = RefCell::new(None);
}


// =============================================================================
// Result Structures (Packed C)
// =============================================================================

#[repr(C)]
pub struct QueryResultHeader {
    pub success: u8,          // 1 = ok, 0 = error
    pub json_ptr: *const u8,  // JSON string bytes (leaked)
    pub json_len: u32,
    pub json_cap: u32,        // Capacity for proper deallocation
}

#[repr(C)]
pub struct ExportResultHeader {
    pub success: u8,
    pub data_ptr: *const u8,  // Exported DB JSON (leaked)
    pub data_len: u32,
    pub data_cap: u32,        // Capacity for proper deallocation
}

// =============================================================================
// Initialization
// =============================================================================

/// Initialize the CozoDB instance. Call once on worker startup.
/// Returns 0 on success, non-zero on failure.
#[no_mangle]
pub extern "C" fn cozo_init() -> i32 {
    COZO_DB.with(|cell| {
        let mut db_opt = cell.borrow_mut();
        if db_opt.is_some() {
            return 0; // Already initialized
        }
        
        match CozoGraph::new() {
            Ok(graph) => {
                *db_opt = Some(graph);
                0
            }
            Err(_) => -1,
        }
    })
}

/// Check if CozoDB is initialized.
/// Returns 1 if ready, 0 if not.
#[no_mangle]
pub extern "C" fn cozo_is_ready() -> i32 {
    COZO_DB.with(|cell| {
        if cell.borrow().is_some() { 1 } else { 0 }
    })
}

// =============================================================================
// Query Execution
// =============================================================================

/// Execute a Datalog query and return JSON result.
/// Caller must free result with `cozo_free_query_result`.
#[no_mangle]
pub extern "C" fn cozo_query(query_ptr: *const u8, query_len: usize) -> *mut QueryResultHeader {
    // Reconstruct query string
    let query = unsafe {
        if query_ptr.is_null() || query_len == 0 {
            return make_error_result("Empty query");
        }
        let slice = slice::from_raw_parts(query_ptr, query_len);
        match std::str::from_utf8(slice) {
            Ok(s) => s,
            Err(_) => return make_error_result("Invalid UTF-8 in query"),
        }
    };

    COZO_DB.with(|cell| {
        let db_opt = cell.borrow();
        match db_opt.as_ref() {
            None => make_error_result("CozoDB not initialized"),
            Some(graph) => {
                match graph.query(query) {
                    Ok(rows) => {
                        // Serialize to JSON
                        match serde_json::to_string(&rows) {
                            Ok(json) => make_success_result(&json),
                            Err(e) => make_error_result(&format!("JSON error: {}", e)),
                        }
                    }
                    Err(e) => make_error_result(&format!("Query error: {}", e)),
                }
            }
        }
    })
}

// =============================================================================
// Node Operations
// =============================================================================

/// Upsert a node into the graph.
/// Returns 0 on success, non-zero on failure.
#[no_mangle]
pub extern "C" fn cozo_upsert_node(
    id_ptr: *const u8, id_len: usize,
    label_ptr: *const u8, label_len: usize,
    kind_ptr: *const u8, kind_len: usize,
) -> i32 {
    // Reconstruct strings
    let (id, label, kind) = unsafe {
        let id = read_str(id_ptr, id_len);
        let label = read_str(label_ptr, label_len);
        let kind = read_str(kind_ptr, kind_len);
        
        if id.is_none() {
            return -1;
        }
        
        (
            id.unwrap_or_default(),
            label.unwrap_or_default(),
            kind.unwrap_or("UNKNOWN"),
        )
    };

    COZO_DB.with(|cell| {
        let db_opt = cell.borrow();
        match db_opt.as_ref() {
            None => -1,
            Some(graph) => {
                match graph.upsert_node(id, label, kind, serde_json::json!({})) {
                    Ok(_) => 0,
                    Err(_) => -2,
                }
            }
        }
    })
}

/// Upsert an edge into the graph.
/// Returns 0 on success, non-zero on failure.
#[no_mangle]
pub extern "C" fn cozo_upsert_edge(
    source_ptr: *const u8, source_len: usize,
    target_ptr: *const u8, target_len: usize,
    relation_ptr: *const u8, relation_len: usize,
) -> i32 {

    let (source, target, relation) = unsafe {
        let source = read_str(source_ptr, source_len);
        let target = read_str(target_ptr, target_len);
        let relation = read_str(relation_ptr, relation_len);
        
        if source.is_none() || target.is_none() {
            return -1;
        }
        
        (
            source.unwrap_or_default(),
            target.unwrap_or_default(),
            relation.unwrap_or("RELATED_TO"),
        )
    };

    // Generate deterministic ID for the relationship
    let rel_id = format!("{}:{}:{}", source, target, relation);

    COZO_DB.with(|cell| {
        let db_opt = cell.borrow();
        match db_opt.as_ref() {
            None => -1,
            Some(graph) => {
                // Upsert relationship with default confidence 1.0, bidirectional=false
                match graph.upsert_relationship(&rel_id, source, target, relation, 1.0, false) {
                    Ok(_) => 0,
                    Err(_) => -2,
                }
            }
        }
    })
}

/// Upsert a full relationship into the graph.
/// Returns 0 on success, non-zero on failure.
#[no_mangle]
pub extern "C" fn cozo_upsert_relationship(
    id_ptr: *const u8, id_len: usize,
    source_ptr: *const u8, source_len: usize,
    target_ptr: *const u8, target_len: usize,
    type_ptr: *const u8, type_len: usize,
    confidence: f64,
    bidirectional: bool,
) -> i32 {
    let (id, source, target, rel_type) = unsafe {
        let id_str = read_str(id_ptr, id_len);
        let source_str = read_str(source_ptr, source_len);
        let target_str = read_str(target_ptr, target_len);
        let type_str = read_str(type_ptr, type_len);
        
        if id_str.is_none() || source_str.is_none() || target_str.is_none() {
            return -1;
        }
        
        (
            id_str.unwrap_or_default(),
            source_str.unwrap_or_default(),
            target_str.unwrap_or_default(),
            type_str.unwrap_or("RELATED_TO"),
        )
    };

    COZO_DB.with(|cell| {
        let db_opt = cell.borrow();
        match db_opt.as_ref() {
            None => -1,
            Some(graph) => {
                match graph.upsert_relationship(id, source, target, rel_type, confidence, bidirectional) {
                    Ok(_) => 0,
                    Err(_) => -2,
                }
            }
        }
    })
}



// =============================================================================
// Export/Import (for OPFS persistence)
// =============================================================================

/// Export the entire database to a JSON string.
/// Caller must free result with `cozo_free_export_result`.
#[no_mangle]
pub extern "C" fn cozo_export() -> *mut ExportResultHeader {
    COZO_DB.with(|cell| {
        let db_opt = cell.borrow();
        match db_opt.as_ref() {
            None => {
                let header = Box::new(ExportResultHeader {
                    success: 0,
                    data_ptr: std::ptr::null(),
                    data_len: 0,
                    data_cap: 0,
                });
                Box::into_raw(header)
            }
            Some(graph) => {
                match graph.export() {
                    Ok(json) => {
                        let mut bytes = json.into_bytes();
                        bytes.shrink_to_fit(); // Ensure len == capacity
                        let len = bytes.len();
                        let cap = bytes.capacity();
                        let ptr = bytes.as_ptr();
                        std::mem::forget(bytes); // Leak
                        
                        let header = Box::new(ExportResultHeader {
                            success: 1,
                            data_ptr: ptr,
                            data_len: len as u32,
                            data_cap: cap as u32,
                        });
                        Box::into_raw(header)
                    }
                    Err(_) => {
                        let header = Box::new(ExportResultHeader {
                            success: 0,
                            data_ptr: std::ptr::null(),
                            data_len: 0,
                            data_cap: 0,
                        });
                        Box::into_raw(header)
                    }
                }
            }
        }
    })
}


/// Import database from a JSON string.
/// Returns 0 on success, non-zero on failure.
#[no_mangle]
pub extern "C" fn cozo_import(data_ptr: *const u8, data_len: usize) -> i32 {
    let data = unsafe {
        if data_ptr.is_null() || data_len == 0 {
            return -1;
        }
        let slice = slice::from_raw_parts(data_ptr, data_len);
        match std::str::from_utf8(slice) {
            Ok(s) => s,
            Err(_) => return -2,
        }
    };

    COZO_DB.with(|cell| {
        let db_opt = cell.borrow();
        match db_opt.as_ref() {
            None => -3,
            Some(graph) => {
                match graph.import(data) {
                    Ok(_) => 0,
                    Err(_) => -4,
                }
            }
        }
    })
}

/// Get node count.
#[no_mangle]
pub extern "C" fn cozo_node_count() -> i32 {
    COZO_DB.with(|cell| {
        let db_opt = cell.borrow();
        match db_opt.as_ref() {
            None => -1,
            Some(graph) => graph.node_count().unwrap_or(0) as i32,
        }
    })
}

/// Get edge count.
#[no_mangle]
pub extern "C" fn cozo_edge_count() -> i32 {
    COZO_DB.with(|cell| {
        let db_opt = cell.borrow();
        match db_opt.as_ref() {
            None => -1,
            Some(graph) => graph.edge_count().unwrap_or(0) as i32,
        }
    })
}

// =============================================================================
// Cleanup
// =============================================================================

/// Free a query result.
#[no_mangle]
pub extern "C" fn cozo_free_query_result(ptr: *mut QueryResultHeader) {
    if ptr.is_null() { return; }
    unsafe {
        let header = Box::from_raw(ptr);
        if !header.json_ptr.is_null() && header.json_cap > 0 {
            // Reconstruct the Vec and drop it
            let _ = Vec::from_raw_parts(
                header.json_ptr as *mut u8,
                header.json_len as usize,
                header.json_cap as usize, // Use actual capacity!
            );
        }
    }
}

/// Free an export result.
#[no_mangle]
pub extern "C" fn cozo_free_export_result(ptr: *mut ExportResultHeader) {
    if ptr.is_null() { return; }
    unsafe {
        let header = Box::from_raw(ptr);
        if !header.data_ptr.is_null() && header.data_cap > 0 {
            let _ = Vec::from_raw_parts(
                header.data_ptr as *mut u8,
                header.data_len as usize,
                header.data_cap as usize, // Use actual capacity!
            );
        }
    }
}

// =============================================================================
// Helpers
// =============================================================================

fn make_error_result(msg: &str) -> *mut QueryResultHeader {
    let mut bytes = msg.as_bytes().to_vec();
    bytes.shrink_to_fit();
    let len = bytes.len();
    let cap = bytes.capacity();
    let ptr = bytes.as_ptr();
    std::mem::forget(bytes);
    
    let header = Box::new(QueryResultHeader {
        success: 0,
        json_ptr: ptr,
        json_len: len as u32,
        json_cap: cap as u32,
    });
    Box::into_raw(header)
}

fn make_success_result(json: &str) -> *mut QueryResultHeader {
    let mut bytes = json.as_bytes().to_vec();
    bytes.shrink_to_fit();
    let len = bytes.len();
    let cap = bytes.capacity();
    let ptr = bytes.as_ptr();
    std::mem::forget(bytes);
    
    let header = Box::new(QueryResultHeader {
        success: 1,
        json_ptr: ptr,
        json_len: len as u32,
        json_cap: cap as u32,
    });
    Box::into_raw(header)
}

unsafe fn read_str<'a>(ptr: *const u8, len: usize) -> Option<&'a str> {
    if ptr.is_null() || len == 0 {
        return None;
    }
    let slice = slice::from_raw_parts(ptr, len);
    std::str::from_utf8(slice).ok()
}

// =============================================================================
// OPFS Persistence (Async via wasm-bindgen)
// =============================================================================

use wasm_bindgen::prelude::*;
use crate::db::cozo_opfs::OpfsAdapter;

/// Toggle this to use the old basic OPFS (no envelope, no backup, no WAL)
const USE_LEGACY_OPFS: bool = false;

// Legacy paths (for rollback compatibility)
const LEGACY_OPFS_PATH: &str = "/cozo/rust_graph.json";

/// Save Rust CozoDB to OPFS (Enterprise: envelope + backup rotation)
/// Returns a Promise that resolves to true on success
#[wasm_bindgen]
pub async fn cozo_save_to_opfs() -> Result<bool, JsValue> {
    if USE_LEGACY_OPFS {
        return cozo_save_to_opfs_legacy().await;
    }

    // Export the DB
    let export_data = COZO_DB.with(|cell| {
        let db_opt = cell.borrow();
        match db_opt.as_ref() {
            None => Err("CozoDB not initialized"),
            Some(graph) => graph.export().map_err(|_| "Export failed"),
        }
    });

    let json = match export_data {
        Ok(j) => j,
        Err(e) => return Err(JsValue::from_str(e)),
    };

    // Use enterprise OPFS adapter with envelope + backup
    match OpfsAdapter::save_snapshot(&json).await {
        Ok(_) => Ok(true),
        Err(e) => Err(JsValue::from_str(&format!("OPFS save failed: {:?}", e))),
    }
}

/// Load Rust CozoDB from OPFS (Enterprise: envelope validation + backup fallback)
/// Returns a Promise that resolves to true on success, false if no file exists
#[wasm_bindgen]
pub async fn cozo_load_from_opfs() -> Result<bool, JsValue> {
    if USE_LEGACY_OPFS {
        return cozo_load_from_opfs_legacy().await;
    }

    // Use enterprise OPFS adapter with envelope validation + backup fallback
    let result = match OpfsAdapter::load_snapshot().await {
        Ok(r) => r,
        Err(e) => return Err(JsValue::from_str(&format!("OPFS load failed: {:?}", e))),
    };

    // Check if we have a snapshot
    let payload_json = match result.snapshot {
        Some(p) => p,
        None => {
            web_sys::console::log_1(&"[Rust Cozo] No OPFS snapshot found".into());
            return Ok(false);
        }
    };

    if result.recovery_mode {
        web_sys::console::warn_1(&"[Rust Cozo] ⚠️ Recovered from backup snapshot".into());
    }

    // Import into CozoDB
    let import_result = COZO_DB.with(|cell| {
        let db_opt = cell.borrow();
        match db_opt.as_ref() {
            None => Err("CozoDB not initialized"),
            Some(graph) => graph.import(&payload_json).map_err(|_| "Import failed"),
        }
    });

    match import_result {
        Ok(_) => {
            web_sys::console::log_1(
                &format!("[Rust Cozo] Loaded from OPFS ({} bytes, source: {:?})", 
                    payload_json.len(), result.source).into()
            );
            Ok(true)
        }
        Err(e) => Err(JsValue::from_str(e)),
    }
}

// =============================================================================
// LEGACY OPFS (Keep for rollback - set USE_LEGACY_OPFS = true to use)
// =============================================================================

/// [LEGACY] Save Rust CozoDB to OPFS - basic version without envelope
async fn cozo_save_to_opfs_legacy() -> Result<bool, JsValue> {
    // Export the DB
    let export_data = COZO_DB.with(|cell| {
        let db_opt = cell.borrow();
        match db_opt.as_ref() {
            None => Err("CozoDB not initialized"),
            Some(graph) => graph.export().map_err(|_| "Export failed"),
        }
    });

    let json = match export_data {
        Ok(j) => j,
        Err(e) => return Err(JsValue::from_str(e)),
    };

    // Ensure directory exists
    if let Err(e) = opfs_project::create_dir_all("/cozo").await {
        let _ = e; // Ignore if already exists
    }

    // Write to OPFS (raw, no envelope)
    match opfs_project::write(LEGACY_OPFS_PATH, json.as_bytes()).await {
        Ok(_) => {
            web_sys::console::log_1(&format!("[Rust Cozo LEGACY] Saved to OPFS ({} bytes)", json.len()).into());
            Ok(true)
        }
        Err(e) => Err(JsValue::from_str(&format!("OPFS write failed: {:?}", e))),
    }
}

/// [LEGACY] Load Rust CozoDB from OPFS - basic version without envelope validation
async fn cozo_load_from_opfs_legacy() -> Result<bool, JsValue> {
    // Try to read from OPFS
    let bytes = match opfs_project::read(LEGACY_OPFS_PATH).await {
        Ok(b) => b,
        Err(_) => {
            web_sys::console::log_1(&"[Rust Cozo LEGACY] No OPFS snapshot found".into());
            return Ok(false);
        }
    };

    // Convert Arc<Vec<u8>> to String
    let data = match String::from_utf8((*bytes).clone()) {
        Ok(s) => s,
        Err(e) => return Err(JsValue::from_str(&format!("UTF-8 decode failed: {:?}", e))),
    };

    // Import into CozoDB
    let result = COZO_DB.with(|cell| {
        let db_opt = cell.borrow();
        match db_opt.as_ref() {
            None => Err("CozoDB not initialized"),
            Some(graph) => graph.import(&data).map_err(|_| "Import failed"),
        }
    });

    match result {
        Ok(_) => {
            web_sys::console::log_1(&format!("[Rust Cozo LEGACY] Loaded from OPFS ({} bytes)", data.len()).into());
            Ok(true)
        }
        Err(e) => Err(JsValue::from_str(e)),
    }
}


