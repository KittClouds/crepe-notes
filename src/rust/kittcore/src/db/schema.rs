//! Core SQL Schema for KittClouds
//! Defines tables and migrations for the SQLite database.

pub const MIGRATIONS: &[&str] = &[
    // V1: Initial Schema
    r#"
    -- Notes Table
    CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        folder_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        author_id TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_notes_folder ON notes(folder_id);
    
    -- Entities Table
    CREATE TABLE IF NOT EXISTS entities (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        kind TEXT NOT NULL,
        aliases TEXT, -- JSON array
        narrative_id TEXT,
        created_at INTEGER,
        updated_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_entities_kind ON entities(kind);
    
    -- Folders Table
    CREATE TABLE IF NOT EXISTS folders (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        parent_id TEXT,
        color TEXT,
        icon TEXT
    );
    "#
];
