use super::dafsa::{CompiledDictionary, RuntimeDictionary, ScannerCore, compile_dictionary, DecorationSpan};
use super::implicit::EntityDefinition;
use crate::scanner::dafsa::{RegisteredEntity, EntityKind};
use wasm_bindgen::prelude::*;
use serde::{Serialize, Deserialize};

/// Wrapper to bridge ScanConductor to DAFSA scanner
#[wasm_bindgen]
pub struct RustImplicitScanner {
    core: Option<ScannerCore>,
    version: u64,
}

#[wasm_bindgen]
impl RustImplicitScanner {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self { core: None, version: 0 }
    }

    /// Hydrate from entity definitions
    pub fn hydrate(&mut self, entities: JsValue) -> Result<(), JsValue> {
        let defs: Vec<EntityDefinition> = serde_wasm_bindgen::from_value(entities)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse entities: {:?}", e)))?;
            
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
        }).collect();

        let compiled = compile_dictionary(
            self.version + 1,
            js_sys::Date::now() as u64,
            &registered
        ).map_err(|e| JsValue::from_str(&format!("Compilation failed: {:?}", e)))?;

        let runtime_dict = RuntimeDictionary::load(compiled)
            .map_err(|e| JsValue::from_str(&format!("Load failed: {:?}", e)))?;
            
        self.core = Some(ScannerCore::new(runtime_dict));
        self.version += 1;
        
        Ok(())
    }

    /// Scan text
    pub fn scan(&self, text: &str) -> JsValue {
        if let Some(core) = &self.core {
            let spans = core.scan(text);
            serde_wasm_bindgen::to_value(&spans).unwrap_or(JsValue::NULL)
        } else {
            JsValue::NULL
        }
    }
}
