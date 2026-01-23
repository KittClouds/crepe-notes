//! Fuzzy matching algorithms for entity name matching
//!
//! Provides Damerau-Levenshtein distance and token matching utilities
//! used by both Alex (Librarian) and the DaachScanner (Hunter).
//!
//! # Algorithms
//! - `damerau_levenshtein(a, b)` - Full DL distance calculation
//! - `dl_within(a, b, max)` - Early-exit check if DL distance ≤ max
//! - `tok_match(a, b)` - Token matching with adaptive threshold
//! - `find_matching_anchors(token, anchors)` - Scan anchors for fuzzy matches

use std::collections::BTreeMap;

/// Minimum anchor length for fuzzy matching
pub const MIN_ANCHOR_LEN: usize = 3;

/// Minimum token length for fuzzy matching (typo tolerance)
pub const MIN_FUZZY_LEN: usize = 4;

/// Maximum string length for fuzzy matching (safety cutoff)
pub const MAX_STRING_LEN: usize = 32;

/// Calculate Damerau-Levenshtein distance between two strings.
/// 
/// Returns the edit distance allowing:
/// - Insertions (cost 1)
/// - Deletions (cost 1)
/// - Substitutions (cost 1)
/// - Transpositions of adjacent characters (cost 1)
/// 
/// Returns None if either string exceeds MAX_STRING_LEN (performance safety).
pub fn damerau_levenshtein(a: &str, b: &str) -> Option<usize> {
    if a == b { return Some(0); }
    
    let la = a.chars().count();
    let lb = b.chars().count();
    
    if la > MAX_STRING_LEN || lb > MAX_STRING_LEN { return None; }
    
    let a_chars: Vec<char> = a.chars().collect();
    let b_chars: Vec<char> = b.chars().collect();
    
    let mut dp = vec![vec![0; lb + 1]; la + 1];

    for i in 0..=la { dp[i][0] = i; }
    for j in 0..=lb { dp[0][j] = j; }

    for i in 1..=la {
        for j in 1..=lb {
            let cost = if a_chars[i-1] == b_chars[j-1] { 0 } else { 1 };
            
            let mut v = (dp[i-1][j] + 1)
                .min(dp[i][j-1] + 1)
                .min(dp[i-1][j-1] + cost);

            // Transposition
            if i > 1 && j > 1 && a_chars[i-1] == b_chars[j-2] && a_chars[i-2] == b_chars[j-1] {
                v = v.min(dp[i-2][j-2] + 1);
            }

            dp[i][j] = v;
        }
    }

    Some(dp[la][lb])
}

/// Check if Damerau-Levenshtein distance is within threshold.
/// 
/// Optimized early-exit version that stops computation if any row's
/// minimum exceeds the threshold.
/// 
/// # Arguments
/// * `a` - First string
/// * `b` - Second string  
/// * `max` - Maximum acceptable distance
/// 
/// # Returns
/// `true` if DL distance ≤ max, `false` otherwise
pub fn dl_within(a: &str, b: &str, max: usize) -> bool {
    if a == b { return true; }
    
    let la = a.chars().count();
    let lb = b.chars().count();
    
    // Quick length check
    if la.abs_diff(lb) > max { return false; }
    
    // Safety cutoff for very long strings
    if la > MAX_STRING_LEN || lb > MAX_STRING_LEN { return false; }

    let a_chars: Vec<char> = a.chars().collect();
    let b_chars: Vec<char> = b.chars().collect();
    
    let mut dp = vec![vec![0; lb + 1]; la + 1];

    for i in 0..=la { dp[i][0] = i; }
    for j in 0..=lb { dp[0][j] = j; }

    for i in 1..=la {
        let mut row_min = usize::MAX;
        for j in 1..=lb {
            let cost = if a_chars[i-1] == b_chars[j-1] { 0 } else { 1 };
            
            let mut v = (dp[i-1][j] + 1)
                .min(dp[i][j-1] + 1)
                .min(dp[i-1][j-1] + cost);

            // Transposition
            if i > 1 && j > 1 && a_chars[i-1] == b_chars[j-2] && a_chars[i-2] == b_chars[j-1] {
                v = v.min(dp[i-2][j-2] + 1);
            }

            dp[i][j] = v;
            row_min = row_min.min(v);
        }
        // Early exit: if entire row exceeds threshold, no path can succeed
        if row_min > max { return false; }
    }

    dp[la][lb] <= max
}

