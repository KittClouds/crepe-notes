import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RaptorService } from './raptor-service';

// Mock CozoDB
const mockRunQuery = vi.fn().mockResolvedValue({});
vi.mock('../cozo/db', () => ({
    cozoDb: {
        runQuery: mockRunQuery,
    }
}));

describe('RaptorService', () => {
    let service: RaptorService;
    let mockWorker: any;

    beforeEach(() => {
        // Mock Worker
        mockWorker = {
            postMessage: vi.fn(),
            onmessage: null,
            terminate: vi.fn(),
        };

        // Stub global Worker
        vi.stubGlobal('Worker', class MockWorker {
            constructor() {
                return mockWorker;
            }
        });

        // Create fresh instance (avoid singleton state issues in tests)
        service = new RaptorService();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('initializes worker and schema', async () => {
        // Setup schema queries to resolve
        mockRunQuery.mockResolvedValue({});

        // Mock generic INIT response
        mockWorker.postMessage.mockImplementation((msg: any) => {
            if (msg.type === 'INIT') {
                // Simulate worker response
                setTimeout(() => {
                    mockWorker.onmessage({ data: { type: 'INIT_COMPLETE', _id: msg._id, payload: {} } });
                }, 0);
            }
        });

        await service.init();
        expect(Worker).toHaveBeenCalledTimes(1);
        expect(mockRunQuery).toHaveBeenCalled(); // Should create schema
    });

    it('sends ingest command and awaits response', async () => {
        let sentMsg: any;
        mockWorker.postMessage.mockImplementation((msg: any) => {
            sentMsg = msg;
            if (msg.type === 'INDEX_NOTES') {
                setTimeout(() => {
                    mockWorker.onmessage({
                        data: {
                            type: 'INDEX_COMPLETE',
                            _id: msg._id,
                            payload: { notes: 1, chunks: 5 }
                        }
                    });
                }, 0);
            }
        });

        // Must init first (mocking init call logic to avoid re-running init test logic)
        // Or just let it run Init logic which is mocked above
        // We'll trust auto-init or call init
        await service.init();

        const result = await service.ingestNotes([{ id: '1', title: 't', content: 'c' }]);

        expect(sentMsg.type).toBe('INDEX_NOTES');
        expect(result).toEqual({ notes: 1, chunks: 5 });
    });

    it('handles rebuild index flow', async () => {
        // 1. Mock worker BUILD_RAPTOR
        mockWorker.postMessage.mockImplementation((msg: any) => {
            if (msg.type === 'INIT') {
                setTimeout(() => mockWorker.onmessage({ data: { type: 'INIT_COMPLETE', _id: msg._id } }), 0);
            }
            if (msg.type === 'BUILD_RAPTOR') {
                setTimeout(() => {
                    mockWorker.onmessage({
                        data: {
                            type: 'RAPTOR_BUILT',
                            _id: msg._id,
                            payload: {
                                nodes: [{ id: 'n1', level: 1, embedding: [], children: [] }],
                                stats: { levels: 1 }
                            }
                        }
                    });
                }, 0);
            }
        });

        await service.rebuildIndex(20);

        // Verify CozoDB Interaction (Delete old, Insert new)
        expect(mockRunQuery).toHaveBeenCalledWith(expect.stringContaining(':rm raptor_nodes'));
        expect(mockRunQuery).toHaveBeenCalledWith(expect.stringContaining(':put raptor_nodes'), expect.any(Object));
    });
});
