import type { LLMSceneDefinitions } from "./types"

export const LLM_SCENE_DEFINITIONS: LLMSceneDefinitions = {
  language: {
    "session.chat": {
      providerId: "openai",
      modelId: "gpt-5.2",
      defaults: {
        streamText: {},
      },
    },
    "tool.rerank": {
      providerId: "openai",
      modelId: "gpt-4o-mini",
      defaults: {
        generateText: {},
      },
    },
    "library.summary": {
      providerId: "openai",
      modelId: "gpt-5.1",
      defaults: {
        generateObject: {},
      },
    },
  },
  embedding: {
    "library.embedding": {
      providerId: "openai",
      modelId: "text-embedding-3-small",
      defaults: {
        embedMany: {},
      },
    },
    "search.embedding": {
      providerId: "openai",
      modelId: "text-embedding-3-small",
      defaults: {
        embedMany: {},
      },
    },
  },
}
