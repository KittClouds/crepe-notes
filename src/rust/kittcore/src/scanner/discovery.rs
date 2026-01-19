use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use serde::{Deserialize, Serialize};
use super::dafsa::compiler::is_stop_word;
use crate::resorank::math::calculate_idf;
use super::dafsa::types::EntityKind;
use stop_words::{get, LANGUAGE};

// =============================================================================
// Types
// =============================================================================

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct CanonToken(pub Arc<str>);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum CandidateStatus {
    Watching, // Seen a few times, tracking
    Promoted, // Crossed threshold, ready for UI
    Ignored,  // Explicitly ignored (stopword or user rejection)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CandidateStats {
    pub count: u32,
    pub status: CandidateStatus,
    pub inferred_kind: Option<EntityKind>,
    pub display: String, // Best human form seen so far
}

impl Default for CandidateStats {
    fn default() -> Self {
        Self {
            count: 0,
            status: CandidateStatus::Watching,
            inferred_kind: None,
            display: String::new(),
        }
    }
}

// =============================================================================
// Canonicalization
// =============================================================================

fn canonicalize(raw: &str) -> Option<(CanonToken, String)> {
    // 1) Trim “edge punctuation” but keep internal '-' and '\''.
    let trimmed = raw.trim_matches(|c: char| {
        !(c.is_alphanumeric() || c == '\'' || c == '’' || c == '-' )
    });

    if trimmed.is_empty() {
        return None;
    }

    // 2) Normalize curly apostrophe -> straight apostrophe
    let mut cleaned = trimmed.replace('’', "'");

    // 3) Strip possessive trailing "'s"
    if cleaned.len() > 2 && cleaned.to_ascii_lowercase().ends_with("'s") {
        cleaned.truncate(cleaned.len() - 2);
    }

    // 4) Reject obvious junk
    let has_alpha = cleaned.chars().any(|c| c.is_alphabetic());
    if !has_alpha || cleaned.len() < 2 {
        return None;
    }

    // Key: case-folded; Display: cleaned original-ish
    let key = cleaned.to_ascii_lowercase();
    Some((CanonToken(Arc::<str>::from(key)), cleaned))
}

// =============================================================================
// Registry
// =============================================================================

pub struct CandidateRegistry {
    pub stats: HashMap<CanonToken, CandidateStats>,
    pub promotion_threshold: u32,
    pub stopwords: HashSet<String>,
}

impl CandidateRegistry {
    pub fn new(promotion_threshold: u32) -> Self {
        // Initialize with standard English stop words
        let mut stopwords = HashSet::new();
        for word in get(LANGUAGE::English) {
            stopwords.insert(word);
        }

        Self {
            stats: HashMap::new(),
            promotion_threshold,
            stopwords,
        }
    }

    /// Add a custom stopword to be ignored
    pub fn add_stopword(&mut self, word: &str) {
        self.stopwords.insert(word.to_lowercase());
    }

    /// Helper to get stats by raw token (canonicalizes internally)
    pub fn get_stats(&self, token: &str) -> Option<&CandidateStats> {
        canonicalize(token).and_then(|(key, _)| self.stats.get(&key))
    }

    /// Process a token. Returns true if the token was promoted *this time*.
    pub fn add_token(&mut self, token: &str) -> bool {
        let (key, display) = match canonicalize(token) {
            Some(v) => v,
            None => return false,
        };
        
        // 1. Check built-in stopword list OR custom list
        if is_stop_word(&key.0) || self.stopwords.contains(&*key.0) {
            return false;
        }

        // 2. Update stats
        let entry = self.stats.entry(key).or_default();
        
        // If already ignored/promoted, just increment count
        if entry.status != CandidateStatus::Watching {
            entry.count += 1;
            return false;
        }

        // Set display if empty (first time)
        if entry.display.is_empty() {
            entry.display = display;
        }

        entry.count += 1;

        // 3. Check threshold
        if entry.count >= self.promotion_threshold {
            entry.status = CandidateStatus::Promoted;
            return true;
        }

        false
    }
    
    pub fn get_status(&self, token: &str) -> Option<CandidateStatus> {
        self.get_stats(token).map(|s| s.status)
    }
    
