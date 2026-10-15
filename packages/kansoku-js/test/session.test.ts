import { expect, test } from "bun:test"

import { createSession } from "../src/session.js"
import { memoryStorage } from "../src/storage.js"

test("renews after inactivity and shares persisted activity", () => {
  const storage = memoryStorage()
  const manager = createSession(storage, "test", 100)
  const initial = manager.current(0)
  expect(initial.started).toBe(true)
  manager.touch(90)
  expect(createSession(storage, "test", 100).current(180)).toEqual({
    id: initial.id,
    started: false,
  })
  expect(manager.current(191).id).not.toBe(initial.id)
  expect(JSON.parse(storage.get("test.session")!)).toHaveProperty("lastActivityAt", 191)
})
