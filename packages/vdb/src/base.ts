export interface Document {
  content: string
  embedding: number[]
  metadata: {
    workspaceId: string
    datasetId: string
    documentId: string
    [key: string]: unknown
  }
}

export abstract class BaseVector {
  protected constructor(protected collection: string) {}

  abstract insert(documents: Document | Document[]): Promise<string[]>
}
