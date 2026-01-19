# KittCore Rust/WASM Package

Document Scanner + ResoRank Search Engine + Embeddings - Rust/WASM implementation.

## Status

**NOT YET WIRED UP** - The worker is in stub mode. This package needs Rust development before integration.

## Structure

```
rust/kittcore/
├── Cargo.toml          # Rust manifest with WASM target support
├── src/
│   ├── lib.rs          # Main entry point
│   ├── scanner/        # Document scanning (syntax, implicit, relations, triples, temporal)
│   ├── resorank/       # BM25 + ResoRank search engine
│   ├── embeddings/     # ONNX-based text embeddings
│   ├── rag/            # RAG pipeline (chunking, vector index)
│   ├── hnsw/           # HNSW vector index
│   ├── reality/        # Semantic graph engine
│   └── graphdb/        # Graph database layer
```

## TypeScript Integration

```typescript
import { kittCore } from '@/lib/kittcore';

// Initialize worker
await kittCore.init();

// Hydrate with entities for implicit matching
await kittCore.hydrateEntities([
  { id: 'e1', label: 'Frodo', kind: 'CHARACTER', aliases: ['Mr. Frodo'] }
]);

// Full document scan
const result = await kittCore.scan(
  "Frodo is brother of Sam. [[Frodo->OWNS->Ring]]",
  [{ label: 'Frodo', start: 0, end: 5 }]
);

console.log(result.implicit_mentions);
console.log(result.relations);
console.log(result.triples);
```

## Building WASM

Prerequisites:
- Rust toolchain with `wasm32-unknown-unknown` target
- `wasm-bindgen-cli`

```bash
cd rust/kittcore

# Install WASM target
rustup target add wasm32-unknown-unknown

# Build for WASM
cargo build --target wasm32-unknown-unknown --release --features wasm

# Generate JS bindings
wasm-bindgen target/wasm32-unknown-unknown/release/kittcore.wasm \
  --out-dir ../../src/lib/wasm/kittcore \
  --target web
```

## Features

- `wasm` (default) - WASM target with JS bindings
- `native` - Native target for Tauri
- `embeddings` - Enable ONNX embeddings (expensive)
- `sqlite_wasm` - Enable SQLite WASM (experimental)

## Next Steps

1. Complete Rust development
2. Build WASM module
3. Wire WASM into `src/workers/kittcore.worker.ts`
4. Remove stubs from worker
5. Connect to scanner system
