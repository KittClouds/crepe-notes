// src/lib/crossdoc/index.ts
// Cross-Document Knowledge Graph Module

export {
    // Types
    type LinkingConfig,
    type ClusterMember,
    type EntityCluster,
    type LinkingStats,
    DEFAULT_LINKING_CONFIG,
    // String similarity
    levenshteinSimilarity,
    jaroWinklerSimilarity,
    stringSimilarity,
    // Core functions
    calculateImportance,
    hybridSimilarity,
    discoverClusters,
    createCooccurrenceEdges,
    persistClusters,
} from './hybrid-linker';

// CrossDoc Service (worker-based embedding)
export {
    crossDocService,
    CrossDocService,
    type ExtractedEntity,
    type EntityEmbedding,
    type CrossDocStatus,
} from './crossdoc-service';
