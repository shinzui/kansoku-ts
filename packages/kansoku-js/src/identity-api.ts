import type { InternalClient } from "./client.js"
import { validateIdentifiers } from "./contract/validate.js"
import type { IdentifierKind, JsonObject } from "./types.js"

export function createIdentityApi(client: InternalClient) {
  function blocked(name: string, properties?: JsonObject): boolean {
    if (!client.isSuppressed()) return false
    client.enqueueBuilt(client.buildEvent(name, properties))
    return true
  }
  const validId = (value: unknown) => typeof value === "string" && value.length > 0
  return {
    identify(userId: string, traits?: JsonObject) {
      if (blocked("identify", traits)) return
      if (!validId(userId)) {
        client.drop("invalid", [], "userId must not be empty")
        return
      }
      client.identity.setUserId(userId)
      client.enqueueBuilt(client.buildEvent("identify", traits))
    },
    alias(previousId: string, newId: string, properties?: JsonObject) {
      if (blocked("alias", properties)) return
      if (!validId(previousId) || !validId(newId)) {
        client.drop("invalid", [], "alias IDs must not be empty")
        return
      }
      client.enqueueBuilt(
        client.buildEvent("alias", { previousId, newId, ...properties }, undefined, undefined, {
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
