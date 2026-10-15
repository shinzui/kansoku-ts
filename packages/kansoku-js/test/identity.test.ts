import { expect, test } from "bun:test"

import { createIdentity } from "../src/identity.js"
import { memoryStorage } from "../src/storage.js"

test("persists identity, validates signals, clears user and rotates anonymous ID", () => {
  const storage = memoryStorage()
  const identity = createIdentity(storage, "test")
  const previous = identity.snapshot().anonymousId
  identity.setUserId("user")
  identity.setOrganizationId("org")
  identity.setIdentifiers({ device: "device-1" })
  expect(createIdentity(storage, "test").snapshot()).toEqual(identity.snapshot())
  expect(() => identity.setIdentifiers({ device: "has space" })).toThrow(TypeError)
  expect(identity.snapshot().identifiers).toEqual({ device: "device-1" })
  identity.clearUser()
  expect(identity.snapshot()).toEqual({ anonymousId: previous })
  expect(identity.rotateAnonymousId()).not.toBe(previous)
})
