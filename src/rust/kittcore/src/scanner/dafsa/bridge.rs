use std::sync::Arc;
use super::{CompiledDictionary, RuntimeDictionary, ScannerCore, compile_dictionary, DecorationSpan, set_global_dictionary};
use crate::scanner::implicit::EntityDefinition;
use super::{RegisteredEntity, EntityKind};

use wasm_bindgen::prelude::*;
use serde::{Serialize, Deserialize};

/// Wrapper to bridge ScanConductor to DAFSA scanner
#[wasm_bindgen]
pub struct RustImplicitScanner {
    core: Option<ScannerCore>,
    version: u64,
    entity_count: usize,
}

#[wasm_bindgen]
impl RustImplicitScanner {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self { core: None, version: 0, entity_count: 0 }
    }

    /// Hydrate from entity definitions
    pub fn hydrate(&mut self, entities: JsValue) -> Result<(), JsValue> {
        web_sys::console::log_1(&format!("[RustImplicitScanner:TRACE] hydrate() called").into());
        
        let defs: Vec<EntityDefinition> = serde_wasm_bindgen::from_value(entities)
            .map_err(|e| {
                web_sys::console::error_1(&format!("[RustImplicitScanner:TRACE] Parse error: {:?}", e).into());
                JsValue::from_str(&format!("Failed to parse entities: {:?}", e))
            })?;
        
        web_sys::console::log_1(&format!("[RustImplicitScanner:TRACE] Parsed {} entity definitions", defs.len()).into());
        
        // Log first 5 entities
        for (i, d) in defs.iter().take(5).enumerate() {
            web_sys::console::log_1(&format!("[RustImplicitScanner:TRACE] Entity[{}]: id={}, label='{}', kind={}", i, d.id, d.label, d.kind).into());
        }
            
        // Convert to RegisteredEntity for compilation
        let registered: Vec<RegisteredEntity> = defs.into_iter().map(|d| RegisteredEntity {
            id: d.id,
            label: d.label,
            kind: match d.kind.as_str() {
                "CHARACTER" => EntityKind::CHARACTER,
                "LOCATION" => EntityKind::LOCATION,
                "FACTION" => EntityKind::FACTION,
                "ORGANIZATION" => EntityKind::ORGANIZATION,
                "EVENT" => EntityKind::EVENT,
                "ITEM" => EntityKind::ITEM,
                "CONCEPT" => EntityKind::CONCEPT,
                "NPC" => EntityKind::NPC,
                _ => EntityKind::CUSTOM,
            },
            aliases: d.aliases,
            narrative_id: d.narrative_id,
        }).collect();

        web_sys::console::log_1(&format!("[RustImplicitScanner:TRACE] Compiling {} registered entities...", registered.len()).into());

        let compiled = compile_dictionary(
            self.version + 1,
            js_sys::Date::now() as u64,
            &registered
        ).map_err(|e| {
            web_sys::console::error_1(&format!("[RustImplicitScanner:TRACE] Compile error: {:?}", e).into());
            JsValue::from_str(&format!("Compilation failed: {:?}", e))
        })?;

        let runtime_dict = RuntimeDictionary::load(compiled)
            .map_err(|e| {
                web_sys::console::error_1(&format!("[RustImplicitScanner:TRACE] Load error: {:?}", e).into());
                JsValue::from_str(&format!("Load failed: {:?}", e))
            })?;
        
        // SHARED MEMORY BRIDGE: Register dict globally for Discovery Engine
        let arc_dict = Arc::new(runtime_dict);
        set_global_dictionary(arc_dict.clone());
            
        self.core = Some(ScannerCore::new(arc_dict));
        self.version += 1;
        self.entity_count = registered.len();
        
        web_sys::console::log_1(&format!("[RustImplicitScanner:TRACE] Hydration complete! version={}, entityCount={}", self.version, self.entity_count).into());
        
        Ok(())
    }

    /// Scan text
    #[wasm_bindgen]
    pub fn scan(&self, text: &str, narrative_id: Option<String>) -> JsValue {
        web_sys::console::log_1(&format!("[RustImplicitScanner:TRACE] scan() called, textLen={}, narrativeId={:?}, hasCore={}", text.len(), narrative_id, self.core.is_some()).into());
        
        if let Some(core) = &self.core {
            let spans = core.scan(text, narrative_id.as_deref());
            web_sys::console::log_1(&format!("[RustImplicitScanner:TRACE] Scan returned {} spans", spans.len()).into());
            serde_wasm_bindgen::to_value(&spans).unwrap_or(JsValue::NULL)
        } else {
            web_sys::console::warn_1(&"[RustImplicitScanner:TRACE] No core - returning NULL!".into());
            JsValue::NULL
        }
    }
}

