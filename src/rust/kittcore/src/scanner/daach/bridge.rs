//! WASM Bridge for DaachScanner
//! 
//! Provides the same interface as RustImplicitScanner but uses the
//! full-parity Aho-Corasick implementation from daach module.

use std::sync::Arc;
use super::{
    CompiledDictionary, RuntimeDictionary, ScannerCore, 
    compile_dictionary, set_global_dictionary,
    RegisteredEntity, EntityKind,
};
use crate::scanner::implicit::EntityDefinition;

use wasm_bindgen::prelude::*;

/// WASM wrapper for DaachScanner (full-parity AC scanner)
#[wasm_bindgen]
pub struct DaachScanner {
    core: Option<ScannerCore>,
    version: u64,
    entity_count: usize,
}

#[wasm_bindgen]
impl DaachScanner {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        web_sys::console::log_1(&"[DaachScanner] Created new instance".into());
        Self { core: None, version: 0, entity_count: 0 }
    }

    /// Hydrate from entity definitions (same interface as RustImplicitScanner)
    pub fn hydrate(&mut self, entities: JsValue) -> Result<(), JsValue> {
        web_sys::console::log_1(&"[DaachScanner:TRACE] hydrate() called".into());
        
        let defs: Vec<EntityDefinition> = serde_wasm_bindgen::from_value(entities)
            .map_err(|e| {
                web_sys::console::error_1(&format!("[DaachScanner:ERROR] Parse error: {:?}", e).into());
                JsValue::from_str(&format!("Failed to parse entities: {:?}", e))
            })?;
        
        web_sys::console::log_1(&format!("[DaachScanner:TRACE] Parsed {} entity definitions", defs.len()).into());
        
        // Log first 5 entities
        for (i, d) in defs.iter().take(5).enumerate() {
            web_sys::console::log_1(&format!("[DaachScanner:TRACE] Entity[{}]: id={}, label='{}', kind={}", i, d.id, d.label, d.kind).into());
        }
            
        // Convert to RegisteredEntity for compilation
        let registered: Vec<RegisteredEntity> = defs.into_iter().map(|d| RegisteredEntity {
            id: d.id,
            label: d.label,
            kind: match d.kind.as_str() {
                "CHARACTER" | "NPC" => EntityKind::CHARACTER,
                "PLACE" | "LOCATION" => EntityKind::PLACE,
                "FACTION" => EntityKind::FACTION,
                "ORGANIZATION" => EntityKind::ORGANIZATION,
                "ITEM" => EntityKind::ITEM,
                "EVENT" => EntityKind::EVENT,
                "CONCEPT" => EntityKind::CONCEPT,
                _ => EntityKind::OTHER,
            },
            aliases: d.aliases,
            narrative_id: d.narrative_id,
        }).collect();

        web_sys::console::log_1(&format!("[DaachScanner:TRACE] Compiling {} registered entities...", registered.len()).into());

        let compiled = compile_dictionary(&registered)
            .map_err(|e| {
                web_sys::console::error_1(&format!("[DaachScanner:ERROR] Compile error: {:?}", e).into());
                JsValue::from_str(&format!("Compilation failed: {:?}", e))
            })?;

        let runtime_dict = RuntimeDictionary::load(compiled)
            .map_err(|e| {
                web_sys::console::error_1(&format!("[DaachScanner:ERROR] Load error: {:?}", e).into());
                JsValue::from_str(&format!("Load failed: {:?}", e))
            })?;
        
        // SHARED MEMORY BRIDGE: Register dict globally
        let arc_dict = Arc::new(runtime_dict);
        set_global_dictionary(arc_dict.clone());
            
        self.core = Some(ScannerCore::new(arc_dict));
        self.version += 1;
        self.entity_count = registered.len();
        
        web_sys::console::log_1(&format!("[DaachScanner:TRACE] Hydration complete! version={}, entityCount={}", self.version, self.entity_count).into());
        
        Ok(())
    }

    /// Scan text for entity mentions
    #[wasm_bindgen]
    pub fn scan(&self, text: &str, narrative_id: Option<String>) -> JsValue {
        web_sys::console::log_1(&format!("[DaachScanner:TRACE] scan() called, textLen={}, narrativeId={:?}, hasCore={}", text.len(), narrative_id, self.core.is_some()).into());
        
        if let Some(core) = &self.core {
            let spans = core.scan(text, narrative_id.as_deref());
            web_sys::console::log_1(&format!("[DaachScanner:TRACE] Scan returned {} spans", spans.len()).into());
            
            // Log first 3 spans for debugging
            for (i, span) in spans.iter().take(3).enumerate() {
                web_sys::console::log_1(&format!("[DaachScanner:TRACE] Span[{}]: '{}' at {}..{} -> {}", 
                    i, span.matched_text, span.from, span.to, span.label).into());
            }
            
            serde_wasm_bindgen::to_value(&spans).unwrap_or(JsValue::NULL)
        } else {
            web_sys::console::warn_1(&"[DaachScanner:WARN] No core - returning NULL!".into());
            JsValue::NULL
        }
    }
    
    /// Get current version
    #[wasm_bindgen(getter)]
    pub fn version(&self) -> u64 {
        self.version
    }
    
    /// Get entity count
    #[wasm_bindgen(getter)]
    pub fn entity_count(&self) -> usize {
        self.entity_count
    }
}
