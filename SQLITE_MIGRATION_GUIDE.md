# SQLite/OPFS Migration Guide 🚢

You have successfully laid the foundation for a Rust-first persistence architecture.

## 1. The Architecture
- **OPFS (Origin Private File System)**: The physical storage on disk (browser-managed).
- **SQLite WASM**: The engine, running inside the Web Worker.
- **Rust `NoteStore`**: The high-level API protecting the DB.
- **`useSQLite` Hook**: The React bridge.

## 2. Current Status
- ✅ **Rust Code**: `schema.rs` and `store.rs` are implemented.
- ✅ **WASM Bridge**: `init_schema` and `save_note` are exposed.
- ✅ **Worker**: `INIT_DB` mounts the VFS and opens correctly.
- ⚠️ **Build**: Currently failing because `sqlite-wasm-rs` requires a C compiler (Clang/LLVM) to compile the embedded SQLite C source for WASM.

## 3. Fixing the Build (Windows)
To get `wasm-pack build` to succeed, you need `clang` in your path.
1. Install **LLVM** (contains Clang) for Windows: [LLVM Releases](https://github.com/llvm/llvm-project/releases)
2. Ensure `clang.exe` is in your `%PATH%`.
3. Set `CC` environment variable if needed:
   ```powershell
   $env:CC = "clang"
   $env:AR = "llvm-ar"
   ```

## 4. Next Steps (Once building)
1. **Enable the Hook**:
   In `src/App.tsx` or `src/components/layout/RootLayout.tsx`, mount the hook to initialize the DB:
   ```typescript
   import { useSQLite } from '@/hooks/useSQLite';
   
   export function RootLayout() {
       const { ready, error } = useSQLite();
       
       if (error) console.error("SQLite Fault:", error);
       
       return (
           // ... app
       );
   }
   ```
2. **Migrate NebulaDB**:
   Go to `src/stores/NebulaDB.ts`. Start replacing methods:
   ```typescript
   // BEFORE
   async saveNote(note) { await this.cozo.put(...) }
   
   // AFTER
   async saveNote(note) { 
       await kittCore.saveNote(note); // Persist to SQLite
       // await this.cozo.put(...)    // Keep Cozo for analysis only?
   }
   ```
