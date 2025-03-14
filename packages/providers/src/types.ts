import type { EmbeddingModelV1, ImageModelV1, LanguageModelV1 } from '@ai-sdk/provider'

export interface Provider {
  languageModel?(modelId: string): LanguageModelV1

  textEmbeddingModel?(modelId: string): EmbeddingModelV1<string>

  image?(modelId: string): ImageModelV1
}

export const modelTypes = ['language', 'text-embedding', 'image'] as const
export type ModelType = (typeof modelTypes)[number]

export type ProviderId =
  | 'openai'
  | 'anthropic'
  | 'deepseek'
  | 'azure'
  | 'bedrock'
  | 'google'
  | 'vertex'
  | 'mistral'
  | 'xai'
  | 'togetherai'
  | 'cohere'
  | 'fireworks'
  | 'deepinfra'
  | 'cerebras'
  | 'groq'
  | 'replicate'
  | 'perplexity'
  | 'luma'
  | 'openrouter'

export interface ProviderInfo {
  id: ProviderId
  name: string
  languageModels?: ModelInfo[]
  textEmbeddingModels?: (ModelInfo & { dimensions?: number })[]
  imageModels?: ModelInfo[]
}

export interface ModelInfo {
  id: string
  name: string
  description: string
  dimensions?: number // for embedding models
}
