//! Alex OPFS Persistence
//!
//! Simple binary blob persistence for Alex entity library.
//! Uses opfs-project for WASM OPFS access.
//!
//! File Layout:
//!   /alex/snapshot.bin     - Bincode-serialized AlexSnapshot
//!   /alex/snapshot.bin.bak - Backup of previous snapshot

use super::{Alex, AlexError};

/// OPFS paths for Alex
const ALEX_DIR: &str = "/alex";
const SNAPSHOT_PATH: &str = "/alex/snapshot.bin";
const BACKUP_PATH: &str = "/alex/snapshot.bin.bak";

/// Maximum snapshot size (10MB should be plenty for entity dictionary)
pub const MAX_ALEX_SIZE_BYTES: usize = 10 * 1024 * 1024;

// =============================================================================
// OPFS Persistence (WASM only)
// =============================================================================

#[cfg(target_arch = "wasm32")]
mod wasm_impl {
    use super::*;

    /// Save Alex to OPFS
    pub async fn save_alex(alex: &Alex) -> Result<usize, AlexError> {
        let bytes = alex.to_bytes()?;
        
        if bytes.len() > MAX_ALEX_SIZE_BYTES {
            return Err(AlexError::SerializeFailed);
        }

        // Ensure directory exists
        let _ = opfs_project::create_dir_all(ALEX_DIR).await;

        // Rotate: copy current -> backup (ignore errors if doesn't exist)
        if let Ok(existing) = opfs_project::read(SNAPSHOT_PATH).await {
            let _ = opfs_project::write(BACKUP_PATH, &*existing).await;
        }

        // Write new snapshot
        opfs_project::write(SNAPSHOT_PATH, &bytes)
            .await
            .map_err(|e| {
                web_sys::console::error_1(
                    &format!("[Alex OPFS] Save failed: {:?}", e).into()
                );
                AlexError::SerializeFailed
            })?;

        let size = bytes.len();
        web_sys::console::log_1(
            &format!("[Alex OPFS] Saved snapshot ({} bytes, {} entities)", size, alex.entity_count()).into()
        );

        Ok(size)
    }

    /// Load Alex from OPFS (with backup fallback)
    pub async fn load_alex() -> Result<Option<Alex>, AlexError> {
        // Try primary
        match try_load_from(SNAPSHOT_PATH).await {
            Ok(Some(alex)) => {
                web_sys::console::log_1(
                    &format!("[Alex OPFS] Loaded from primary ({} entities)", alex.entity_count()).into()
                );
                return Ok(Some(alex));
            }
            Ok(None) => {}
            Err(e) => {
                web_sys::console::warn_1(
                    &format!("[Alex OPFS] Primary load failed: {:?}", e).into()
                );
            }
        }

        // Try backup
        match try_load_from(BACKUP_PATH).await {
            Ok(Some(alex)) => {
                web_sys::console::warn_1(
                    &format!("[Alex OPFS] ⚠️ Recovered from backup ({} entities)", alex.entity_count()).into()
                );
                return Ok(Some(alex));
            }
            Ok(None) => {}
            Err(e) => {
                web_sys::console::warn_1(
                    &format!("[Alex OPFS] Backup load failed: {:?}", e).into()
                );
            }
        }

        // No snapshot found
        web_sys::console::log_1(&"[Alex OPFS] No snapshot found".into());
        Ok(None)
    }

    /// Try to load Alex from a specific path
    async fn try_load_from(path: &str) -> Result<Option<Alex>, AlexError> {
        let bytes = match opfs_project::read(path).await {
            Ok(b) => b,
            Err(_) => return Ok(None),
        };

        if bytes.is_empty() {
            return Ok(None);
        }

        // Deserialize
        let alex = Alex::load(&*bytes)?;
        Ok(Some(alex))
    }

    /// Delete Alex snapshot from OPFS
    pub async fn delete_alex() -> Result<(), AlexError> {
        let _ = opfs_project::remove_file(SNAPSHOT_PATH).await;
        let _ = opfs_project::remove_file(BACKUP_PATH).await;
        web_sys::console::log_1(&"[Alex OPFS] Deleted snapshots".into());
        Ok(())
    }

