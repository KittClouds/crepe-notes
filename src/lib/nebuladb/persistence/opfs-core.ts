
// ==========================================
// Types & Envelopes
// ==========================================

export type SnapshotEnvelope = {
    magic: "nebula-snapshot";
    schema: 1;
    createdAtMs: number;
    payloadJson: string;      // raw JSON string of your DB snapshot
    payloadSha256Hex: string; // integrity check of payloadJson
};

export class OpfsSnapshotError extends Error {
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
        this.name = "OpfsSnapshotError";
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

// Helper to write effectively atomic using exclusive mode
async function writeTextFileExclusive(handle: FileSystemFileHandle, text: string) {
    try {
        // user specified { mode: "exclusive" } but TS definitions might lag in some environments.
        const writable = await (handle as any).createWritable({ mode: "exclusive" });
        await writable.write(text);
        await writable.close();
    } catch (e: any) {
        if (e?.name === "NoModificationAllowedError") {
            throw new OpfsSnapshotError("Snapshot is locked by another writer", "Locked", e);
        }
        throw new OpfsSnapshotError("Failed writing snapshot", "Io", e);
    }
}

async function readTextFileOrNull(handle: FileSystemFileHandle): Promise<string | null> {
    try {
        const file = await handle.getFile();
        if (file.size === 0) return null;
        return await file.text();
    } catch (e: any) {
        if (e?.name === "NotFoundError") return null;
        throw new OpfsSnapshotError("Failed reading snapshot", "Io", e);
    }
}

export async function tryParseEnvelope(text: string): Promise<SnapshotEnvelope> {
    let env: any;
    try {
        env = JSON.parse(text);
    } catch (e) {
        throw new OpfsSnapshotError("Envelope JSON is invalid", "Corrupt", e);
    }

    if (env?.magic !== "nebula-snapshot") {
        throw new OpfsSnapshotError("Envelope magic mismatch", "Corrupt");
    }
    if (env?.schema !== 1) {
        throw new OpfsSnapshotError("Envelope schema mismatch", "SchemaMismatch");
    }
    if (typeof env.payloadJson !== "string" || typeof env.payloadSha256Hex !== "string") {
        throw new OpfsSnapshotError("Envelope fields missing", "Corrupt");
    }

    const expected = await sha256Hex(env.payloadJson);
    if (expected !== env.payloadSha256Hex) {
        throw new OpfsSnapshotError("Snapshot hash mismatch", "Corrupt");
    }

    return env as SnapshotEnvelope;
}

// ==========================================
// The Hardened Adapter
// ==========================================

export class OpfsHardenedSnapshotAdapter {
    constructor(
        private readonly baseName = "nebula.snapshot.json",
    ) { }

    private async rootDir(): Promise<FileSystemDirectoryHandle> {
        if (!("storage" in navigator) || !("getDirectory" in navigator.storage)) {
            throw new OpfsSnapshotError("OPFS not supported in this browser", "NotSupported");
        }
        return await navigator.storage.getDirectory();
    }

    private bakName() {
        return `${this.baseName}.bak`;
    }

    async load(): Promise<any | null> {
        const root = await this.rootDir();
        let primaryText: string | null = null;
        let bakText: string | null = null;

        try {
            const primary = await root.getFileHandle(this.baseName, { create: true });
            primaryText = await readTextFileOrNull(primary);
        } catch (e) { console.warn("Primary load error", e); }

        if (primaryText) {
            try {
                const env = await tryParseEnvelope(primaryText);
                return JSON.parse(env.payloadJson);
            } catch (e) {
                console.warn("Primary corrupt, trying backup", e);
                // fall through to backup
            }
        }

        try {
            const bak = await root.getFileHandle(this.bakName(), { create: true });
            bakText = await readTextFileOrNull(bak);
        } catch (e) { console.warn("Backup load error", e); }

        if (!bakText) return null;

        const env = await tryParseEnvelope(bakText);
        return JSON.parse(env.payloadJson);
    }

    async save(snapshot: any): Promise<void> {
        const root = await this.rootDir();

        // Optional: quota check
        try {
            const est = await navigator.storage.estimate();
            if (est.quota && est.usage && (est.usage / est.quota > 0.9)) {
                console.warn("OPFS Quota warning > 90%");
            }
        } catch (e) { /* ignore */ }

        const payloadJson = JSON.stringify(snapshot);
        const env: SnapshotEnvelope = {
            magic: "nebula-snapshot",
            schema: 1,
            createdAtMs: Date.now(),
            payloadJson,
            payloadSha256Hex: await sha256Hex(payloadJson),
        };
        const envText = JSON.stringify(env);

        const tmpName = `${this.baseName}.tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const tmp = await root.getFileHandle(tmpName, { create: true });

        // 1) Write temp (exclusive writer)
        await writeTextFileExclusive(tmp, envText);

        // 2) Rotate: move current -> .bak (best effort)
        try {
            try {
                const cur = await root.getFileHandle(this.baseName);
                await (cur as any).move(this.bakName());
            } catch (e: any) {
                if (e.name !== 'NotFoundError') throw e;
            }
        } catch (e) {
            console.warn("Rotation failed", e);
        }

        // 3) Commit: move tmp -> current name
        await (tmp as any).move(this.baseName);
    }
}
