import { AsyncLocalStorage } from 'async_hooks';

/**
 * Request-scoped async context using AsyncLocalStorage.
 * Replaces the unsafe `(global as any).correlationId` pattern
 * which was race-condition prone under concurrent requests.
 *
 * Usage:
 *   - Middleware wraps request in `asyncContext.run(store, callback)`
 *   - Any code in the async call chain reads via `asyncContext.getStore()`
 */

export interface RequestContext {
  correlationId: string;
}

export const asyncContext = new AsyncLocalStorage<RequestContext>();

/**
 * Get the current correlation ID from async context.
 * Falls back to 'N/A' if no context is active (e.g., during startup).
 */
export function getCorrelationId(): string {
  const store = asyncContext.getStore();
  return store?.correlationId || 'N/A';
}
