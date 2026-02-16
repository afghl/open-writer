import type {
  generateText as sdkGenerateText,
  generateObject as sdkGenerateObject,
  streamText as sdkStreamText,
  embedMany as sdkEmbedMany,
} from "ai"

export type SDKGenerateTextFn = typeof sdkGenerateText
export type SDKGenerateObjectFn = typeof sdkGenerateObject
export type SDKStreamTextFn = typeof sdkStreamText
export type SDKEmbedManyFn = typeof sdkEmbedMany

export type LanguageSceneId =
  | "session.chat"
  | "tool.rerank"
  | "library.summary"

export type EmbeddingSceneId =
  | "library.embedding"
  | "search.embedding"

export type LLMSceneId = LanguageSceneId | EmbeddingSceneId

export type GenerateTextParams = Parameters<SDKGenerateTextFn>[0]
export type GenerateObjectParams = Parameters<SDKGenerateObjectFn>[0]
export type StreamTextParams = Parameters<SDKStreamTextFn>[0]
export type EmbedManyParams = Parameters<SDKEmbedManyFn>[0]

export type LanguageCallDefaults = {
  generateText?: Partial<GenerateTextParams>
  generateObject?: Partial<GenerateObjectParams>
  streamText?: Partial<StreamTextParams>
}

export type EmbeddingCallDefaults = {
  embedMany?: Partial<EmbedManyParams>
}

export type LanguageSceneDefinition = {
  providerId: "openai"
  modelId: string
  defaults?: LanguageCallDefaults
}

export type EmbeddingSceneDefinition = {
  providerId: "openai"
  modelId: string
  defaults?: EmbeddingCallDefaults
}

export type LLMSceneDefinitions = {
  language: Record<LanguageSceneId, LanguageSceneDefinition>
  embedding: Record<EmbeddingSceneId, EmbeddingSceneDefinition>
}

export type SceneBindingOptions = {
  modelId?: string
}

export type LanguageSceneClient = {
  model: GenerateTextParams["model"]
  generateText: SDKGenerateTextFn
  generateObject: SDKGenerateObjectFn
  streamText: SDKStreamTextFn
}

export type EmbeddingSceneClient = {
  model: EmbedManyParams["model"]
  embedMany: SDKEmbedManyFn
}

export interface LLMService {
  for(sceneId: LanguageSceneId, options?: SceneBindingOptions): LanguageSceneClient
  for(sceneId: EmbeddingSceneId, options?: SceneBindingOptions): EmbeddingSceneClient
  for(sceneId: LLMSceneId, options?: SceneBindingOptions): LanguageSceneClient | EmbeddingSceneClient
}