    /// Check if Alex snapshot exists
    pub async fn alex_exists() -> bool {
        opfs_project::read(SNAPSHOT_PATH).await.is_ok()
    }
}

#[cfg(target_arch = "wasm32")]
pub use wasm_impl::{save_alex, load_alex, delete_alex, alex_exists};

// =============================================================================
// Global Alex State
// =============================================================================

use std::cell::RefCell;
use std::sync::Arc;

thread_local! {
    /// Global Alex instance - single source of truth for entity dictionary
    pub static ALEX_STATE: RefCell<Option<Arc<Alex>>> = RefCell::new(None);
}

/// Get the global Alex instance
pub fn get_global_alex() -> Option<Arc<Alex>> {
    ALEX_STATE.with(|cell| cell.borrow().clone())
}

/// Set the global Alex instance
pub fn set_global_alex(alex: Alex) {
    ALEX_STATE.with(|cell| {
        *cell.borrow_mut() = Some(Arc::new(alex));
    });
}

/// Clear the global Alex instance
pub fn clear_global_alex() {
    ALEX_STATE.with(|cell| {
        *cell.borrow_mut() = None;
    });
}

// =============================================================================
// WASM Bindings
// =============================================================================

#[cfg(target_arch = "wasm32")]
mod wasm_exports {
    use super::*;
    use wasm_bindgen::prelude::*;
    use crate::scanner::dafsa::types::RegisteredEntity;

    /// Build Alex from entity JSON array and set as global
    #[wasm_bindgen(js_name = alexBuild)]
    pub fn alex_build(entities_json: &str) -> Result<u32, JsValue> {
        // Parse entities from JSON
        let entities: Vec<RegisteredEntity> = serde_json::from_str(entities_json)
            .map_err(|e| JsValue::from_str(&format!("JSON parse error: {}", e)))?;

        // Build Alex
        let alex = Alex::build(&entities)
            .map_err(|e| JsValue::from_str(&format!("Build failed: {:?}", e)))?;

        let count = alex.entity_count();

        // Set global
        set_global_alex(alex);

        web_sys::console::log_1(
            &format!("[Alex] Built with {} entities", count).into()
        );

        Ok(count as u32)
    }

    /// Save global Alex to OPFS
    #[wasm_bindgen(js_name = alexSaveToOpfs)]
    pub async fn alex_save_to_opfs() -> Result<u32, JsValue> {
        let alex = get_global_alex()
            .ok_or_else(|| JsValue::from_str("Alex not initialized"))?;

        let size = save_alex(&alex).await
            .map_err(|e| JsValue::from_str(&format!("Save failed: {:?}", e)))?;

        Ok(size as u32)
    }

    /// Load Alex from OPFS and set as global
    #[wasm_bindgen(js_name = alexLoadFromOpfs)]
    pub async fn alex_load_from_opfs() -> Result<bool, JsValue> {
        match load_alex().await {
            Ok(Some(alex)) => {
                let count = alex.entity_count();
                set_global_alex(alex);
                web_sys::console::log_1(
                    &format!("[Alex] Loaded {} entities from OPFS", count).into()
                );
                Ok(true)
            }
            Ok(None) => {
                web_sys::console::log_1(&"[Alex] No OPFS snapshot found".into());
                Ok(false)
            }
            Err(e) => Err(JsValue::from_str(&format!("Load failed: {:?}", e))),
        }
    }

    /// Check if Alex is initialized
    #[wasm_bindgen(js_name = alexIsReady)]
    pub fn alex_is_ready() -> bool {
        get_global_alex().is_some()
    }

    /// Get entity count from global Alex
    #[wasm_bindgen(js_name = alexEntityCount)]
    pub fn alex_entity_count() -> u32 {
        get_global_alex()
            .map(|a| a.entity_count() as u32)
            .unwrap_or(0)
    }

