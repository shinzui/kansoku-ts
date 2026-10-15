import type { InternalClient } from "./client.js"
import { validateExperimentName } from "./contract/validate.js"
import { readJSON } from "./storage.js"
import type { ExperimentOptions, JsonObject } from "./types.js"

export function recordExposure(
  client: InternalClient,
  experiment: string,
  variant: string,
  properties?: JsonObject,
  options?: ExperimentOptions,
) {
  if (client.isSuppressed()) {
    client.enqueueBuilt(
      client.buildEvent("experiment_viewed", { ...properties, experiment, variant }),
    )
    return
  }
  if (!validateExperimentName(experiment) || !validateExperimentName(variant)) {
    client.drop("invalid", [], "experiment and variant must match ^[a-z0-9_.:-]{1,128}$")
    return
  }
  const sessionId = client.getSessionId()
  const storageKey = `${client.config.storageKeyPrefix}.exposures`
  const loaded = readJSON(client.storage, storageKey) as
    | { sessionId?: unknown; keys?: unknown }
    | undefined
  const keys: string[] =
    loaded?.sessionId === sessionId && Array.isArray(loaded.keys)
      ? loaded.keys.filter((key): key is string => typeof key === "string")
      : []
  const key = `${experiment}\u0000${variant}`
  if (keys.includes(key) && !options?.force) return
  if (
    client.enqueueBuilt(
      client.buildEvent("experiment_viewed", { ...properties, experiment, variant }),
    )
  ) {
    if (!keys.includes(key)) keys.push(key)
    client.storage.set(storageKey, JSON.stringify({ sessionId, keys }))
  }
}
