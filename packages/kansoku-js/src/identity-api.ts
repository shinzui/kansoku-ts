import type { InternalClient } from "./client.js"
import { validateGovernedTraits, validateIdentifiers } from "./contract/validate.js"
import type { IdentifierKind, JsonObject, TrackOptions } from "./types.js"

export function createIdentityApi(client: InternalClient) {
  function blocked(name: string, properties?: JsonObject): boolean {
    if (!client.isSuppressed()) return false
    client.enqueueBuilt(client.buildEvent(name, properties))
    return true
  }
  const validId = (value: unknown) => typeof value === "string" && value.length > 0
  function identify(
    name: "identify" | "identify_once",
    userId: string,
    traits?: JsonObject,
    options?: TrackOptions,
  ) {
    if (blocked(name, traits)) return
    if (!validId(userId)) {
      client.drop("invalid", [], "userId must not be empty")
      return
    }
    const errors = validateGovernedTraits({
      eventName: name,
      schemaVersion: options?.schemaVersion ?? client.config.schemaVersions[name],
      userId,
      properties: traits ?? {},
    })
    if (errors.length) {
      client.drop("invalid", [], errors.join("; "))
      return
    }
    client.identity.setUserId(userId)
    client.enqueueBuilt(client.buildEvent(name, traits, options))
  }
  return {
    identify(userId: string, traits?: JsonObject, options?: TrackOptions) {
      identify("identify", userId, traits, options)
    },
    identifyOnce(userId: string, traits?: JsonObject, options?: TrackOptions) {
      identify("identify_once", userId, traits, options)
    },
    alias(previousId: string, newId: string, properties?: JsonObject) {
      if (blocked("alias", properties)) return
      if (!validId(previousId) || !validId(newId)) {
        client.drop("invalid", [], "alias IDs must not be empty")
        return
      }
      client.enqueueBuilt(
        client.buildEvent("alias", { ...properties, previousId, newId }, undefined, undefined, {
          anonymousId: previousId,
          userId: newId,
        }),
      )
    },
    group(organizationId: string, properties?: JsonObject) {
      if (blocked("group", properties)) return
      if (!validId(organizationId)) {
        client.drop("invalid", [], "organizationId must not be empty")
        return
      }
      client.identity.setOrganizationId(organizationId)
      client.enqueueBuilt(client.buildEvent("group", properties))
    },
    setIdentifiers(identifiers: Partial<Record<IdentifierKind, string>>) {
      if (client.isSuppressed()) {
        client.drop("opted_out", [], "setIdentifiers")
        return
      }
      const errors = validateIdentifiers(identifiers)
      if (errors.length) {
        client.drop("invalid", [], errors.join("; "))
        return
      }
      client.identity.setIdentifiers(identifiers)
    },
    reset() {
      client.identity.clearUser()
      client.storage.remove(`${client.config.storageKeyPrefix}.exposures`)
      client.identity.rotateAnonymousId()
      client.rotateSession()
    },
  }
}