    /// Check if a token is known (exact match)
    #[wasm_bindgen(js_name = alexIsKnown)]
    pub fn alex_is_known(token: &str) -> bool {
        get_global_alex()
            .map(|a| a.is_known(token))
            .unwrap_or(false)
    }

    /// Fuzzy match a token, returns entity JSON or null
    #[wasm_bindgen(js_name = alexFuzzyMatch)]
    pub fn alex_fuzzy_match(token: &str) -> Option<String> {
        let alex = get_global_alex()?;
        let entity = alex.fuzzy_match(token)?;
        serde_json::to_string(&entity).ok()
    }

    /// Get all entities as JSON array
    #[wasm_bindgen(js_name = alexGetAllEntities)]
    pub fn alex_get_all_entities() -> String {
        let entities: Vec<crate::scanner::dafsa::types::EntityInfo> = get_global_alex()
            .map(|a| a.get_all_entities().into_iter().cloned().collect())
            .unwrap_or_default();

        serde_json::to_string(&entities).unwrap_or_else(|_| "[]".to_string())
    }

    /// Export entities as RegisteredEntity JSON array (for hydrating scanners)
    #[wasm_bindgen(js_name = alexToRegisteredEntities)]
    pub fn alex_to_registered_entities() -> String {
        let entities = get_global_alex()
            .map(|a| a.to_registered_entities())
            .unwrap_or_default();

        serde_json::to_string(&entities).unwrap_or_else(|_| "[]".to_string())
    }

    /// Add an entity to the global Alex and save
    /// Note: This requires rebuilding Alex from updated entity list
    #[wasm_bindgen(js_name = alexAddEntity)]
    pub async fn alex_add_entity(entity_json: &str) -> Result<bool, JsValue> {
        // Parse new entity
        let new_entity: RegisteredEntity = serde_json::from_str(entity_json)
            .map_err(|e| JsValue::from_str(&format!("JSON parse error: {}", e)))?;

        // Get existing entities and add new one
        let mut entities = get_global_alex()
            .map(|a| a.to_registered_entities())
            .unwrap_or_default();

        entities.push(new_entity);

        // Rebuild Alex
        let alex = Alex::build(&entities)
            .map_err(|e| JsValue::from_str(&format!("Build failed: {:?}", e)))?;

        set_global_alex(alex);

        // Save to OPFS
        let alex = get_global_alex().unwrap();
        save_alex(&alex).await
            .map_err(|e| JsValue::from_str(&format!("Save failed: {:?}", e)))?;

        Ok(true)
    }
}

// =============================================================================
// Native stub (for testing)
// =============================================================================

#[cfg(not(target_arch = "wasm32"))]
pub async fn save_alex(_alex: &Alex) -> Result<usize, AlexError> {
    Ok(0) // No-op on native
}

#[cfg(not(target_arch = "wasm32"))]
pub async fn load_alex() -> Result<Option<Alex>, AlexError> {
    Ok(None) // No-op on native
}

#[cfg(not(target_arch = "wasm32"))]
pub async fn delete_alex() -> Result<(), AlexError> {
    Ok(()) // No-op on native
}

#[cfg(not(target_arch = "wasm32"))]
pub async fn alex_exists() -> bool {
    false // No-op on native
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scanner::dafsa::types::{RegisteredEntity, EntityKind};

    fn make_entity(id: &str, label: &str) -> RegisteredEntity {
        RegisteredEntity {
            id: id.to_string(),
            label: label.to_string(),
            kind: EntityKind::CHARACTER,
            aliases: vec![],
            narrative_id: None,
        }
    }

    #[test]
    fn test_alex_round_trip_bytes() {
        // This test validates the serialization used by OPFS persistence
        let entities = vec![
            make_entity("e1", "Monkey D. Luffy"),
            make_entity("e2", "Roronoa Zoro"),
        ];

        let alex = Alex::build(&entities).expect("build");
        let bytes = alex.to_bytes().expect("serialize");
        let loaded = Alex::load(&bytes).expect("deserialize");

        assert_eq!(loaded.entity_count(), 2);
        assert!(loaded.is_known("Luffy"));
        assert!(loaded.is_known("Zoro"));
    }
}
