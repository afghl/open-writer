import { Session } from "@/session"

export async function acquireSessionForChat(sessionID: string) {
  const changed = await Session.transitionStatus({
    sessionID,
    from: ["idle"],
    to: "chatting",
  })
  if (changed.changed) {
    return
  }
  const session = await Session.get(sessionID)
  if (session.status === "handoff_processing") {
    throw new Error("Session is processing a handoff task")
  }
  throw new Error(`Session ${sessionID} is busy`)
}

export async function releaseSessionFromChat(sessionID: string) {
  await Session.transitionStatus({
    sessionID,
    from: ["chatting"],
    to: "idle",
  })
}