    pub fn get_count(&self, token: &str) -> u32 {
        self.get_stats(token).map(|s| s.count).unwrap_or(0)
    }

    pub fn get_inferred_kind(&self, token: &str) -> Option<EntityKind> {
        self.get_stats(token).and_then(|s| s.inferred_kind)
    }

    /// Calculate uniqueness score (TF-IDF style)
    /// High score = Strong candidate (Rare word appearing frequently locally)
    pub fn calculate_candidate_score(term_freq: u32, doc_freq: usize, total_docs: usize) -> f32 {
        let idf = calculate_idf(total_docs as f32, doc_freq);
        (term_freq as f32) * idf
    }

    /// Update the inferred kind for a candidate
    pub fn propose_inference(&mut self, token: &str, kind: EntityKind) {
        if let Some((key, _)) = canonicalize(token) {
            if let Some(entry) = self.stats.get_mut(&key) {
                if entry.inferred_kind.is_none() {
                    entry.inferred_kind = Some(kind);
                }
            }
        }
    }
}
// ... (Tests) ...

// ... (RelationalScanner) ...

// ... (DiscoveryEngine) ...


// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_candidate_registry_add() {
        let mut registry = CandidateRegistry::new(10);
        
        registry.add_token("Sanji");
        assert_eq!(registry.get_count("Sanji"), 1);
        assert_eq!(registry.get_status("Sanji"), Some(CandidateStatus::Watching));

        registry.add_token("Sanji");
        assert_eq!(registry.get_count("Sanji"), 2);
    }

    #[test]
    fn test_candidate_threshold() {
        let mut registry = CandidateRegistry::new(3);

        // 1
        let promoted = registry.add_token("Sanji");
        assert!(!promoted);
        
        // 2
        let promoted = registry.add_token("Sanji");
        assert!(!promoted);
        
        // 3 -> Promote!
        let promoted = registry.add_token("Sanji");
        assert!(promoted);
        assert_eq!(registry.get_status("Sanji"), Some(CandidateStatus::Promoted));
    }
    
    #[test]
    fn test_harvester_ignores_stopwords() {
        let mut registry = CandidateRegistry::new(1);
        
        // "the" is in the built-in compiler.rs list
        let promoted = registry.add_token("The"); 
        assert!(!promoted);
        assert!(registry.get_status("The").is_none());
        
        // "Then" and "However" describe "noise", but aren't in the specialized compiler.rs list yet.
        // We add them manually to verify the custom stopword logic works alongside the built-in one.
        registry.add_stopword("then");
        registry.add_stopword("however");

        let promoted = registry.add_token("Then");
        assert!(!promoted);
        assert!(registry.get_status("Then").is_none());

        let promoted = registry.add_token("However");
        assert!(!promoted);

        // "Wano" should pass
        let promoted = registry.add_token("Wano");
        assert!(promoted); // Threshold 1
        assert_eq!(registry.get_status("Wano"), Some(CandidateStatus::Promoted));
    }

    #[test]
    fn test_calculate_candidate_score() {
        // Total stats
        let total_docs = 1000;
        
        // "Sanji" - Rare globally (10 docs), Frequent locally (5 times)
        let sanji_doc_freq = 10;
        let sanji_local_freq = 5;
        let sanji_score = CandidateRegistry::calculate_candidate_score(sanji_local_freq, sanji_doc_freq, total_docs);

        // "Table" - Common globally (500 docs), Frequent locally (5 times)
        let table_doc_freq = 500;
        let table_local_freq = 5;
        let table_score = CandidateRegistry::calculate_candidate_score(table_local_freq, table_doc_freq, total_docs);

        // Sanji should have a much higher score because it serves as a better unique identifier
        println!("Sanji Score: {}, Table Score: {}", sanji_score, table_score);
        assert!(sanji_score > table_score);
        
        // Verify IDF component behavior
        assert!(sanji_score > 20.0);
        assert!(table_score < 5.0);
    }

    #[test]
    fn test_discovery_engine_integration() {
        let mut engine = DiscoveryEngine::new(2);

        // 1. Harvester: Observe "Kaido"
        engine.observe_token("Kaido");
        assert_eq!(engine.registry.get_count("Kaido"), 1);
        
        // 2. Virus: "Luffy (Char) fought (Combat) Kaido"
        // Should infer Kaido is a Character
        engine.observe_relation(EntityKind::CHARACTER, "fought", "Kaido");
        
        // Check inference
        // Kaido should be in registry (from step 1), and now inferred as Character
        if let Some(stats) = engine.registry.get_stats("Kaido") {
            assert_eq!(stats.inferred_kind, Some(EntityKind::CHARACTER));
        } else {
            panic!("Kaido not found in registry");
        }
        
        // 3. Promote
        engine.observe_token("Kaido");
        assert_eq!(engine.registry.get_status("Kaido"), Some(CandidateStatus::Promoted));
    }
}

