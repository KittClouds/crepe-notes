//! Text normalization utilities for entity name processing
//!
//! Provides consistent normalization, tokenization, and stop word handling
//! used by Alex (Librarian), DaachScanner (Hunter), and DAFSA compiler.
//!
//! # Functions
//! - `normalize_raw(s)` - Normalize text for matching (lowercase, ascii-ify)
//! - `tokenize(s)` - Split normalized text into tokens
//! - `tokenize_norm(s)` - Normalize and tokenize in one step
//! - `is_stop_word(tok)` - Check if token is a stop word
//! - `phrase_key(surface)` - Generate FST-compatible phrase key

/// Maximum tokens in a phrase key (for FST)
pub const MAX_PHRASE_TOKENS: usize = 4;

/// Token separator character for FST phrase keys
pub const TOK_SEP: char = '\u{0001}';

/// Stop words to filter from tokenization
/// Includes titles, articles, prepositions, and common function words
const STOP_WORDS: &[&str] = &[
    // Titles
    "mr", "mrs", "ms", "dr", "prof", "sir", "lady", "lord", "king", "queen",
    // Articles & prepositions
    "the", "of", "and", "a", "an", "to", "in", "on", "for", "at", "by",
    // Common verbs/function words
    "is", "it", "as", "be", "was", "are", "been", "with", "from", "into",
    // Pronouns/determiners
    "that", "this", "has", "have", "had", "his", "her", "its", "their",
    // Common nouns that shouldn't be unique identifiers  
    "sun", "hat", "hair", "red", "blue", "one", "two", "big", "old", "new",
    "force", "star", "moon", "sea", "sky", "ship", "world", "giant", "giants",
];

/// Check if a token is a stop word.
/// 
/// Stop words are filtered during tokenization to reduce noise.
#[inline]
pub fn is_stop_word(tok: &str) -> bool {
    STOP_WORDS.contains(&tok)
}

/// Normalize raw text for entity matching.
/// 
/// Normalization rules:
/// 1. Convert to lowercase
/// 2. Replace curly apostrophe (') with straight apostrophe (')
/// 3. Keep only alphanumeric, apostrophe, and whitespace
/// 4. Replace other characters with space
/// 5. Collapse multiple spaces
/// 
/// # Examples
/// ```ignore
/// assert_eq!(normalize_raw("Monkey D. Luffy"), "monkey d luffy");
/// assert_eq!(normalize_raw("O'Brien"), "o'brien");
/// assert_eq!(normalize_raw("Café—Noir"), "caf noir");
/// ```
pub fn normalize_raw(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    
    for ch in s.chars() {
        let c = ch.to_ascii_lowercase();
        
        // Handle curly apostrophe
        if c == '\u{2019}' {
            out.push('\'');
        } else if c.is_ascii_alphanumeric() || c == '\'' || c.is_whitespace() {
            out.push(c);
        } else {
            out.push(' ');
        }
    }
    
    // Collapse whitespace
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Tokenize already-normalized text.
/// 
/// Splits on whitespace and filters out:
/// - Empty tokens
/// - Stop words
pub fn tokenize<'a>(normalized: &'a str) -> Vec<&'a str> {
    normalized
        .split_whitespace()
        .filter(|t| !t.is_empty() && !is_stop_word(t))
        .collect()
}

/// Normalize and tokenize in one step.
/// 
/// Convenience function that applies normalization then tokenization.
pub fn tokenize_norm(text: &str) -> Vec<String> {
    let normalized = normalize_raw(text);
    normalized
        .split_whitespace()
        .filter(|t| !t.is_empty() && !is_stop_word(t))
        .map(|s| s.to_string())
        .collect()
}

/// Generate an FST-compatible phrase key from a surface form.
/// 
/// Returns `None` if:
/// - The normalized form is empty
/// - There are no valid tokens after filtering
/// - There are more than MAX_PHRASE_TOKENS tokens
/// 
/// The key is formed by joining tokens with TOK_SEP.
pub fn phrase_key(surface: &str) -> Option<String> {
    let normalized = normalize_raw(surface);
    if normalized.is_empty() { return None; }
    
    let toks = tokenize(&normalized);
    if toks.is_empty() || toks.len() > MAX_PHRASE_TOKENS { return None; }
    
    Some(toks.join(&TOK_SEP.to_string()))
}

/// Strip possessive suffixes from a token.
/// 
/// Removes "'s" or "s'" from the end of a word.
#[inline]
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
    fn test_normalize_raw() {
        // Basic lowercase
        assert_eq!(normalize_raw("Hello World"), "hello world");
        
        // Period becomes space
        assert_eq!(normalize_raw("Monkey D. Luffy"), "monkey d luffy");
        
        // Curly apostrophe normalization
        assert_eq!(normalize_raw("O'Brien"), "o'brien");
        
        // Special characters become space
        assert_eq!(normalize_raw("Café—Noir"), "caf noir");
        
        // Multiple spaces collapsed
        assert_eq!(normalize_raw("Hello    World"), "hello world");
        
        // Numbers preserved
        assert_eq!(normalize_raw("Unit 42"), "unit 42");
    }
    
    #[test]
    fn test_is_stop_word() {
        assert!(is_stop_word("the"));
        assert!(is_stop_word("mr"));
        assert!(is_stop_word("of"));
        assert!(!is_stop_word("luffy"));
        assert!(!is_stop_word("zoro"));
    }
    
    #[test]
    fn test_tokenize_norm() {
        let tokens = tokenize_norm("Monkey D. Luffy");
        assert_eq!(tokens, vec!["monkey", "d", "luffy"]);
        
        // Stop words filtered
        let tokens = tokenize_norm("The Lord of the Rings");
        assert_eq!(tokens, vec!["rings"]);
        
        let tokens = tokenize_norm("Dr. Watson");
        assert_eq!(tokens, vec!["watson"]);
    }
    
    #[test]
    fn test_phrase_key() {
        assert_eq!(
            phrase_key("Monkey D. Luffy"),
            Some("monkey\u{0001}d\u{0001}luffy".to_string())
        );
        
        // Single token
        assert_eq!(phrase_key("Luffy"), Some("luffy".to_string()));
        
        // Empty after filtering
        assert_eq!(phrase_key("The"), None);
        
        // Too many tokens
        let long_name = "One Two Three Four Five";
        assert_eq!(phrase_key(long_name), None);
    }
    
    #[test]
    fn test_strip_possessive() {
        assert_eq!(strip_possessive("Luffy's"), "Luffy");
        assert_eq!(strip_possessive("James'"), "James");
        assert_eq!(strip_possessive("Zoro"), "Zoro");
        assert_eq!(strip_possessive("'s"), ""); // Edge case
    }
}
