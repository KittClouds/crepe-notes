// DEAD CODE - REPLACED BY implicit-scan.ts
// Kept temporarily for safety as per user request.
// Can be deleted once stability is confirmed.

/*
import { AllProfanity } from 'allprofanity';
import type { DecorationSpan, EntityKind, RegisteredEntity } from './types';

// ... (commented out implementation)
*/
export class ImplicitCore {
    // Stub to prevent build errors in tests if they still reference it
    hydrate(entities: any[]): void { }
    scan(text: string): any[] { return []; }
    scanBatch(items: any[]): Map<number, any[]> { return new Map(); }
}
