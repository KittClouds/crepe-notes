//! Narrative Dictionary - FST-based verb/event taxonomy for relation extraction
//!
//! Architecture:
//! - Static FST compiled from core verb list (embedded in binary)
//! - Mutable overlay HashMap for runtime additions
//! - Porter stemmer for verb normalization
//!
//! Based on the narrative ontology:
//! - f) Event taxonomy (meet, travel, discover, fight, betray, rescue)
//! - e) Relationships (kinship, romance, rivalry, membership)
//! - h) Causality & intent (enables, prevents, consequence-of)
//! - aj) Sense inventory (one surface verb → multiple relation IDs)

use std::collections::HashMap;
use fst::{Map, MapBuilder};
use rust_stemmers::{Algorithm, Stemmer};
use serde::{Deserialize, Serialize};

// ===========================================================================
// Event Classes (from verbdictionary.md section f)
// ===========================================================================

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[repr(u8)]
pub enum EventClass {
    // Core narrative events (f)
    Meet = 0,
    Travel = 1,
    Discovery = 2,
    Theft = 3,
    Battle = 4,
    Negotiation = 5,
    Betrayal = 6,
    Rescue = 7,
    Ritual = 8,
    Trial = 9,
    Duel = 10,
    Heist = 11,
    Chase = 12,
    Catastrophe = 13,
    Revelation = 14,
    Confession = 15,
    
    // Relationship events (e)
    Alliance = 20,
    Rivalry = 21,
    Romance = 22,
    Mentorship = 23,
    Command = 24,
    Membership = 25,
    Ownership = 26,
    
    // Causality (h)
    Enables = 30,
    Prevents = 31,
    ConsequenceOf = 32,
    Foreshadows = 33,
    
    // Dialogue acts (l)
    Promise = 40,
    Threat = 41,
    Accusation = 42,
    Bargain = 43,
    
    // Knowledge (k)
    Reveals = 50,
    Conceals = 51,
    Deceives = 52,
    
    // Catch-all
    Unknown = 255,
}

impl EventClass {
    pub fn from_id(id: u64) -> Self {
        match id {
            0 => Self::Meet,
            1 => Self::Travel,
            2 => Self::Discovery,
            3 => Self::Theft,
            4 => Self::Battle,
            5 => Self::Negotiation,
            6 => Self::Betrayal,
            7 => Self::Rescue,
            8 => Self::Ritual,
            9 => Self::Trial,
            10 => Self::Duel,
            11 => Self::Heist,
            12 => Self::Chase,
            13 => Self::Catastrophe,
            14 => Self::Revelation,
            15 => Self::Confession,
            20 => Self::Alliance,
            21 => Self::Rivalry,
            22 => Self::Romance,
            23 => Self::Mentorship,
            24 => Self::Command,
            25 => Self::Membership,
            26 => Self::Ownership,
            30 => Self::Enables,
            31 => Self::Prevents,
            32 => Self::ConsequenceOf,
            33 => Self::Foreshadows,
            40 => Self::Promise,
            41 => Self::Threat,
            42 => Self::Accusation,
            43 => Self::Bargain,
            50 => Self::Reveals,
            51 => Self::Conceals,
            52 => Self::Deceives,
            _ => Self::Unknown,
        }
    }
}

// ===========================================================================
// Relation Type (output of verb matching)
// ===========================================================================

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum RelationType {
    // Battle/Combat
    Attacks,
    Defeats,
    Fights,
    Kills,
    Wounds,
    
    // Social
    Allies,
    Betrays,
    Joins,
    Leaves,
    Commands,
    Follows,
    
    // Knowledge
    Reveals,
    Discovers,
    Conceals,
    Lies,
    
    // Movement
    Travels,
    Enters,
    Exits,
    Approaches,
    
    // Possession
    Owns,
    Steals,
    Gives,
    Takes,
    
    // Causality
    Causes,
    Prevents,
    Enables,
    
    // Dialogue
    Promises,
    Threatens,
    Accuses,
    Bargains,
    
    // Romance/Kinship
    Loves,
    Marries,
    Parents,
    
    // Generic
    Interacts,
}

