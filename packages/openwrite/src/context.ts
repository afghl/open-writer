import { AsyncLocalStorage } from "async_hooks"

/**
 * Request-scoped context (e.g. per HTTP request).
 * Set in server middleware via requestContextStorage.run(ctx, () => next()).
 * No explicit cleanup: ALS is scoped to the async execution; when the request
 * completes, the context is no longer accessible.
 */
export type RequestContext = {
  project_id: string
}

const requestContextStorage = new AsyncLocalStorage<RequestContext>()

/**
 * Run a function with the given request context. Used by server middleware
 * to enter the context for the rest of the request.
 */
export function runRequestContext<T>(ctx: RequestContext, fn: () => T): T {
  return requestContextStorage.run(ctx, fn)
}

/**
 * Run a function with the given request context (async). Used by server
 * middleware to enter the context for the rest of the request.
 */
export function runRequestContextAsync<T>(
  ctx: RequestContext,
  fn: () => Promise<T>,
): Promise<T> {
  return requestContextStorage.run(ctx, fn) as Promise<T>
}

/**
 * Get the current request context, if any. Returns undefined when not inside
 * a request (e.g. background job or script).
 */
export function ctx(): RequestContext | undefined {
  return requestContextStorage.getStore()
}

export { requestContextStorage }
