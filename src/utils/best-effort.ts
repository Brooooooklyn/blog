// The post page loader depends on D1 only for NON-essential data: the view
// counter, comments, and inline comments. The essential article (HTML, headings,
// title/meta, reading time, nav) all come from build artifacts / the filesystem,
// so it can render even when D1 is unavailable.
//
// A transient D1 error (e.g. "D1_ERROR: Network connection lost") must therefore
// never turn a page load into a 500 for the reader. These helpers run such an
// operation and, on failure, log the failure and degrade gracefully instead of
// letting the rejection propagate. The `operation` is injectable so the guards
// can be unit-tested without a live D1 binding.
//
// Failures are logged with `console.error`, which Void's tail pipeline captures
// at error level (visible via `void project logs --level error`) — so a degraded
// read is loudly observable to the operator, never silently dropped.

// Drizzle wraps the real driver error in `.cause`; the wrapper message only says
// "Failed query: ...". Flatten both into one readable string so the underlying
// cause actually shows up in the log line (the tail CLI stringifies each arg,
// which would otherwise render an Error object as "[object Object]").
export function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  const cause = error.cause
  const causeText =
    cause instanceof Error ? `${cause.name}: ${cause.message}` : cause != null ? String(cause) : ""
  return causeText ? `${error.message} (cause: ${causeText})` : error.message
}

/** Fire-and-forget write (e.g. the view-count increment). Failure is logged and swallowed. */
export async function bestEffortWrite(label: string, operation: () => PromiseLike<unknown>): Promise<void> {
  try {
    await operation()
  } catch (error) {
    console.error(`[best-effort] ${label} failed: ${describeError(error)}`)
  }
}

/** Read that resolves to `fallback` (and logs the cause) if the operation fails. */
export async function bestEffortRead<T>(
  label: string,
  fallback: T,
  operation: () => PromiseLike<T>,
): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    console.error(`[best-effort] ${label} failed; using fallback: ${describeError(error)}`)
    return fallback
  }
}
