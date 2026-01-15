
import { NodeRelationship, ObjectType } from '../types';
import type { Metadata, RelatedNodeInfo, RelatedNodeType, BaseNodeParams, TextNodeParams } from '../types';

// Simple hash replacement (not actual SHA256) used to allow running in browser without node:crypto
// In a real production environment, use a proper crypto library or async SubtleCrypto if possible.
function simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(36);
}

function createSHA256() {
    let content = '';
    return {
        update(data: string | Uint8Array) {
            if (typeof data === 'string') content += data;
            else content += new TextDecoder().decode(data);
        },
        digest() {
            return simpleHash(content);
        }
    }
}

function randomUUID() {
    return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'uuid-' + Math.random().toString(36).substr(2, 9);
}


/**
 * Generic abstract class for retrievable nodes
 */
export abstract class BaseNode<T extends Metadata = Metadata> {
    id_: string;
    metadata: T;
    relationships: Partial<Record<NodeRelationship, RelatedNodeType<T>>>;

    private _hash: string = '';

    get hash(): string {
        if (this._hash === '') {
            this._hash = this.generateHash();
        }
        return this._hash;
    }

    set hash(value: string) {
        this._hash = value;
    }

    protected constructor(init?: BaseNodeParams<T>) {
        const { id_, metadata, relationships } = init || {};
        this.id_ = id_ ?? randomUUID();
        this.metadata = metadata ?? ({} as T);
        this.relationships = relationships ?? {};
    }

    abstract get type(): ObjectType;

    abstract getContent(): string;

    abstract getMetadataStr(): string;

    get sourceNode(): RelatedNodeInfo<T> | undefined {
        const relationship = this.relationships[NodeRelationship.SOURCE];

        if (Array.isArray(relationship)) {
            throw new Error('Source object must be a single RelatedNodeInfo object');
        }

        return relationship;
    }

    get prevNode(): RelatedNodeInfo<T> | undefined {
        const relationship = this.relationships[NodeRelationship.PREVIOUS];

        if (Array.isArray(relationship)) {
            throw new Error('Previous object must be a single RelatedNodeInfo object');
        }

        return relationship;
    }

    get nextNode(): RelatedNodeInfo<T> | undefined {
        const relationship = this.relationships[NodeRelationship.NEXT];

        if (Array.isArray(relationship)) {
            throw new Error('Next object must be a single RelatedNodeInfo object');
        }

        return relationship;
    }

    get parentNode(): RelatedNodeInfo<T> | undefined {
        const relationship = this.relationships[NodeRelationship.PARENT];

        if (Array.isArray(relationship)) {
            throw new Error('Parent object must be a single RelatedNodeInfo object');
        }

        return relationship;
    }

    get childNodes(): RelatedNodeInfo<T>[] | undefined {
        const relationship = this.relationships[NodeRelationship.CHILD];

        if (relationship && !Array.isArray(relationship)) {
            // If it is a single object, wrap it? The original threw error.
            // throw new Error('Child object must be a an array of RelatedNodeInfo objects');
            // Copied directly from legacy_v1/docs/chunk.md:
            throw new Error('Child object must be a an array of RelatedNodeInfo objects');
        }

        return relationship as RelatedNodeInfo<T>[] | undefined;
    }

    abstract generateHash(): string;
}

/**
 * TextNode is the default node type for text.
 */
export class TextNode<T extends Metadata = Metadata> extends BaseNode<T> {
    text: string;

    startCharIdx?: number;
    endCharIdx?: number;
    metadataSeparator: string;

    constructor(init: TextNodeParams<T> = {}) {
        super(init);
        const { text, startCharIdx, endCharIdx, metadataSeparator } = init;
        this.text = text ?? '';
        if (startCharIdx !== undefined) {
            this.startCharIdx = startCharIdx;
        }
        if (endCharIdx !== undefined) {
            this.endCharIdx = endCharIdx;
        }
        this.metadataSeparator = metadataSeparator ?? '\n';
    }

    /**
     * Generate a hash of the text node.
     * The ID is not part of the hash as it can change independent of content.
     * @returns
     */
    generateHash() {
        const hashFunction = createSHA256();
        hashFunction.update(`type=${this.type}`);
        hashFunction.update(`startCharIdx=${this.startCharIdx} endCharIdx=${this.endCharIdx}`);
        hashFunction.update(this.getContent());
        return hashFunction.digest();
    }

    get type() {
        return ObjectType.TEXT;
    }

    getContent(): string {
        const metadataStr = this.getMetadataStr().trim();
        return `${metadataStr}\n\n${this.text}`.trim();
    }

    getMetadataStr(): string {
        const usableMetadataKeys = new Set(Object.keys(this.metadata).sort());

        return [...usableMetadataKeys].map(key => `${key}: ${this.metadata[key]}`).join(this.metadataSeparator);
    }

    getNodeInfo() {
        return { start: this.startCharIdx, end: this.endCharIdx };
    }

    getText() {
        return this.text;
    }
}

/**
 * A document is just a special text node with a docId.
 */
export class Document<T extends Metadata = Metadata> extends TextNode<T> {
    constructor(init?: TextNodeParams<T>) {
        super(init);
    }

    get type() {
        return ObjectType.DOCUMENT;
    }
}
