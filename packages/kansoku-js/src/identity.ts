import { validateIdentifiers } from "./contract/validate.js"
import type { IdentitySnapshot } from "./envelope.js"
import { randomId } from "./envelope.js"
import { readJSON } from "./storage.js"
import type { IdentifierKind, StorageAdapter } from "./types.js"

export function createIdentity(storage: StorageAdapter, prefix: string) {
  const key = (name: string) => `${prefix}.${name}`
  const hadPersistedIdentity = Boolean(storage.get(key("anonymous_id")))
  let anonymousId = storage.get(key("anonymous_id")) || randomId()
  storage.set(key("anonymous_id"), anonymousId)
  let userId = storage.get(key("user_id")) || undefined
  let organizationId = storage.get(key("organization_id")) || undefined
  const loaded = readJSON(storage, key("identifiers"))
  let identifiers =
    loaded && validateIdentifiers(loaded).length === 0
      ? (loaded as Partial<Record<IdentifierKind, string>>)
      : undefined
  return {
    hadPersistedIdentity,
    adoptAnonymousId(value: string) {
      const errors = validateIdentifiers({ cookie: value })
      if (errors.length) throw new TypeError(errors.join("; "))
      anonymousId = value
      storage.set(key("anonymous_id"), value)
    },
    snapshot(): IdentitySnapshot {
      const sharedAnonymous = storage.get(key("anonymous_id"))
      anonymousId = sharedAnonymous || randomId()
      if (!sharedAnonymous) storage.set(key("anonymous_id"), anonymousId)
      userId = storage.get(key("user_id")) || undefined
      organizationId = storage.get(key("organization_id")) || undefined
      const shared = readJSON(storage, key("identifiers"))
      identifiers =
        shared && validateIdentifiers(shared).length === 0
          ? (shared as Partial<Record<IdentifierKind, string>>)
          : undefined
      return {
        anonymousId,
        ...(userId ? { userId } : {}),
        ...(organizationId ? { organizationId } : {}),
        ...(identifiers ? { identifiers: { ...identifiers } } : {}),
      }
    },
    setUserId(value: string) {
      userId = value
      storage.set(key("user_id"), value)
    },
    setOrganizationId(value: string) {
      organizationId = value
      storage.set(key("organization_id"), value)
    },
    setIdentifiers(value: Partial<Record<IdentifierKind, string>>) {
      const errors = validateIdentifiers(value)
      if (errors.length) throw new TypeError(errors.join("; "))
      identifiers = { ...value }
      storage.set(key("identifiers"), JSON.stringify(identifiers))
    },
    rotateAnonymousId() {
      anonymousId = randomId()
      storage.set(key("anonymous_id"), anonymousId)
      return anonymousId
    },
    clearUser() {
      userId = undefined
      organizationId = undefined
      identifiers = undefined
      for (const field of ["user_id", "organization_id", "identifiers"]) storage.remove(key(field))
    },
  }
}
