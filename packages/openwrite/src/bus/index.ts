import z from "zod"
import { ctx } from "@/context"
import { Log } from "@/util"
import * as BusEvent from "./event"

const log = Log.create({ service: "bus" })
type SubResult = void | Promise<void>
type Subscription = (event: any) => SubResult

type BusState = {
  subscriptions: Map<string, Subscription[]>
}

const projectStates = new Map<string, BusState>()

function state(projectId: string): BusState {
  let s = projectStates.get(projectId)
  if (!s) {
    s = { subscriptions: new Map() }
    projectStates.set(projectId, s)
  }
  return s
}

/** Project id for the current request; empty string when outside a request. */
function currentProjectId(): string {
  return ctx()?.project_id ?? ""
}

export async function publish<Definition extends BusEvent.Definition>(
  def: Definition,
  properties: z.output<Definition["properties"]>,
) {
  const projectId = currentProjectId()
  return publishInProject(projectId, def, properties)
}

export async function publishInProject<Definition extends BusEvent.Definition>(
  projectId: string,
  def: Definition,
  properties: z.output<Definition["properties"]>,
) {
  const payload = {
    type: def.type,
    properties,
  }
  log.info("publishing", { type: def.type, projectId })
  const subscriptions = state(projectId).subscriptions
  const pending: SubResult[] = []
  for (const key of [def.type, "*"]) {
    const match = subscriptions.get(key)
    for (const sub of match ?? []) {
      pending.push(sub(payload))
    }
  }
  return Promise.all(pending)
}

export function subscribe<Definition extends BusEvent.Definition>(
  def: Definition,
  callback: (event: { type: Definition["type"]; properties: z.infer<Definition["properties"]> }) => void,
) {
  return raw(def.type, callback)
}

export function once<Definition extends BusEvent.Definition>(
  def: Definition,
  callback: (event: {
    type: Definition["type"]
    properties: z.infer<Definition["properties"]>
  }) => "done" | undefined,
) {
  const unsub = subscribe(def, (event) => {
    if (callback(event)) unsub()
  })
}

export function subscribeAll(callback: (event: any) => void) {
  return raw("*", callback)
}

function raw(type: string, callback: (event: any) => void): () => void {
  const projectId = currentProjectId()
  log.info("subscribing", { type, projectId })
  const subscriptions = state(projectId).subscriptions
  let match = subscriptions.get(type) ?? []
  match.push(callback)
  subscriptions.set(type, match)

  return () => {
    log.info("unsubscribing", { type, projectId })
    const match = subscriptions.get(type)
    if (!match) return
    const index = match.indexOf(callback)
    if (index === -1) return
    match.splice(index, 1)
  }
}

export * from "./event"
export * from "./events"