// ===========================================================================
// Modality & Polarity (from verbdictionary.md ab, ac)
// ===========================================================================

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
pub enum Polarity {
    #[default]
    Positive,
    Negative,  // "did NOT attack"
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
pub enum Modality {
    #[default]
    Asserted,      // "attacked"
    Speculated,    // "might attack"
    Conditional,   // "would attack if..."
    Planned,       // "plans to attack"
}

// ===========================================================================
// Verb Match Result
// ===========================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerbMatch {
    pub event_class: EventClass,
    pub relation: RelationType,
    pub polarity: Polarity,
    pub modality: Modality,
    pub confidence: f32,
}

impl VerbMatch {
    pub fn new(event_class: EventClass, relation: RelationType) -> Self {
        Self {
            event_class,
            relation,
            polarity: Polarity::default(),
            modality: Modality::default(),
            confidence: 1.0,
        }
    }
}

// ===========================================================================
// Core Verb Entries (compiled to FST)
// ===========================================================================

/// Static verb entries: (stem, EventClass id, RelationType)
/// Sorted alphabetically for FST building
const VERB_ENTRIES: &[(&str, u64, RelationType)] = &[
    // Battle/Combat
    ("attack", 4, RelationType::Attacks),
    ("battl", 4, RelationType::Fights),      // stemmed: battle → battl
    ("defeat", 4, RelationType::Defeats),
    ("duel", 10, RelationType::Fights),
    ("fight", 4, RelationType::Fights),
    ("kill", 4, RelationType::Kills),
    ("slay", 4, RelationType::Kills),
    ("wound", 4, RelationType::Wounds),
    
    // Social
    ("alli", 20, RelationType::Allies),      // ally → alli
    ("betray", 6, RelationType::Betrays),    // betrayed → betray
    ("command", 24, RelationType::Commands),
    ("follow", 24, RelationType::Follows),
    ("join", 25, RelationType::Joins),
    ("leav", 25, RelationType::Leaves),      // leave → leav
    
    // Knowledge
    ("conceal", 51, RelationType::Conceals),
    ("discov", 2, RelationType::Discovers),  // discover → discov
    ("hid", 51, RelationType::Conceals),     // hide → hid
    ("li", 52, RelationType::Lies),          // lie → li (stem)
    ("reveal", 50, RelationType::Reveals),
    
    // Movement
    ("approach", 1, RelationType::Approaches),
    ("enter", 1, RelationType::Enters),
    ("exit", 1, RelationType::Exits),
    ("sail", 1, RelationType::Travels),
    ("travel", 1, RelationType::Travels),
    
    // Possession
    ("give", 26, RelationType::Gives),
    ("own", 26, RelationType::Owns),
    ("steal", 3, RelationType::Steals),
    ("take", 26, RelationType::Takes),
    
    // Causality
    ("caus", 30, RelationType::Causes),      // cause → caus
    ("enabl", 30, RelationType::Enables),    // enable → enabl
    ("prevent", 31, RelationType::Prevents),
    
    // Dialogue
    ("accus", 42, RelationType::Accuses),    // accuse → accus
    ("bargain", 43, RelationType::Bargains),
    ("promis", 40, RelationType::Promises),  // promise → promis
    ("threaten", 41, RelationType::Threatens),
    
    // Romance/Kinship
    ("love", 22, RelationType::Loves),
    ("marri", 22, RelationType::Marries),    // marry → marri
    
    // Rescue/Help
    ("rescu", 7, RelationType::Interacts),   // rescue → rescu
    ("sav", 7, RelationType::Interacts),     // save → sav
    
    // Meeting
    ("meet", 0, RelationType::Interacts),
    ("encount", 0, RelationType::Interacts), // encounter → encount
];

// ===========================================================================
// Narrative Matcher (FST + Overlay)
// ===========================================================================

pub struct NarrativeMatcher {
    /// Compiled FST for O(1) lookup
    fst: Map<Vec<u8>>,
    
    /// Mutable overlay for runtime additions
    overlay: HashMap<String, VerbMatch>,
    
    /// Porter stemmer for verb normalization
    stemmer: Stemmer,
    
    /// Relation lookup by FST value
    relation_map: Vec<VerbMatch>,
}