// =============================================================================
// Phase 2: Relational Scanner (The Virus)
// =============================================================================

use super::verb_morphology::{VerbLexicon, VerbDomain};

// =============================================================================
// Phase 2: Relational Scanner (The Virus)
// =============================================================================

pub struct RelationalScanner {
    lexicon: VerbLexicon,
    // (Source, Verb) -> Map<Target, Count>
    // Tracks how often a Source type + Verb leads to a specific Target type
    pattern_stats: HashMap<(EntityKind, VerbDomain), HashMap<EntityKind, u32>>,
}

impl RelationalScanner {
    pub fn new() -> Self {
        Self {
            lexicon: VerbLexicon::new(),
            pattern_stats: HashMap::new(),
        }
    }
    
    pub fn identify_verb(&self, token: &str) -> Option<VerbDomain> {
        self.lexicon.get_domain(token)
    }

    /// Record a confirmed pattern (e.g. from explicit scanner results) to reinforce learning
    pub fn observe_pattern(&mut self, source: EntityKind, verb: VerbDomain, target: EntityKind) {
        let entry = self.pattern_stats.entry((source, verb)).or_default();
        *entry.entry(target).or_insert(0) += 1;
    }

    /// Infer the entity kind of the target based on the source and the connecting verb
    /// Prioritizes learned patterns, falls back to static rules.
    pub fn infer_target(&self, source_kind: EntityKind, verb: VerbDomain) -> Option<EntityKind> {
        // 1. Check Learned Statistics
        if let Some(targets) = self.pattern_stats.get(&(source_kind, verb)) {
            // Find the most frequent target type
            // Simple heuristic: If count > 0, use it. Ideally we want a confidence threshold.
            if let Some((best_kind, _count)) = targets.iter().max_by_key(|&(_, count)| count) {
                return Some(*best_kind);
            }
        }

        // 2. Fallback to Static Heuristics
        match (source_kind, verb) {
            // Characters usually fight/talk/love other Characters
            (EntityKind::CHARACTER, VerbDomain::Combat) => Some(EntityKind::CHARACTER),
            (EntityKind::CHARACTER, VerbDomain::Social) => Some(EntityKind::CHARACTER),
            (EntityKind::CHARACTER, VerbDomain::Communication) => Some(EntityKind::CHARACTER),
            
            // Characters move to Locations
            (EntityKind::CHARACTER, VerbDomain::Movement) => Some(EntityKind::LOCATION),
            
            // Factions fight Factions
            (EntityKind::FACTION, VerbDomain::Combat) => Some(EntityKind::FACTION),
            
            _ => None,
        }
    }
}

#[cfg(test)]
mod relational_tests {
    use super::*;

    #[test]
    fn test_identify_connector_verbs() {
        let scanner = RelationalScanner::new();
        
        // "fought" -> Combat
        // In verb_morphology.rs: VerbEntry::irregular("fight", "fought", "fought", "FOUGHT", VerbDomain::Combat)
        assert_eq!(scanner.identify_verb("fought"), Some(VerbDomain::Combat));
        
        // "loves" -> Social
        // VerbEntry::e_ending("love", "LOVES", VerbDomain::Social)
        assert_eq!(scanner.identify_verb("loves"), Some(VerbDomain::Social));
        
        // "banana" -> None
        assert_eq!(scanner.identify_verb("banana"), None);
    }

