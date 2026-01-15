import { Document } from '../schema';

export interface Transformer {
    transformDocuments(documents: Document[]): Document[] | Promise<Document[]>;
}
