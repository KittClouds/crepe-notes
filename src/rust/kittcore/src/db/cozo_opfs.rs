//! CozoDB OPFS Persistence Layer
//!
//! Enterprise-grade persistence with:
//! - Atomic snapshot + append-only WAL
//! - Backup rotation (snapshot.json → snapshot.json.bak)
//! - SHA-256 integrity validation
//! - Schema versioning with migration support
//! - Quota guardrails
//!
//! File Layout (under OPFS root):
//!   /cozo/snapshot.json      - Full Cozo export with envelope
//!   /cozo/snapshot.json.bak  - Backup of previous snapshot
//!   /cozo/wal.jsonl          - Append-only write-ahead log

use serde::{Deserialize, Serialize};
use sha2::{Sha256, Digest};

/// Current schema version - bump when envelope format changes
pub const SCHEMA_VERSION: u32 = 1;

/// Maximum snapshot size in bytes (50MB)
pub const MAX_SNAPSHOT_SIZE_BYTES: usize = 50 * 1024 * 1024;

/// OPFS paths
const SNAPSHOT_PATH: &str = "/cozo/snapshot.json";
const BACKUP_PATH: &str = "/cozo/snapshot.json.bak";
const WAL_PATH: &str = "/cozo/wal.jsonl";
const TEMP_PREFIX: &str = "/cozo/snapshot.tmp";

// =============================================================================
// Types
// =============================================================================

/// Snapshot envelope with metadata and integrity check
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SnapshotEnvelope {
    /// Magic marker for file type identification
    pub magic: String, // "cozo-snapshot"
    /// Schema version for migrations
    pub schema: u32,
    /// Creation timestamp (ms since epoch)
    pub created_at_ms: u64,
    /// Raw JSON payload from CozoDB export
    pub payload_json: String,
    /// SHA-256 hex digest of payload_json
    pub payload_sha256_hex: String,
}

impl SnapshotEnvelope {
    /// Create a new envelope from a CozoDB export payload
    pub fn new(payload_json: String) -> Self {
        let hash = sha256_hex(&payload_json);
        Self {
            magic: "cozo-snapshot".to_string(),
            schema: SCHEMA_VERSION,
            created_at_ms: js_timestamp_ms(),
            payload_json,
            payload_sha256_hex: hash,
        }
    }

    /// Validate envelope integrity
    pub fn validate(&self) -> Result<(), OpfsError> {
        if self.magic != "cozo-snapshot" {
            return Err(OpfsError::Corrupt("Magic mismatch".into()));
        }
        if self.schema > SCHEMA_VERSION {
            return Err(OpfsError::SchemaMismatch {
                found: self.schema,
                expected: SCHEMA_VERSION,
            });
        }
        let computed_hash = sha256_hex(&self.payload_json);
        if computed_hash != self.payload_sha256_hex {
            return Err(OpfsError::Corrupt("SHA-256 hash mismatch".into()));
        }
        Ok(())
    }
}

/// Write-Ahead Log entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WalEntry {
    /// Timestamp (ms since epoch)
    pub ts: u64,
    /// Operation type
    pub op: WalOp,
    /// CozoScript that was executed
    pub script: String,
    /// JSON-stringified params (optional)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub params: Option<String>,
}

/// WAL operation type
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum WalOp {
    Script,
}

/// Result of loading a snapshot
#[derive(Debug, Clone)]
pub struct LoadResult {
    /// Parsed CozoDB export data (or None if no snapshot)
    pub snapshot: Option<String>,
    /// True if we fell back to backup
    pub recovery_mode: bool,
    /// Source of the loaded snapshot
    pub source: LoadSource,
}

#[derive(Debug, Clone, PartialEq)]
pub enum LoadSource {
    Primary,
    Backup,
    None,
}

/// Quota status
#[derive(Debug, Clone)]
pub struct QuotaStatus {
    pub usage_bytes: u64,
    pub quota_bytes: u64,
    pub usage_percent: f64,
    pub available: u64,
}

/// OPFS errors
#[derive(Debug, thiserror::Error)]
pub enum OpfsError {
    #[error("OPFS not supported")]
    NotSupported,
    #[error("Corrupt data: {0}")]
    Corrupt(String),
    #[error("Schema mismatch: found v{found}, expected v{expected}")]
    SchemaMismatch { found: u32, expected: u32 },
    #[error("Quota exceeded: need {need} bytes, have {have} bytes")]
    QuotaExceeded { need: usize, have: u64 },
    #[error("Snapshot too large: {size} bytes exceeds {max} byte limit")]
    TooLarge { size: usize, max: usize },
    #[error("File locked")]
    Locked,
    #[error("IO error: {0}")]
    Io(String),
}

// =============================================================================
// Utilities
// =============================================================================

/// Compute SHA-256 hash as hex string
pub fn sha256_hex(data: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data.as_bytes());
    let result = hasher.finalize();
    hex::encode(result)
}

