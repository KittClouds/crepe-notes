//! Note Store Implementation
//! High-level CRUD operations for Notes backed by SQLite.

use super::{Database, schema};
use serde::{Serialize, Deserialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Note {
    pub id: String,
    pub title: String,
    pub content: String,
    pub folder_id: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

pub struct NoteStore<'a> {
    db: &'a Database,
}

impl<'a> NoteStore<'a> {
    pub fn new(db: &'a Database) -> Self {
        Self { db }
    }

    /// Initialize the schema
    pub fn init(&self) -> Result<(), String> {
        for migration in schema::MIGRATIONS {
            self.db.execute(migration)?;
        }
        Ok(())
    }

    /// Save a note (Upsert)
    pub fn save(&self, note: &Note) -> Result<(), String> {
        // Safe string escaping for SQL injection prevention (basic version)
        // Ideally we should use prepared statements, but for this raw FFI we'll be careful.
        // TODO: Switch to prepared statements when available in wrapper.
        
        let title_esc = note.title.replace("'", "''");
        let content_esc = note.content.replace("'", "''");
        let folder_val = match &note.folder_id {
            Some(id) => format!("'{}'", id.replace("'", "''")),
            None => "NULL".to_string()
        };
        let author_val = "NULL"; // placeholder for now

        let sql = format!(
            "INSERT INTO notes (id, title, content, folder_id, created_at, updated_at, author_id)
             VALUES ('{id}', '{title}', '{content}', {folder}, {created}, {updated}, {author})
             ON CONFLICT(id) DO UPDATE SET
                title = excluded.title,
                content = excluded.content,
                folder_id = excluded.folder_id,
                updated_at = excluded.updated_at
            ",
            id = note.id,
            title = title_esc,
            content = content_esc,
            folder = folder_val,
            created = note.created_at,
            updated = note.updated_at,
            author = author_val
        );

        self.db.execute(&sql)
    }
}