impl NarrativeMatcher {
    /// Create matcher with embedded verb dictionary
    pub fn new() -> Self {
        // Sort entries for FST (must be sorted)
        let mut sorted_entries: Vec<(&str, u64, RelationType)> = VERB_ENTRIES.iter()
            .map(|(s, e, r)| (*s, *e, *r))
            .collect();
        sorted_entries.sort_by_key(|(stem, _, _)| *stem);
        
        // Build FST
        let mut builder = MapBuilder::memory();
        let mut relation_map = Vec::new();
        
        for (i, (stem, event_id, relation)) in sorted_entries.iter().enumerate() {
            builder.insert(stem.as_bytes(), i as u64).unwrap();
            relation_map.push(VerbMatch::new(
                EventClass::from_id(*event_id),
                *relation,
            ));
        }
        
        let fst_bytes = builder.into_inner().unwrap();
        let fst = Map::new(fst_bytes).unwrap();
        
        Self {
            fst,
            overlay: HashMap::new(),
            stemmer: Stemmer::create(Algorithm::English),
            relation_map,
        }
    }
    
    /// Stem a verb to its root form
    pub fn stem(&self, word: &str) -> String {
        self.stemmer.stem(&word.to_lowercase()).to_string()
    }
    
    /// Look up a verb and return its event/relation match
    pub fn lookup(&self, surface_verb: &str) -> Option<VerbMatch> {
        let stemmed = self.stem(surface_verb);
        
        // 1. Check overlay first (user additions/overrides)
        if let Some(m) = self.overlay.get(&stemmed) {
            return Some(m.clone());
        }
        
        // 2. FST lookup
        if let Some(id) = self.fst.get(&stemmed) {
            return self.relation_map.get(id as usize).cloned();
        }
        
        None
    }
    
    /// Add a verb to the runtime overlay
    pub fn add_verb(&mut self, surface_verb: &str, event_class: EventClass, relation: RelationType) {
        let stemmed = self.stem(surface_verb);
        self.overlay.insert(stemmed, VerbMatch::new(event_class, relation));
    }
    
    /// Get current overlay size (for debugging)
    pub fn overlay_size(&self) -> usize {
        self.overlay.len()
    }
    
    /// Get FST dictionary size
    pub fn dictionary_size(&self) -> usize {
        self.relation_map.len()
    }
}

impl Default for NarrativeMatcher {
    fn default() -> Self {
        Self::new()
    }
}

// ===========================================================================
// Tests
// ===========================================================================

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_stemming() {
        let matcher = NarrativeMatcher::new();
        assert_eq!(matcher.stem("attacked"), "attack");
        assert_eq!(matcher.stem("attacks"), "attack");
        assert_eq!(matcher.stem("attacking"), "attack");
        assert_eq!(matcher.stem("defeats"), "defeat");
        assert_eq!(matcher.stem("betrayed"), "betray");
    }
    
    #[test]
    fn test_lookup_attack() {
        let matcher = NarrativeMatcher::new();
        
        let result = matcher.lookup("attacked");
        assert!(result.is_some());
        let m = result.unwrap();
        assert_eq!(m.event_class, EventClass::Battle);
        assert_eq!(m.relation, RelationType::Attacks);
    }
    
    #[test]
    fn test_lookup_betray() {
        let matcher = NarrativeMatcher::new();
        
        let result = matcher.lookup("betrayed");
        assert!(result.is_some());
        let m = result.unwrap();
        assert_eq!(m.event_class, EventClass::Betrayal);
        assert_eq!(m.relation, RelationType::Betrays);
    }
    
    #[test]
    fn test_overlay() {
        let mut matcher = NarrativeMatcher::new();
        
        // Add a domain-specific verb
        matcher.add_verb("plunder", EventClass::Theft, RelationType::Steals);
        
        let result = matcher.lookup("plundered");
        assert!(result.is_some());
        assert_eq!(result.unwrap().relation, RelationType::Steals);
    }
    
    #[test]
    fn test_unknown_verb() {
        let matcher = NarrativeMatcher::new();
        let result = matcher.lookup("xyzzy");
        assert!(result.is_none());
    }
}
