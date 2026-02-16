import { afterAll, beforeAll, beforeEach, expect, mock, test } from "bun:test"

type OpenAIConfigCall = {
  apiKey: string
  baseURL?: string
}

const openAIConfigCalls: OpenAIConfigCall[] = []
const generateTextCalls: Array<Record<string, unknown>> = []
const generateObjectCalls: Array<Record<string, unknown>> = []
const streamTextCalls: Array<Record<string, unknown>> = []
const embedManyCalls: Array<Record<string, unknown>> = []

mock.module("@ai-sdk/openai", () => ({
  createOpenAI(config: OpenAIConfigCall) {
    openAIConfigCalls.push(config)
    const languageModelFactory = ((modelId: string) => ({
      type: "language-model",
      modelId,
    })) as ((modelId: string) => unknown) & {
      textEmbeddingModel: (modelId: string) => unknown
    }
    languageModelFactory.textEmbeddingModel = (modelId: string) => ({
      type: "embedding-model",
      modelId,
    })
    return languageModelFactory
  },
}))

mock.module("ai", () => ({
  generateText(input: Record<string, unknown>) {
    generateTextCalls.push(input)
    return Promise.resolve({
      text: "ok",
      finishReason: "stop",
    })
  },
  generateObject(input: Record<string, unknown>) {
    generateObjectCalls.push(input)
    return Promise.resolve({
      object: {},
    })
  },
  streamText(input: Record<string, unknown>) {
    streamTextCalls.push(input)
    return {
      fullStream: [] as unknown[],
    }
  },
  embedMany(input: Record<string, unknown>) {
    embedManyCalls.push(input)
    return Promise.resolve({
      embeddings: [[0.1, 0.2]],
    })
  },
}))

const { LLM } = await import("../../src/llm")
const { LLM_SCENE_DEFINITIONS } = await import("../../src/llm/scenes")

const baselineDefinitions = structuredClone(LLM_SCENE_DEFINITIONS)
const prevAPIKey = process.env.OPENAI_API_KEY
const prevBaseURL = process.env.OPENAI_BASE_URL

beforeAll(() => {
  process.env.OPENAI_API_KEY = "test-key"
  process.env.OPENAI_BASE_URL = "https://example.openai.local/v1"
})

afterAll(() => {
  if (prevAPIKey === undefined) {
    delete process.env.OPENAI_API_KEY
  } else {
    process.env.OPENAI_API_KEY = prevAPIKey
  }
  if (prevBaseURL === undefined) {
    delete process.env.OPENAI_BASE_URL
  } else {
    process.env.OPENAI_BASE_URL = prevBaseURL
  }
})

beforeEach(() => {
  openAIConfigCalls.length = 0
  generateTextCalls.length = 0
  generateObjectCalls.length = 0
  streamTextCalls.length = 0
  embedManyCalls.length = 0

  LLM_SCENE_DEFINITIONS.language["session.chat"] = structuredClone(baselineDefinitions.language["session.chat"])
  LLM_SCENE_DEFINITIONS.language["tool.rerank"] = structuredClone(baselineDefinitions.language["tool.rerank"])
  LLM_SCENE_DEFINITIONS.language["library.summary"] = structuredClone(baselineDefinitions.language["library.summary"])
  LLM_SCENE_DEFINITIONS.embedding["library.embedding"] = structuredClone(baselineDefinitions.embedding["library.embedding"])
  LLM_SCENE_DEFINITIONS.embedding["search.embedding"] = structuredClone(baselineDefinitions.embedding["search.embedding"])
})

test("language.generateText merges defaults with call args and deep-merges providerOptions", async () => {
  LLM_SCENE_DEFINITIONS.language["tool.rerank"].defaults = {
    generateText: {
      maxOutputTokens: 200,
      temperature: 0.2,
      providerOptions: {
        openai: {
          reasoningEffort: "medium",
          responseFormat: {
            type: "json_object",
            strict: false,
          },
        },
        app: {
          trace: "default",
        },
      },
    },
  }

  const llm = LLM.for("tool.rerank")
  await llm.generateText({
    model: llm.model,
    prompt: "rank the candidates",
    temperature: 0.9,
    providerOptions: {
      openai: {
        responseFormat: {
          strict: true,
        },
      },
      app: {
        reqId: "req-1",
      },
    },
  } as any)

  const call = generateTextCalls[0]
  expect(openAIConfigCalls[0]).toEqual({
    apiKey: "test-key",
    baseURL: "https://example.openai.local/v1",
  })
  expect(call).toBeTruthy()
  expect(call?.maxOutputTokens).toBe(200)
  expect(call?.temperature).toBe(0.9)
  expect(call?.prompt).toBe("rank the candidates")
  expect(call?.model).toEqual({
    type: "language-model",
    modelId: "gpt-4o-mini",
  })
  expect(call?.providerOptions).toEqual({
    openai: {
      reasoningEffort: "medium",
      responseFormat: {
        type: "json_object",
        strict: true,
      },
    },
    app: {
      trace: "default",
      reqId: "req-1",
    },
  })
})

test("language streamText respects scene model override and merges stream defaults", () => {
  LLM_SCENE_DEFINITIONS.language["session.chat"].defaults = {
    streamText: {
      topP: 0.5,
      providerOptions: {
        openai: {
          parallelToolCalls: false,
          reasoningEffort: "medium",
        },
      },
    },
  }

  const llm = LLM.for("session.chat", {
    modelId: "gpt-custom-chat",
  })

  llm.streamText({
    model: llm.model,
    messages: [],
    providerOptions: {
      openai: {
        parallelToolCalls: true,
      },
    },
  } as any)

  const call = streamTextCalls[0]
  expect(call).toBeTruthy()
  expect(call?.model).toEqual({
    type: "language-model",
    modelId: "gpt-custom-chat",
  })
  expect(call?.topP).toBe(0.5)
  expect(call?.providerOptions).toEqual({
    openai: {
      parallelToolCalls: true,
      reasoningEffort: "medium",
    },
  })
})

test("embedding embedMany merges defaults and keeps call-level override precedence", async () => {
  LLM_SCENE_DEFINITIONS.embedding["search.embedding"].defaults = {
    embedMany: {
      maxRetries: 2,
      providerOptions: {
        openai: {
          user: "default-user",
        },
        app: {
          scope: "search",
        },
      },
    },
  }

  const llm = LLM.for("search.embedding", {
    modelId: "text-embedding-3-large",
  })
  await llm.embedMany({
    model: llm.model,
    values: ["a", "b"],
    maxRetries: 4,
    providerOptions: {
      openai: {
        user: "request-user",
      },
      app: {
        traceId: "t-1",
      },
    },
  } as any)

  const call = embedManyCalls[0]
  expect(call).toBeTruthy()
  expect(call?.model).toEqual({
    type: "embedding-model",
    modelId: "text-embedding-3-large",
  })
  expect(call?.maxRetries).toBe(4)
  expect(call?.values).toEqual(["a", "b"])
  expect(call?.providerOptions).toEqual({
    openai: {
      user: "request-user",
    },
    app: {
      scope: "search",
      traceId: "t-1",
    },
  })
})
