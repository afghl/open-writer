import { expect, test, mock } from "bun:test"
import type { Message as MessageType } from "../../src/session/message"

type ConvertCall = {
  messages: unknown
  options: unknown
}

const convertCalls: ConvertCall[] = []

mock.module("ai", () => ({
  convertToModelMessages: (messages: unknown, options: unknown) => {
    convertCalls.push({ messages, options })
    return { messages, options }
  },
}))

const { Message } = await import("../../src/session/message")

const resetCalls = () => {
  convertCalls.length = 0
}

const createUserInfo = (id: string) => ({
  id,
  sessionID: "session-1",
  role: "user" as const,
  time: { created: 1 },
  agent: "test",
  run_id: "run-1",
})

const createAssistantInfo = (id: string) => ({
  id,
  sessionID: "session-1",
  role: "assistant" as const,
  parentID: "parent-1",
  agent: "test",
  run_id: "run-1",
  time: { created: 2 },
})

const createPartBase = (messageID: string, id: string) => ({
  id,
  sessionID: "session-1",
  messageID,
})

test("filters user text parts and ignores empty/synthetic", () => {
  resetCalls()
  const userId = "user-1"
  const input: MessageType.WithParts[] = [
    {
      info: createUserInfo(userId),
      parts: [
        {
          ...createPartBase(userId, "p1"),
          type: "text",
          text: "hello",
        },
        {
          ...createPartBase(userId, "p2"),
          type: "text",
          text: "   ",
        },
        {
          ...createPartBase(userId, "p3"),
          type: "text",
          text: "skip",
          synthetic: true,
        },
        {
          ...createPartBase(userId, "p4"),
          type: "step-start",
        },
      ],
    },
  ]

  Message.toModelMessages(input)

  expect(convertCalls.length).toBe(1)
  expect(convertCalls[0]?.messages).toEqual([
    {
      id: userId,
      role: "user",
      parts: [
        {
          type: "text",
          text: "hello",
        },
      ],
    },
  ])
})

test("keeps assistant parts and drops step-start-only messages", () => {
  resetCalls()
  const assistantId = "assistant-1"
  const stepOnlyId = "assistant-2"
  const input: MessageType.WithParts[] = [
    {
      info: createAssistantInfo(stepOnlyId),
      parts: [
        {
          ...createPartBase(stepOnlyId, "p1"),
          type: "step-start",
        },
      ],
    },
    {
      info: createAssistantInfo(assistantId),
      parts: [
        {
          ...createPartBase(assistantId, "p1"),
          type: "text",
          text: "ok",
          metadata: { provider: "x" },
        },
        {
          ...createPartBase(assistantId, "p2"),
          type: "text",
          text: "   ",
        },
        {
          ...createPartBase(assistantId, "p3"),
          type: "step-start",
        },
        {
          ...createPartBase(assistantId, "p4"),
          type: "reasoning",
          text: "because",
          time: { start: 1 },
        },
      ],
    },
  ]

  Message.toModelMessages(input)

  expect(convertCalls.length).toBe(1)
  expect(convertCalls[0]?.messages).toEqual([
    {
      id: assistantId,
      role: "assistant",
      parts: [
        {
          type: "text",
          text: "ok",
          providerMetadata: { provider: "x" },
        },
        {
          type: "step-start",
        },
        {
          type: "reasoning",
          text: "because",
          providerMetadata: undefined,
        },
      ],
    },
  ])
})

test("maps tool parts and provides tool output conversion", () => {
  resetCalls()
  const assistantId = "assistant-3"
  const input: MessageType.WithParts[] = [
    {
      info: createAssistantInfo(assistantId),
      parts: [
        {
          ...createPartBase(assistantId, "p1"),
          type: "tool",
          tool: "weather",
          callID: "call-1",
          state: {
            status: "completed",
            input: { city: "Paris" },
            output: "sunny",
            title: "Weather",
            metadata: {},
            time: { start: 1, end: 2 },
          },
          metadata: { trace: "a" },
        },
        {
          ...createPartBase(assistantId, "p2"),
          type: "tool",
          tool: "search",
          callID: "call-2",
          state: {
            status: "error",
            input: { q: "bun" },
            error: "boom",
            time: { start: 2, end: 3 },
          },
          metadata: { trace: "b" },
        },
        {
          ...createPartBase(assistantId, "p3"),
          type: "tool",
          tool: "weather",
          callID: "call-3",
          state: {
            status: "running",
            input: { city: "Tokyo" },
            time: { start: 3 },
          },
          metadata: { trace: "c" },
        },
      ],
    },
  ]

  Message.toModelMessages(input)

  expect(convertCalls.length).toBe(1)
  expect(convertCalls[0]?.messages).toEqual([
    {
      id: assistantId,
      role: "assistant",
      parts: [
        {
          type: "tool-weather",
          state: "output-available",
          toolCallId: "call-1",
          input: { city: "Paris" },
          output: "sunny",
          callProviderMetadata: { trace: "a" },
        },
        {
          type: "tool-search",
          state: "output-error",
          toolCallId: "call-2",
          input: { q: "bun" },
          errorText: "boom",
          callProviderMetadata: { trace: "b" },
        },
        {
          type: "tool-weather",
          state: "output-error",
          toolCallId: "call-3",
          input: { city: "Tokyo" },
          errorText: "[Tool execution was interrupted]",
          callProviderMetadata: { trace: "c" },
        },
      ],
    },
  ])

  const options = convertCalls[0]?.options as
    | { tools?: Record<string, { toModelOutput?: (output: unknown) => unknown }> }
    | undefined
  const tools = options?.tools ?? {}
  expect(Object.keys(tools).sort()).toEqual(["search", "weather"])
  expect(tools.weather?.toModelOutput?.("ok")).toEqual({ type: "text", value: "ok" })
  expect(tools.search?.toModelOutput?.({ data: true })).toEqual({ type: "json", value: { data: true } })
})