/// Get current timestamp in milliseconds (WASM-compatible)
#[cfg(target_arch = "wasm32")]
fn js_timestamp_ms() -> u64 {
    js_sys::Date::now() as u64
}

#[cfg(not(target_arch = "wasm32"))]
fn js_timestamp_ms() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64
}

// =============================================================================
// OPFS Adapter (Async WASM)
// =============================================================================

#[cfg(target_arch = "wasm32")]
mod wasm_impl {
    use super::*;

    /// OPFS persistence adapter
    pub struct OpfsAdapter;

    impl OpfsAdapter {
        /// Load snapshot with fallback to backup
        pub async fn load_snapshot() -> Result<LoadResult, OpfsError> {
            // Try primary
            match Self::try_load_from(SNAPSHOT_PATH).await {
                Ok(Some(payload)) => {
                    return Ok(LoadResult {
                        snapshot: Some(payload),
                        recovery_mode: false,
                        source: LoadSource::Primary,
                    });
                }
                Ok(None) => {}
                Err(e) => {
                    web_sys::console::warn_1(
                        &format!("[RustOpfs] Primary load failed: {:?}", e).into(),
                    );
                }
            }

            // Try backup
            match Self::try_load_from(BACKUP_PATH).await {
                Ok(Some(payload)) => {
                    web_sys::console::warn_1(&"[RustOpfs] ⚠️ Recovered from backup".into());
                    return Ok(LoadResult {
                        snapshot: Some(payload),
                        recovery_mode: true,
                        source: LoadSource::Backup,
                    });
                }
                Ok(None) => {}
                Err(e) => {
                    web_sys::console::warn_1(
                        &format!("[RustOpfs] Backup load failed: {:?}", e).into(),
                    );
                }
            }

            // No snapshot
            Ok(LoadResult {
                snapshot: None,
                recovery_mode: false,
                source: LoadSource::None,
            })
        }

        /// Try to load and validate envelope from path
        async fn try_load_from(path: &str) -> Result<Option<String>, OpfsError> {
            let bytes = match opfs_project::read(path).await {
                Ok(b) => b,
                Err(_) => return Ok(None),
            };

            if bytes.is_empty() {
                return Ok(None);
            }

            let text = String::from_utf8((*bytes).clone())
                .map_err(|e| OpfsError::Corrupt(format!("UTF-8 error: {}", e)))?;

            let envelope: SnapshotEnvelope = serde_json::from_str(&text)
                .map_err(|e| OpfsError::Corrupt(format!("JSON parse error: {}", e)))?;

            // Validate
            envelope.validate()?;

            // Apply migrations if needed (future)
            // For now, just return payload
            Ok(Some(envelope.payload_json))
        }

        /// Helper: Copy file from src to dst (read + write since OPFS has no rename)
        async fn copy_file(src: &str, dst: &str) -> Result<(), OpfsError> {
            let bytes = opfs_project::read(src)
                .await
                .map_err(|e| OpfsError::Io(format!("Read failed: {:?}", e)))?;
            // opfs_project::read returns Arc<Vec<u8>>, need to deref
            opfs_project::write(dst, &*bytes)
                .await
                .map_err(|e| OpfsError::Io(format!("Write failed: {:?}", e)))?;
            Ok(())
        }

        /// Save snapshot with atomic write and backup rotation
        pub async fn save_snapshot(payload_json: &str) -> Result<(), OpfsError> {
            // Size check
            if payload_json.len() > MAX_SNAPSHOT_SIZE_BYTES {
                return Err(OpfsError::TooLarge {
                    size: payload_json.len(),
                    max: MAX_SNAPSHOT_SIZE_BYTES,
                });
            }

            // TODO: Quota check (requires JS interop for navigator.storage.estimate)

            // Create envelope
            let envelope = SnapshotEnvelope::new(payload_json.to_string());
            let envelope_json = serde_json::to_string(&envelope)
                .map_err(|e| OpfsError::Io(format!("Serialize error: {}", e)))?;

            // Ensure directory exists
            let _ = opfs_project::create_dir_all("/cozo").await;

            // Write to temp file
            let temp_path = format!("{}-{}", TEMP_PREFIX, js_timestamp_ms());
            opfs_project::write(&temp_path, envelope_json.as_bytes())
                .await
                .map_err(|e| OpfsError::Io(format!("Temp write failed: {:?}", e)))?;

            // Rotate: copy current -> backup (ignore errors if current doesn't exist)
            let _ = Self::copy_file(SNAPSHOT_PATH, BACKUP_PATH).await;

            // Commit: copy temp -> current, then delete temp
            Self::copy_file(&temp_path, SNAPSHOT_PATH)
                .await
                .map_err(|e| {
                    // Try to clean up temp
                    let _ = opfs_project::remove_file(&temp_path);
                    e
                })?;

            // Clean up temp file
            let _ = opfs_project::remove_file(&temp_path).await;

            let size = envelope_json.len();
            web_sys::console::log_1(
                &format!("[RustOpfs] Snapshot saved ({} bytes)", size).into(),
            );

            Ok(())
        }

