import { createOpenAI } from "@ai-sdk/openai"
import {
  embedMany as sdkEmbedMany,
  generateObject as sdkGenerateObject,
  generateText as sdkGenerateText,
  streamText as sdkStreamText,
} from "ai"
import { LLM_SCENE_DEFINITIONS } from "./scenes"
import type {
  EmbedManyParams,
  EmbeddingSceneClient,
  EmbeddingSceneId,
  GenerateObjectParams,
  GenerateTextParams,
  LanguageSceneClient,
  LanguageSceneId,
  LLMService,
  SceneBindingOptions,
  SDKEmbedManyFn,
  SDKGenerateObjectFn,
  SDKGenerateTextFn,
  SDKStreamTextFn,
  StreamTextParams,
} from "./types"

type ArgsWithProviderOptions = {
  providerOptions?: unknown
}

type OpenAIProvider = ReturnType<typeof createOpenAI>

let openAIProviderCache: OpenAIProvider | undefined

function getOrCreateOpenAIProvider() {
  if (openAIProviderCache) {
    return openAIProviderCache
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set")
  }

  const baseURL = process.env.OPENAI_BASE_URL?.trim() || undefined
  openAIProviderCache = createOpenAI({
    apiKey,
    baseURL,
  })
  return openAIProviderCache
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype
}

function mergeProviderOptions(base: unknown, override: unknown): unknown {
  if (override === undefined) return base
  if (base === undefined) return override
  if (!isPlainObject(base) || !isPlainObject(override)) return override

  const result: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(override)) {
    result[key] = mergeProviderOptions(base[key], value)
  }
  return result
}

function mergeCallArgs<T extends object>(defaults: Partial<T> | undefined, args: T): T {
  const merged = { ...(defaults ?? {}), ...args } as T
  const mergedProviderOptions = mergeProviderOptions(
    (defaults as ArgsWithProviderOptions | undefined)?.providerOptions,
    (args as ArgsWithProviderOptions | undefined).providerOptions,
  )
  if (mergedProviderOptions !== undefined) {
    (merged as ArgsWithProviderOptions).providerOptions = mergedProviderOptions
  }
  return merged
}

function createLanguageSceneClient(
  sceneId: LanguageSceneId,
  options?: SceneBindingOptions,
): LanguageSceneClient {
  const sceneDefinition = LLM_SCENE_DEFINITIONS.language[sceneId]
  const provider = getOrCreateOpenAIProvider()
  const model = provider(options?.modelId ?? sceneDefinition.modelId) as GenerateTextParams["model"]

  const generateText = ((args: Parameters<SDKGenerateTextFn>[0]) => {
    const defaults = sceneDefinition.defaults?.generateText as Partial<GenerateTextParams> | undefined
    const request = mergeCallArgs(defaults, args as GenerateTextParams)
    return sdkGenerateText(request)
  }) as SDKGenerateTextFn

  const generateObject = ((args: Parameters<SDKGenerateObjectFn>[0]) => {
    const defaults = sceneDefinition.defaults?.generateObject as Partial<GenerateObjectParams> | undefined
    const request = mergeCallArgs(defaults, args as GenerateObjectParams)
    return sdkGenerateObject(request)
  }) as SDKGenerateObjectFn

  const streamText = ((args: Parameters<SDKStreamTextFn>[0]) => {
    const defaults = sceneDefinition.defaults?.streamText as Partial<StreamTextParams> | undefined
    const request = mergeCallArgs(defaults, args as StreamTextParams)
    return sdkStreamText(request)
  }) as SDKStreamTextFn

  return {
    model,
    generateText,
    generateObject,
    streamText,
  }
}

function createEmbeddingSceneClient(
  sceneId: EmbeddingSceneId,
  options?: SceneBindingOptions,
): EmbeddingSceneClient {
  const sceneDefinition = LLM_SCENE_DEFINITIONS.embedding[sceneId]
  const provider = getOrCreateOpenAIProvider()
  const model = provider.textEmbeddingModel(options?.modelId ?? sceneDefinition.modelId) as EmbedManyParams["model"]

  const embedMany = ((args: Parameters<SDKEmbedManyFn>[0]) => {
    const defaults = sceneDefinition.defaults?.embedMany as Partial<EmbedManyParams> | undefined
    const request = mergeCallArgs(defaults, args as EmbedManyParams)
    return sdkEmbedMany(request)
  }) as SDKEmbedManyFn

  return {
    model,
    embedMany,
  }
}

export const LLM: LLMService = {
  language(sceneId, options) {
    return createLanguageSceneClient(sceneId, options)
  },

  embedding(sceneId, options) {
    return createEmbeddingSceneClient(sceneId, options)
  },
}