    #[test]
    fn test_infer_target_from_source() {
        let scanner = RelationalScanner::new();

        // Pattern: [Character] fought [?]
        // Inference: [?] is likely a Character
        assert_eq!(
            scanner.infer_target(EntityKind::CHARACTER, VerbDomain::Combat),
            Some(EntityKind::CHARACTER)
        );

        // Pattern: [Character] went to [?]
        // Inference: [?] is likely a Location
        assert_eq!(
            scanner.infer_target(EntityKind::CHARACTER, VerbDomain::Movement),
            Some(EntityKind::LOCATION)
        );

        // Pattern: [Faction] attacked [?]
        // Inference: [?] is likely a Faction
        assert_eq!(
            scanner.infer_target(EntityKind::FACTION, VerbDomain::Combat),
            Some(EntityKind::FACTION)
        );
    }

    #[test]
    fn test_reinforce_pattern() {
        let mut scanner = RelationalScanner::new();

        // Let's say we have a weird world where "Communication" implies "Item" 
        // (e.g. "Luffy spoke to the [Magic Shell]")
        // Static rule says "Character -> Communication -> Character"
        assert_eq!(
            scanner.infer_target(EntityKind::CHARACTER, VerbDomain::Communication),
            Some(EntityKind::CHARACTER)
        );

        // Observe the weird pattern 5 times
        for _ in 0..5 {
            scanner.observe_pattern(EntityKind::CHARACTER, VerbDomain::Communication, EntityKind::ITEM);
        }

        // Now the scanner should learn that in this context, they talk to items
        assert_eq!(
            scanner.infer_target(EntityKind::CHARACTER, VerbDomain::Communication),
            Some(EntityKind::ITEM)
        );
    }
}

// =============================================================================
// Phase 3: Discovery Engine (The Orchestrator)
// =============================================================================

pub struct DiscoveryEngine {
    pub registry: CandidateRegistry,
    pub scanner: RelationalScanner,
}

impl DiscoveryEngine {
    pub fn new(threshold: u32) -> Self {
        Self {
            registry: CandidateRegistry::new(threshold),
            scanner: RelationalScanner::new(),
        }
    }

    /// Flavor 1: Observe tokens for statistical prominence
    pub fn observe_token(&mut self, token: &str) {
        self.registry.add_token(token);
    }

    /// Flavor 2: Observe relations to bootstrap unknown entities
    /// source -> verb -> target_token (unknown)
    pub fn observe_relation(&mut self, source_kind: EntityKind, verb_token: &str, target_token: &str) {
        // 1. Identify verb
        if let Some(domain) = self.scanner.identify_verb(verb_token) {
            // 2. Infer target kind
            if let Some(inferred_kind) = self.scanner.infer_target(source_kind, domain) {
                // 3. Update registry if the token is already being tracked
                self.registry.propose_inference(target_token, inferred_kind);
            }
        }
    }

    /// Scan text for "Virus" patterns (Source -> Verb -> Target)
    /// This assumes tokens have already been observed via observe_token (or we can do it here too).
    pub fn scan_text_for_relations(&mut self, text: &str) {
        // Simple whitespace tokenizer for now
        let tokens: Vec<&str> = text.split_whitespace().collect();
        if tokens.len() < 3 {
             return;
        }

        for i in 0..tokens.len() - 2 {
            let source_token = tokens[i];
            let verb_token = tokens[i+1];
            let target_token = tokens[i+2];

            // 1. Check if Source is a Known Entity (Promoted + Has Kind)
            if let Some(status) = self.registry.get_status(source_token) {
                if status == CandidateStatus::Promoted {
                    if let Some(source_kind) = self.registry.get_inferred_kind(source_token) {
                        
                        // 2. Check if Target candidate looks like an entity (Capitalized)
                        // Heuristic: Must start with uppercase
                        if target_token.chars().next().map_or(false, |c| c.is_uppercase()) {
                             
                             // 3. Observe the potential relation
                             // Logic inside observe_relation will validate the verb
                             self.observe_relation(source_kind, verb_token, target_token);
                        }
                    }
                }
            }
        }
    }
}

