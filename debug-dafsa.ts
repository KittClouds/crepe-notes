
/**
 * Debug script to verify DAFSA scanner on the provided test doc
 */
import { DAFSACore } from './src/lib/Scanner/dafsa-scan';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// 1. Setup Entities from Screenshot
const ENTITIES = [
    { id: '1', kind: 'CHARACTER', label: 'Harald', aliases: [] },
    { id: '2', kind: 'CHARACTER', label: 'Shanks', aliases: [] },
    { id: '3', kind: 'CHARACTER', label: 'Loki', aliases: [] },
    { id: '4', kind: 'CHARACTER', label: 'Roronoa Zoro', aliases: ['Zoro', 'Moss-head'] }, // Added alias for flavor
    { id: '5', kind: 'CHARACTER', label: 'Sanji', aliases: [] },
    { id: '6', kind: 'CHARACTER', label: 'Nami', aliases: [] },
    { id: '7', kind: 'CHARACTER', label: 'Monkey D. Luffy', aliases: ['Luffy'] },
    { id: '8', kind: 'CHARACTER', label: 'Usopp', aliases: [] },
    { id: '9', kind: 'CHARACTER', label: 'Franky', aliases: [] },
    { id: '10', kind: 'CHARACTER', label: 'Brook', aliases: [] },
    { id: '11', kind: 'CHARACTER', label: 'Nico Robin', aliases: ['Robin'] },
    { id: '12', kind: 'CHARACTER', label: 'Jinbe', aliases: [] },
    { id: '13', kind: 'CHARACTER', label: 'Tony Tony Chopper', aliases: ['Chopper'] },
];

// 2. Hydrate Scanner
const scanner = new DAFSACore();
console.log('Hydrating DAFSA scanner...');
scanner.hydrate(ENTITIES as any);

// 3. Load Test Doc
const docPath = resolve('./scanner_test_doc.md');
console.log(`Loading test doc: ${docPath}`);
const text = readFileSync(docPath, 'utf-8');

// 4. Scan
console.log('Scanning...');
const start = performance.now();
const spans = scanner.scan(text);
const end = performance.now();

// 5. Output Results
console.log(`\nScan complete in ${(end - start).toFixed(3)}ms`);
console.log(`Found ${spans.length} mentions:\n`);

spans.forEach(s => {
    const status = s.resolved ? `✅ [${s.entityId}]` : '❓ [Ambiguous]';
    console.log(`- "${s.matchedText}" at ${s.from} -> ${status} ${s.label}`);
});
