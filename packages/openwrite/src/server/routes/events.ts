import type { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import { subscribe, fsCreated, fsDeleted, fsMoved, fsUpdated } from "@/bus"
import { ctx } from "@/context"
import { SSE_KEEPALIVE_INTERVAL_MS } from "../constants"

export function registerEventRoutes(app: Hono) {
  app.get("/event/fs", async (c) => {
    const unsubscribers: Array<() => void> = []
    return streamSSE(c, async (stream) => {
      const subscribeFsEvent = (eventName: string, payload: unknown) => stream.writeSSE({
        data: JSON.stringify(payload),
        event: eventName,
      })
      unsubscribers.push(
        subscribe(fsCreated, (event) =>
          subscribeFsEvent(event.type, event.properties)),
        subscribe(fsUpdated, (event) =>
          subscribeFsEvent(event.type, event.properties)),
        subscribe(fsDeleted, (event) =>
          subscribeFsEvent(event.type, event.properties)),
        subscribe(fsMoved, (event) =>
          subscribeFsEvent(event.type, event.properties)),
      )
      const keepalive = setInterval(() => {
        stream.writeSSE({ event: "ping", data: "" })
      }, SSE_KEEPALIVE_INTERVAL_MS)
      try {
        await new Promise<void>((_, reject) => {
          c.req.raw.signal?.addEventListener(
            "abort",
            () => {
              const reason = c.req.raw.signal?.reason
              const detail =
                reason instanceof Error
                  ? `${reason.name}: ${reason.message}`
                  : reason === undefined
                    ? "undefined"
                    : String(reason)
              console.info("[sse] fs request aborted", {
                projectID: ctx()?.project_id ?? "",
                detail,
              })
              reject(new DOMException("Aborted", "AbortError"))
            },
            { once: true },
          )
        })
      } finally {
        console.info("[sse] fs stream cleanup", {
          projectID: ctx()?.project_id ?? "",
        })
        clearInterval(keepalive)
        for (const unsubscribe of unsubscribers) {
          unsubscribe()
        }
      }
    }, async (err) => {
      for (const unsubscribe of unsubscribers) {
        unsubscribe()
      }
      console.error(err)
    })
  })
}
