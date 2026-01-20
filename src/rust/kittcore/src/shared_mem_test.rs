
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

        // 2. Scan text: "Luffy vs Zoro"
        // "Luffy" is known -> Should be ignored
        // "Zoro" is new -> Should be observed
        let text = "Luffy vs Zoro";
        
        // We need to run scan multiply times to trigger promotion if we want it in the output?
        // DiscoveryEngine default promotion threshold is 3. 
        // However, scan_shared logic for packing results iterates active_keys and checks stats.
        // It returns candidates even if count is 1 (Watching status), unless Ignored.
        // Let's verify shared_mem.rs:125: "if stats.status != CandidateStatus::Ignored"
        // So yes, it returns Watching.

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
