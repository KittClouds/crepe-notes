import React, { useEffect, useState } from 'react';
import { graphRegistry } from '@/lib/cozo/graph/GraphRegistry';
import { cozoDb } from '@/lib/cozo/db';

export function GraphRegistryTest() {
    const [logs, setLogs] = useState<string[]>([]);
    const [status, setStatus] = useState('Idle');

    const log = (msg: string) => setLogs(prev => [...prev, `${new Date().toISOString().split('T')[1]} ${msg}`]);

    const runTests = async () => {
        setLogs([]);
        setStatus('Running...');
        try {
            log('Initializing graphRegistry...');
            await graphRegistry.init();
            log('Initialized.');

            if (!cozoDb.isReady()) throw new Error('CozoDB not ready via graphRegistry');

            log('Registering Test Entity...');
            const entity = graphRegistry.registerEntity('Test Character', 'CHARACTER', 'note-test-1');
            log(`Entity registered: ${JSON.stringify(entity)}`);

            log('Checking retrieval...');
            const retrieved = graphRegistry.getEntityById(entity.id);
            if (!retrieved) throw new Error('Failed to retrieve entity');
            log('Retrieval successful.');

            log('Adding relationship...');
            const entity2 = graphRegistry.registerEntity('Test Location', 'LOCATION', 'note-test-1');
            const rel = graphRegistry.addRelationship(entity.id, entity2.id, 'LOCATED_IN', {
                source: 'user',
                originId: 'test',
                confidence: 1,
                timestamp: new Date()
            });
            log(`Relationship added: ${rel.id}`);

            log('Checking stats...');
            const stats = graphRegistry.getGlobalStats();
            log(`Stats: ${JSON.stringify(stats)}`);

            log('Exporting graph...');
            const exportData = await graphRegistry.export();
            log(`Export size: ${exportData.data.length} chars`);

            setStatus('Success');
            log('ALL TESTS PASSED.');
        } catch (err: any) {
            console.error(err);
            setStatus('Failed');
            log(`ERROR: ${err.message}`);
        }
    };

    return (
        <div className="p-4 border rounded m-4 bg-background text-foreground">
            <h2 className="text-xl font-bold mb-2">Graph Registry Test</h2>
            <div className="mb-4">
                <button
                    onClick={runTests}
                    className="bg-primary text-primary-foreground px-4 py-2 rounded hover:bg-primary/90"
                    disabled={status === 'Running...'}
                >
                    Run Tests
                </button>
                <span className="ml-4 font-mono">{status}</span>
            </div>
            <div className="bg-muted p-2 rounded h-64 overflow-auto font-mono text-xs">
                {logs.map((l, i) => <div key={i}>{l}</div>)}
            </div>
        </div>
    );
}
