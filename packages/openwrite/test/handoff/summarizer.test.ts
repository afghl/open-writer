import { expect, test } from "bun:test"

test("summarizer outputs stable handoff sections", async () => {
  const { HandoffSummarizer } = await import("../../src/handoff/summarizer")

  const text = HandoffSummarizer.toUserMessage({
    task: {
      id: "task-1",
      project_id: "project-1",
      session_id: "session-1",
      type: "handoff",
      status: "processing",
      source: "api",
      idempotency_key: "key",
      input: {
        from_run_id: "run-a",
        to_run_id: "run-b",
        target_agent_name: "writer",
      },
      time: {
        created: Date.now(),
      },
    },
    handoffInput: {
      from_run_id: "run-a",
      to_run_id: "run-b",
      target_agent_name: "writer",
      reason: "spec locked and ready",
    },
    handoff: {
      objective: "Write the article draft.",
      constraints: ["Keep concise", "Use markdown headings"],
      risks: ["Missing audience detail"],
    },
    history: [
      {
        info: {
          id: "m1",
          sessionID: "session-1",
          role: "user",
          agent: "plan",
          run_id: "run-a",
          time: { created: Date.now() - 1000 },
        },
        parts: [
          {
            id: "p1",
            sessionID: "session-1",
            messageID: "m1",
            type: "text",
            text: "We should target engineering managers and keep it practical.",
          },
        ],
      },
      {
        info: {
          id: "m2",
          sessionID: "session-1",
          role: "assistant",
          parentID: "m1",
          agent: "plan",
          run_id: "run-a",
          time: { created: Date.now() - 900, completed: Date.now() - 800 },
          finish: "stop",
        },
        parts: [
          {
            id: "p2",
            sessionID: "session-1",
            messageID: "m2",
            type: "text",
            text: "I'll structure it around goals, risks, and rollout.",
          },
        ],
      },
    ],
  })

  expect(text).toContain("# Handoff Meta")
  expect(text).toContain("# Writing Objective")
  expect(text).toContain("# Constraints")
  expect(text).toContain("# Outstanding Risks")
  expect(text).toContain("# Previous Run Summary")
  expect(text).toContain("# Action Request")
  expect(text).toContain("run-a")
  expect(text).toContain("run-b")
  expect(text).toContain("writer")
  expect(text).toContain("engineering managers")
})
