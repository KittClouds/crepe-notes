import { useState, useCallback, useEffect } from 'react';
import { kittCore } from '@/lib/kittcore';

export interface SQLiteStatus {
    initialized: boolean;
    ready: boolean;
    error: string | null;
}

export function useSQLite() {
    const [status, setStatus] = useState<SQLiteStatus>({
        initialized: false,
        ready: false,
        error: null
    });

    // Initialize DB on mount (once)
    useEffect(() => {
        let mounted = true;

        const init = async () => {
            try {
                // Initialize KittCore (loads WASM)
                await kittCore.init();

                // Initialize DB (installs OPFS VFS + opens DB)
                // Use a fixed name for now
                await kittCore.initDb("kittclouds.db");

                // Initialize Schema (create tables)
                await kittCore.initSchema();

                if (mounted) {
                    setStatus({
                        initialized: true,
                        ready: true,
                        error: null
                    });
                }
            } catch (err) {
                console.error("[useSQLite] Init failed:", err);
                if (mounted) {
                    setStatus({
                        initialized: true,
                        ready: false,
                        error: err instanceof Error ? err.message : String(err)
                    });
                }
            }
        };

        if (!status.initialized) {
            init();
        }

        return () => { mounted = false; };
    }, [status.initialized]);

    const saveNote = useCallback(async (note: any) => {
        if (!status.ready) throw new Error("SQLite not ready");
        await kittCore.saveNote(note);
    }, [status.ready]);

    const exec = useCallback(async (sql: string) => {
        if (!status.ready) throw new Error("SQLite not ready");
        await kittCore.dbExec(sql);
    }, [status.ready]);

    return {
        ...status,
        saveNote,
        exec
    };
}
