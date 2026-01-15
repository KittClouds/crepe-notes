
export enum NodeRelationship {
    SOURCE = 'source',
    PREVIOUS = 'previous',
    NEXT = 'next',
    PARENT = 'parent',
    CHILD = 'child',
}

export enum ObjectType {
    TEXT = 'text',
    DOCUMENT = 'document',
}

export type Metadata = Record<string, any>;

export type RelatedNodeInfo<T extends Metadata = Metadata> = {
    nodeId?: string; // Sometimes just the related node object is linked, ID is usually minimal
    metadata?: T;
    // Based on usage in BaseNode:
    // get sourceNode(): RelatedNodeInfo<T> | undefined
    // relationship is stored as RelatedNodeInfo<T> or RelatedNodeInfo<T>[]
};

// However, in BaseNode.ts logic:
// relationships: Partial<Record<NodeRelationship, RelatedNodeType<T>>>;
// RelatedNodeType is likely RelatedNodeInfo | RelatedNodeInfo[]

export type RelatedNodeType<T extends Metadata = Metadata> = RelatedNodeInfo<T> | RelatedNodeInfo<T>[];

export interface BaseNodeParams<T extends Metadata = Metadata> {
    id_?: string;
    metadata?: T;
    relationships?: Partial<Record<NodeRelationship, RelatedNodeType<T>>>;
}

export interface TextNodeParams<T extends Metadata = Metadata> extends BaseNodeParams<T> {
    text?: string;
    startCharIdx?: number;
    endCharIdx?: number;
    metadataSeparator?: string;
}

export interface BaseChunkOptions {
    maxSize?: number; // default 4000
    overlap?: number; // default 200
    lengthFunction?: (text: string) => number;
    separatorPosition?: 'start' | 'end';
    addStartIndex?: boolean;
    stripWhitespace?: boolean;
}

export interface SentenceChunkOptions extends BaseChunkOptions {
    minSize?: number;
    targetSize?: number;
    sentenceEnders?: string[];
    fallbackToWords?: boolean;
    fallbackToCharacters?: boolean;
}