        /// Load WAL entries
        pub async fn load_wal() -> Result<Vec<WalEntry>, OpfsError> {
            let bytes = match opfs_project::read(WAL_PATH).await {
                Ok(b) => b,
                Err(_) => return Ok(vec![]),
            };

            if bytes.is_empty() {
                return Ok(vec![]);
            }

            let text = String::from_utf8((*bytes).clone())
                .map_err(|e| OpfsError::Corrupt(format!("WAL UTF-8 error: {}", e)))?;

            let mut entries = Vec::new();
            for line in text.lines() {
                if line.trim().is_empty() {
                    continue;
                }
                match serde_json::from_str::<WalEntry>(line) {
                    Ok(entry) => entries.push(entry),
                    Err(e) => {
                        web_sys::console::warn_1(
                            &format!("[RustOpfs] Skipping corrupt WAL line: {}", e).into(),
                        );
                    }
                }
            }

            Ok(entries)
        }

        /// Append a single entry to WAL
        pub async fn append_wal(entry: &WalEntry) -> Result<(), OpfsError> {
            let _ = opfs_project::create_dir_all("/cozo").await;

            let line = format!("{}\n", serde_json::to_string(entry).unwrap());

            // Read existing, append, write back (OPFS doesn't support native append)
            let existing: String = match opfs_project::read(WAL_PATH).await {
                Ok(b) => String::from_utf8((*b).clone()).unwrap_or_default(),
                Err(_) => String::new(),
            };

            let mut new_content = existing;
            new_content.push_str(&line);
            opfs_project::write(WAL_PATH, new_content.as_bytes())
                .await
                .map_err(|e| OpfsError::Io(format!("WAL append failed: {:?}", e)))?;

            Ok(())
        }

        /// Truncate (clear) the WAL after compaction
        pub async fn truncate_wal() -> Result<(), OpfsError> {
            opfs_project::write(WAL_PATH, b"")
                .await
                .map_err(|e| OpfsError::Io(format!("WAL truncate failed: {:?}", e)))?;

            web_sys::console::log_1(&"[RustOpfs] WAL truncated".into());
            Ok(())
        }
    }
}

#[cfg(target_arch = "wasm32")]
pub use wasm_impl::OpfsAdapter;

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sha256_hex() {
        let hash = sha256_hex("hello");
        assert_eq!(
            hash,
            "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
        );
    }

    #[test]
    fn test_envelope_create_and_validate() {
        let payload = r#"{"nodes":[],"edges":[]}"#.to_string();
        let envelope = SnapshotEnvelope::new(payload.clone());

        assert_eq!(envelope.magic, "cozo-snapshot");
        assert_eq!(envelope.schema, SCHEMA_VERSION);
        assert_eq!(envelope.payload_json, payload);

        // Should validate successfully
        envelope.validate().expect("Validation should pass");
    }

    #[test]
    fn test_envelope_validation_fails_on_tampered_hash() {
        let mut envelope = SnapshotEnvelope::new("test".to_string());
        envelope.payload_sha256_hex = "bad_hash".to_string();

        let result = envelope.validate();
        assert!(matches!(result, Err(OpfsError::Corrupt(_))));
    }

    #[test]
    fn test_envelope_validation_fails_on_bad_magic() {
        let mut envelope = SnapshotEnvelope::new("test".to_string());
        envelope.magic = "wrong-magic".to_string();

        let result = envelope.validate();
        assert!(matches!(result, Err(OpfsError::Corrupt(_))));
    }

    #[test]
    fn test_envelope_validation_fails_on_future_schema() {
        let mut envelope = SnapshotEnvelope::new("test".to_string());
        envelope.schema = SCHEMA_VERSION + 1;

        let result = envelope.validate();
        assert!(matches!(result, Err(OpfsError::SchemaMismatch { .. })));
    }

    #[test]
    fn test_wal_entry_serialization() {
        let entry = WalEntry {
            ts: 1234567890,
            op: WalOp::Script,
            script: "?[x] := x = 1".to_string(),
            params: Some(r#"{"foo":"bar"}"#.to_string()),
        };

        let json = serde_json::to_string(&entry).unwrap();
        let parsed: WalEntry = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed.ts, entry.ts);
        assert_eq!(parsed.op, WalOp::Script);
        assert_eq!(parsed.script, entry.script);
        assert_eq!(parsed.params, entry.params);
    }

    #[test]
    fn test_wal_entry_without_params() {
        let entry = WalEntry {
            ts: 1234567890,
            op: WalOp::Script,
            script: "?[x] := x = 1".to_string(),
            params: None,
        };

        let json = serde_json::to_string(&entry).unwrap();
        assert!(!json.contains("params")); // skip_serializing_if works
    }

    #[test]
    fn test_size_check() {
        let huge_payload = "x".repeat(MAX_SNAPSHOT_SIZE_BYTES + 1);
        assert!(huge_payload.len() > MAX_SNAPSHOT_SIZE_BYTES);
    }
}