/// Token matching with adaptive threshold.
/// 
/// Uses stricter matching for short tokens:
/// - Length ≤ 5: Allow 1 edit
/// - Length > 5: Allow 2 edits
/// 
/// Also requires:
/// - Both tokens must be at least 4 chars (MIN_FUZZY_LEN)
/// - First character must match (common typos don't change first char)
/// - Length difference ≤ 2
pub fn tok_match(a: &str, b: &str) -> bool {
    if a == b { return true; }
    
    // Minimum length requirement
    if a.len() < MIN_FUZZY_LEN || b.len() < MIN_FUZZY_LEN { return false; }
    
    // First character must match (heuristic: typos rarely affect first char)
    let a_first = a.chars().next();
    let b_first = b.chars().next();
    if a_first != b_first { return false; }
    
    // Length difference check
    if a.len().abs_diff(b.len()) > 2 { return false; }
    
    // Adaptive threshold based on length
    let max = if a.len().max(b.len()) <= 5 { 1 } else { 2 };
    
    dl_within(a, b, max)
}

/// Simplified token match without first-char requirement.
/// 
/// Used when caller has already normalized and filtered tokens.
pub fn tok_match_simple(a: &str, b: &str) -> bool {
    if a == b { return true; }
    let max = if a.len().max(b.len()) <= 5 { 1 } else { 2 };
    dl_within(a, b, max)
}

/// Find anchors in a BTreeMap that fuzzy-match the given token.
/// 
/// Optimized with start-character filtering: only checks anchors
/// starting with the same character as the token.
/// 
/// # Arguments
/// * `token` - Token to match (should be normalized/lowercase)
/// * `anchor_to_ids` - Map of anchor tokens to entity IDs
/// 
/// # Returns
/// Vector of matching anchor keys
pub fn find_matching_anchors<V>(token: &str, anchor_to_ids: &BTreeMap<String, V>) -> Vec<String> {
    if token.len() < MIN_FUZZY_LEN { return vec![]; }
    
    let mut matches = Vec::new();
    let start_char = match token.chars().next() {
        Some(c) => c,
        None => return vec![],
    };
    
    // Optimization: only check anchors with same start character
    for anchor in anchor_to_ids.keys() {
        if !anchor.starts_with(start_char) { continue; }
        if tok_match(token, anchor) {
            matches.push(anchor.clone());
        }
    }
    
    matches
}

/// Strip possessive suffixes from a token.
/// 
/// Removes "'s" or "s'" from the end of a word.
pub fn strip_possessive(tok: &str) -> &str {
    tok.strip_suffix("'s")
        .or_else(|| tok.strip_suffix("s'"))
        .unwrap_or(tok)
}

// ---- Tests ----

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_damerau_levenshtein() {
        // Identical strings
        assert_eq!(damerau_levenshtein("hello", "hello"), Some(0));
        
        // Single substitution
        assert_eq!(damerau_levenshtein("hello", "hallo"), Some(1));
        
        // Transposition
        assert_eq!(damerau_levenshtein("ab", "ba"), Some(1));
        assert_eq!(damerau_levenshtein("hello", "hlelo"), Some(1));
        
        // Insertion
        assert_eq!(damerau_levenshtein("helo", "hello"), Some(1));
        
        // Deletion
        assert_eq!(damerau_levenshtein("hello", "helo"), Some(1));
        
        // Multiple edits
        assert_eq!(damerau_levenshtein("kitten", "sitting"), Some(3));
    }
    
    #[test]
    fn test_dl_within() {
        assert!(dl_within("hello", "hello", 0));
        assert!(dl_within("hello", "hallo", 1));
        assert!(!dl_within("hello", "hallo", 0));
        assert!(dl_within("luffy", "luffu", 1));
        assert!(dl_within("zoroo", "zoro", 1));
    }
    
    #[test]
    fn test_tok_match() {
        // Exact match
        assert!(tok_match("luffy", "luffy"));
        
        // Typo (1 char)
        assert!(tok_match("luffy", "luffu"));
        assert!(tok_match("zoroo", "zoro"));
        
        // First char mismatch should fail
        assert!(!tok_match("luffy", "muffy"));
        
        // Too short
        assert!(!tok_match("abc", "abd"));
        
        // Length difference > 2
        assert!(!tok_match("hello", "helloworld"));
    }
    
    #[test]
    fn test_strip_possessive() {
        assert_eq!(strip_possessive("Luffy's"), "Luffy");
        assert_eq!(strip_possessive("James'"), "James");
        assert_eq!(strip_possessive("Zoro"), "Zoro");
    }
    
    #[test]
    fn test_find_matching_anchors() {
        let mut anchors: BTreeMap<String, Vec<String>> = BTreeMap::new();
        anchors.insert("luffy".to_string(), vec!["e1".to_string()]);
        anchors.insert("zoro".to_string(), vec!["e2".to_string()]);
        anchors.insert("sanji".to_string(), vec!["e3".to_string()]);
        
        // Exact match
        let matches = find_matching_anchors("luffy", &anchors);
        assert_eq!(matches, vec!["luffy".to_string()]);
        
        // Typo match
        let matches = find_matching_anchors("luffu", &anchors);
        assert_eq!(matches, vec!["luffy".to_string()]);
        
        // No match (wrong first char)
        let matches = find_matching_anchors("muffy", &anchors);
        assert!(matches.is_empty());
    }
}
