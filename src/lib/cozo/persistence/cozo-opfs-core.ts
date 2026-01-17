/**
 * CozoDB OPFS Core Adapter
 * 
 * Provides atomic snapshot + append-only WAL persistence for CozoDB.
 * Reuses hardened patterns from NebulaDB's OPFS adapter.
 * 
 * File Layout (under OPFS root):
 *   /cozo/snapshot.json      - Full Cozo export
 *   /cozo/snapshot.json.bak  - Backup
 *   /cozo/wal.jsonl          - Append-only log
 */

// ==========================================
// Types
// ==========================================

export type CozoSnapshotEnvelope = {
    magic: "cozo-snapshot";
    schema: 1;
    createdAtMs: number;
    payloadJson: string;      // Raw JSON string from CozoDB export
    payloadSha256Hex: string; // Integrity check
};

export type WalEntry = {
    ts: number;           // Timestamp
    op: 'script';         // Operation type (just scripts for now)
    script: string;       // CozoScript that was run
};

export class CozoOpfsError extends Error {
    constructor(
        message: string,
        public readonly code:
            | "NotSupported"
            | "Corrupt"
            | "SchemaMismatch"
            | "Quota"
            | "Locked"
            | "Io",
        public readonly cause?: unknown,
    ) {
        super(message);
        this.name = "CozoOpfsError";
    }
}

// ==========================================
// Crypto & IO Utilities
// ==========================================

const enc = new TextEncoder();

