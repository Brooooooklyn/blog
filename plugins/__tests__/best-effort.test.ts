import { describe, it, expect, vi } from "vitest"
import { bestEffortWrite, bestEffortRead, describeError } from "../../src/utils/best-effort"

type WithCause = Error & { cause?: unknown }

function drizzleLikeError(): WithCause {
  // Mirrors the production incident: Drizzle throws a wrapper error whose
  // `.cause` is the real transient D1 failure.
  const err: WithCause = new Error('Failed query: insert into "views" ...')
  err.cause = new Error("D1_ERROR: Network connection lost")
  return err
}

describe("describeError", () => {
  it("flattens the Drizzle wrapper message and the underlying cause into one string", () => {
    const text = describeError(drizzleLikeError())
    expect(text).toContain("Failed query")
    expect(text).toContain("D1_ERROR: Network connection lost")
  })

  it("falls back to the error message when there is no cause", () => {
    expect(describeError(new Error("boom"))).toBe("boom")
  })

  it("stringifies non-Error values", () => {
    expect(describeError("plain string")).toBe("plain string")
  })
})

describe("bestEffortWrite", () => {
  it("awaits a successful operation", async () => {
    const op = vi.fn(() => Promise.resolve())
    await expect(bestEffortWrite("view increment", op)).resolves.toBeUndefined()
    expect(op).toHaveBeenCalledOnce()
  })

  it("swallows a failure so the page still renders (no 500), logging the underlying cause", async () => {
    const err = drizzleLikeError()
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})

    await expect(
      bestEffortWrite("view increment", () => Promise.reject(err)),
    ).resolves.toBeUndefined()

    expect(spy).toHaveBeenCalledOnce()
    // The log line carries the real D1 cause, not just the opaque wrapper.
    expect(spy.mock.calls[0][0]).toContain("D1_ERROR: Network connection lost")
    spy.mockRestore()
  })
})

describe("bestEffortRead", () => {
  it("returns the operation result on success", async () => {
    const rows = [{ count: 7 }]
    await expect(bestEffortRead("views", [], () => Promise.resolve(rows))).resolves.toBe(rows)
  })

  it("returns the fallback and logs the cause on failure", async () => {
    const err = drizzleLikeError()
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    const fallback: number[] = []

    await expect(
      bestEffortRead("comments", fallback, () => Promise.reject(err)),
    ).resolves.toBe(fallback)

    expect(spy.mock.calls[0][0]).toContain("D1_ERROR: Network connection lost")
    spy.mockRestore()
  })

  it("logs the error message when there is no cause", async () => {
    const err = new Error("boom")
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    await bestEffortRead("x", null, () => Promise.reject(err))
    expect(spy.mock.calls[0][0]).toContain("boom")
    spy.mockRestore()
  })
})
