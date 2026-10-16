import type { InternalClient } from "./client.js"
import { validateIdentifiers } from "./contract/validate.js"

const parameter = "kansoku_aid"

export function consumeHandoff(client: InternalClient): void {
  if (typeof location === "undefined" || typeof history === "undefined") return
  const url = new URL(location.href)
  const values = url.searchParams.getAll(parameter)
  if (!values.length) return
  url.searchParams.delete(parameter)
  history.replaceState(history.state, "", url.href)
  const value = values[0]
  if (
    values.length !== 1 ||
    !value ||
    validateIdentifiers({ cookie: value }).length ||
    client.config.crossOriginLink.accept !== true ||
    client.isSuppressed()
  )
    return
  const current = client.identity.snapshot()
  if (current.userId) return
  if (!client.identity.hadPersistedIdentity) client.identity.adoptAnonymousId(value)
  else if (
    current.anonymousId !== value &&
    (!current.identifiers?.cookie || current.identifiers.cookie === value)
  )
    client.identity.setIdentifiers({ ...current.identifiers, cookie: value })
}

export function linkTo(client: InternalClient, input: string | URL): string {
  const url = new URL(input, typeof location === "undefined" ? undefined : location.href)
  url.searchParams.delete(parameter)
  if (
    client.isStarted() &&
    !client.isSuppressed() &&
    ["http:", "https:"].includes(url.protocol) &&
    !url.username &&
    !url.password &&
    client.config.crossOriginLink.allowedOrigins.includes(url.origin) &&
    (typeof location === "undefined" || url.origin !== location.origin)
  )
    url.searchParams.set(parameter, client.identity.snapshot().anonymousId)
  return url.href
}
