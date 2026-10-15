import { expect, test } from "bun:test"

import { buildEvent } from "../src/envelope.js"
import { createQueue, jsonBytes } from "../src/queue.js"

const event = () =>
  buildEvent(
    {
      identity: { anonymousId: "anon" },
      sessionId: "s",
      config: { now: () => 0, schemaVersions: {} },
    },
    "test",
    { unicode: "観測" },
  )
test("bounds FIFO by count and UTF-8 body bytes and restores valid events only", () => {
  const queue = createQueue(2)
  const first = event(),
    second = event()
  expect(queue.enqueue(first)).toBe(true)
  expect(queue.enqueue(second)).toBe(true)
  expect(queue.enqueue(event())).toBe(false)
  expect(queue.peekBatch(10, jsonBytes([first]))).toEqual([first])
  expect(queue.peekBatch(1, 1)).toEqual([first])
  queue.remove(new Set([first.eventId]))
  expect(queue.toJSON()).toEqual([second])
  queue.restore([null, {}, second, first])
  expect(queue.toJSON()).toEqual([second, first])
})