export async function sha256Hex(text: string): Promise<string> {
    const bytes = enc.encode(text);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function writeTextFileExclusive(handle: FileSystemFileHandle, text: string) {
    try {
        const writable = await (handle as any).createWritable({ mode: "exclusive" });
        await writable.write(text);
        await writable.close();
    } catch (e: any) {
        if (e?.name === "NoModificationAllowedError") {
            throw new CozoOpfsError("File is locked by another writer", "Locked", e);
        }
        throw new CozoOpfsError("Failed writing file", "Io", e);
    }
}

async function readTextFileOrNull(handle: FileSystemFileHandle): Promise<string | null> {
    try {
        const file = await handle.getFile();
        if (file.size === 0) return null;
        return await file.text();
    } catch (e: any) {
        if (e?.name === "NotFoundError") return null;
        throw new CozoOpfsError("Failed reading file", "Io", e);
    }
}

async function appendTextFile(handle: FileSystemFileHandle, text: string): Promise<void> {
    try {
        const writable = await (handle as any).createWritable({ keepExistingData: true });
        const file = await handle.getFile();
        await writable.seek(file.size);
        await writable.write(text);
        await writable.close();
    } catch (e: any) {
        throw new CozoOpfsError("Failed appending to file", "Io", e);
    }
}

async function tryParseEnvelope(text: string): Promise<CozoSnapshotEnvelope> {
    let env: any;
    try {
        env = JSON.parse(text);
    } catch (e) {
        throw new CozoOpfsError("Envelope JSON is invalid", "Corrupt", e);
    }

    if (env?.magic !== "cozo-snapshot") {
        throw new CozoOpfsError("Envelope magic mismatch", "Corrupt");
    }
    if (env?.schema !== 1) {
        throw new CozoOpfsError("Envelope schema mismatch", "SchemaMismatch");
    }
    if (typeof env.payloadJson !== "string" || typeof env.payloadSha256Hex !== "string") {
        throw new CozoOpfsError("Envelope fields missing", "Corrupt");
    }

    const expected = await sha256Hex(env.payloadJson);
    if (expected !== env.payloadSha256Hex) {
        throw new CozoOpfsError("Snapshot hash mismatch", "Corrupt");
    }

    return env as CozoSnapshotEnvelope;
}

// ==========================================
// CozoDB OPFS Adapter
// ==========================================

export class CozoOpfsAdapter {
    private readonly snapshotName = "snapshot.json";
    private readonly walName = "wal.jsonl";

    /**
     * Get or create the /cozo directory under OPFS root
     */
    private async getDirectory(): Promise<FileSystemDirectoryHandle> {
        if (!("storage" in navigator) || !("getDirectory" in navigator.storage)) {
            throw new CozoOpfsError("OPFS not supported in this browser", "NotSupported");
        }
        const root = await navigator.storage.getDirectory();
        return await root.getDirectoryHandle('cozo', { create: true });
    }

    private bakName() {
        return `${this.snapshotName}.bak`;
    }

    /**
     * Load the snapshot from OPFS
     * Returns parsed payload or null if no snapshot exists
     */
    async loadSnapshot(): Promise<any | null> {
        const dir = await this.getDirectory();
        let primaryText: string | null = null;
        let bakText: string | null = null;

        // Try primary
        try {
            const primary = await dir.getFileHandle(this.snapshotName, { create: true });
            primaryText = await readTextFileOrNull(primary);
        } catch (e) {
            console.warn("[CozoOpfs] Primary load error", e);
        }

        if (primaryText) {
            try {
                const env = await tryParseEnvelope(primaryText);
                return JSON.parse(env.payloadJson);
            } catch (e) {
                console.warn("[CozoOpfs] Primary corrupt, trying backup", e);
            }
        }

        // Try backup
        try {
            const bak = await dir.getFileHandle(this.bakName(), { create: true });
            bakText = await readTextFileOrNull(bak);
        } catch (e) {
            console.warn("[CozoOpfs] Backup load error", e);
        }

        if (!bakText) return null;

        const env = await tryParseEnvelope(bakText);
        return JSON.parse(env.payloadJson);
    }

    /**
     * Save a snapshot atomically with backup rotation
     */
    async saveSnapshot(data: any): Promise<void> {
        const dir = await this.getDirectory();

        // Quota check
        try {
            const est = await navigator.storage.estimate();
            if (est.quota && est.usage && (est.usage / est.quota > 0.9)) {
                console.warn("[CozoOpfs] Quota warning > 90%");
            }
        } catch { /* ignore */ }

        const payloadJson = JSON.stringify(data);
        const env: CozoSnapshotEnvelope = {
            magic: "cozo-snapshot",
            schema: 1,
            createdAtMs: Date.now(),
            payloadJson,
            payloadSha256Hex: await sha256Hex(payloadJson),
        };
        const envText = JSON.stringify(env);

        // Write to temp file
        const tmpName = `${this.snapshotName}.tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const tmp = await dir.getFileHandle(tmpName, { create: true });
        await writeTextFileExclusive(tmp, envText);

        // Rotate: move current -> .bak
        try {
            try {
                const cur = await dir.getFileHandle(this.snapshotName);
                await (cur as any).move(this.bakName());
            } catch (e: any) {
                if (e.name !== 'NotFoundError') throw e;
            }
        } catch (e) {
            console.warn("[CozoOpfs] Rotation failed", e);
        }

        // Commit: move tmp -> current
        await (tmp as any).move(this.snapshotName);
        console.log("[CozoOpfs] Snapshot saved");
    }

    /**
     * Load all WAL entries
     */
    async loadWal(): Promise<WalEntry[]> {
        const dir = await this.getDirectory();

        try {
            const walHandle = await dir.getFileHandle(this.walName, { create: true });
            const text = await readTextFileOrNull(walHandle);
            if (!text) return [];

            const entries: WalEntry[] = [];
            const lines = text.trim().split('\n');
            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    entries.push(JSON.parse(line));
                } catch (e) {
                    console.warn("[CozoOpfs] Skipping corrupt WAL line:", line);
                }
            }
            return entries;
        } catch (e) {
            console.warn("[CozoOpfs] WAL load error", e);
            return [];
        }
    }

    /**
     * Append a single entry to the WAL
     */
    async appendWal(entry: WalEntry): Promise<void> {
        const dir = await this.getDirectory();
        const walHandle = await dir.getFileHandle(this.walName, { create: true });
        const line = JSON.stringify(entry) + '\n';
        await appendTextFile(walHandle, line);
    }

    /**
     * Truncate (clear) the WAL after compaction
     */
    async truncateWal(): Promise<void> {
        const dir = await this.getDirectory();
        try {
            const walHandle = await dir.getFileHandle(this.walName, { create: true });
            const writable = await (walHandle as any).createWritable();
            await writable.truncate(0);
            await writable.close();
            console.log("[CozoOpfs] WAL truncated");
        } catch (e) {
            console.warn("[CozoOpfs] WAL truncate failed", e);
        }
    }
}
