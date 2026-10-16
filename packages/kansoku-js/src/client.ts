import { collectContext, isDoNotTrackEnabled, isGlobalPrivacyControlEnabled } from "./context.js"
import { BUILT_IN_SCHEMA_VERSIONS, SESSION_START } from "./contract/events.js"
import { validateEvent } from "./contract/validate.js"
import type { AnalyticsEvent, JsonObject } from "./contract/wire.js"
import { buildEvent, randomId } from "./envelope.js"
import type { WebFields } from "./envelope.js"
import { recordExposure } from "./experiment.js"
import { createIdentityApi } from "./identity-api.js"
import { createIdentity } from "./identity.js"
import { attachExitFlush } from "./lifecycle.js"
import { installNavigationCapture } from "./navigation.js"
import { buildPageView } from "./page.js"
import { createQueue } from "./queue.js"
import { backoffDelayMs } from "./retry.js"
import { createSession } from "./session.js"
import { readJSON, resolveStorage, sessionStorageAdapter } from "./storage.js"
import { exitBudget, sendBatch, serializeBatch } from "./transport.js"
import type { ExperimentOptions } from "./types.js"
import type {
  DropReason,
  KansokuClient,
  KansokuOptions,
  ResolvedKansokuOptions,
  TrackOptions,
} from "./types.js"
import { version } from "./version.js"

const jsonBytesRaw = (body: string) => new TextEncoder().encode(body).byteLength

export function resolveOptions(options: KansokuOptions): ResolvedKansokuOptions {
  const url = new URL(options.baseUrl)
  if (!["http:", "https:"].includes(url.protocol))
    throw new TypeError("baseUrl must be HTTP or HTTPS")
  if (!options.writeKey) throw new TypeError("writeKey must not be empty")
  const config: ResolvedKansokuOptions = Object.freeze({
    sourceService: "",
    autoStart: true,
    exitTransport: "keepalive",
    flushAt: 20,
    flushIntervalMs: 5000,
    maxQueueSize: 1000,
    maxBatchEvents: 100,
    maxBatchBytes: 1048576,
    maxRetries: 5,
    retryBaseDelayMs: 500,
    requestTimeoutMs: 10000,
    persistQueue: true,
    storage: "localStorage",
    storageKeyPrefix: "kansoku",
    sessionTimeoutMs: 1800000,
    optOut: false,
    respectDoNotTrack: false,
    respectGlobalPrivacyControl: false,
    debug: false,
    ...options,
    baseUrl: options.baseUrl.replace(/\/+$/, ""),
    fetch: options.fetch ?? globalThis.fetch.bind(globalThis),
    now: options.now ?? Date.now,
    timers: options.timers ?? {
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
    },
    autocapture: Object.freeze({
      pageViews: true,
      sessions: true,
      pageLeave: true,
      ...options.autocapture,
    }),
    schemaVersions: Object.freeze({
      ...BUILT_IN_SCHEMA_VERSIONS,
      ...options.schemaVersions,
    }),
  })
  for (const field of [
    "flushAt",
    "flushIntervalMs",
    "maxQueueSize",
    "maxBatchEvents",
    "maxBatchBytes",
    "requestTimeoutMs",
    "sessionTimeoutMs",
  ] as const) {
    if (!Number.isSafeInteger(config[field]) || config[field] <= 0)
      throw new TypeError(`${field} must be a positive integer`)
  }
  if (
    !Number.isSafeInteger(config.maxRetries) ||
    config.maxRetries < 0 ||
    !Number.isFinite(config.retryBaseDelayMs) ||
    config.retryBaseDelayMs < 0
  )
    throw new TypeError("retry limits must be nonnegative")
  if (!["keepalive", "beacon"].includes(config.exitTransport))
    throw new TypeError("invalid exitTransport")
  return config
}

export function createInternalClient(options: KansokuOptions, deferStart = false) {
  const config = resolveOptions(options)
  const storage = resolveStorage(config.storage, config.cookieDomain)
  const mirror = sessionStorageAdapter()
  const queueKey = `${config.storageKeyPrefix}.queue`
  const optKey = `${config.storageKeyPrefix}.opt_out`
  const identity = createIdentity(storage, config.storageKeyPrefix)
  const session = createSession(storage, config.storageKeyPrefix, config.sessionTimeoutMs)
  const queue = createQueue(config.maxQueueSize)
  let optedOut = config.optOut || storage.get(optKey) === "true"
  if (config.optOut) storage.set(optKey, "true")
  if (config.persistQueue && !optedOut) queue.restore(readJSON(mirror, queueKey))
  if (optedOut) mirror.remove(queueKey)
  let started = false
  let terminal = false
  let exiting = false
  let closing = false
  let pendingSession: string | undefined
  let inFlight: Promise<void> | undefined
  const counters = {
    accepted: 0,
    bestEffortQueued: 0,
    rejected: 0,
    dropped: 0,
  }
  const exitListeners = new Set<() => void>()
  const providers = new Set<() => JsonObject>()
  const installers: Array<() => (() => void) | void> = []
  let teardowns: Array<() => void> = []
  let suppression = () => false

  const persist = () => {
    if (config.persistQueue) mirror.set(queueKey, JSON.stringify(queue.toJSON()))
  }
  function drop(reason: DropReason, events: AnalyticsEvent[], detail?: string) {
    counters.dropped += events.length
    try {
      config.onDrop?.({ reason, events, ...(detail ? { detail } : {}) })
    } catch {
      /* Analytics callbacks must not break application code. */
    }
    if (config.debug) console.debug(`kansoku-js: ${reason}`, detail ?? "", events.length)
  }
  const suppressed = () => optedOut || terminal || closing || suppression()
  function currentSession() {
    const current = session.current(config.now())
    if (current.started) pendingSession = current.id
    return current.id
  }
  function rawEvent(
    name: string,
    properties?: JsonObject,
    trackOptions?: TrackOptions,
    webFields?: WebFields,
    ids?: { anonymousId?: string; userId?: string },
  ): AnalyticsEvent {
    const baseContext: JsonObject = {}
    for (const provider of providers) Object.assign(baseContext, provider())
    return buildEvent(
      {
        identity: identity.snapshot(),
        sessionId: currentSession(),
        config,
        baseContext,
      },
      name,
      properties,
      trackOptions,
      webFields,
      ids,
    )
  }
  function enqueueBuilt(event: AnalyticsEvent): boolean {
    if (suppressed()) {
      drop("opted_out", [event], terminal || closing ? "shutdown" : undefined)
      return false
    }
    let errors = validateEvent(event)
    if (errors.length) {
      drop("invalid", [event], errors.join("; "))
      return false
    }
    try {
      const transformed = config.beforeSend ? config.beforeSend(event) : event
      if (transformed === null) {
        drop("before_send", [event])
        return false
      }
      event = transformed
      errors = validateEvent(event)
      if (errors.length) {
        drop("invalid", [event], errors.join("; "))
        return false
      }
      // Capture a snapshot; later caller mutations must not change queued identity or properties.
      event = JSON.parse(JSON.stringify(event)) as AnalyticsEvent
    } catch (error) {
      drop("invalid", [event], String(error))
      return false
    }
    if (!queue.enqueue(event)) {
      drop("queue_full", [event])
      return false
    }
    persist()
    if (started && !exiting && queue.size >= config.flushAt) void flush()
    return true
  }
  function boundEvent(
    name: string,
    properties?: JsonObject,
    trackOptions?: TrackOptions,
    webFields?: WebFields,
    ids?: { anonymousId?: string; userId?: string },
  ): AnalyticsEvent {
    const event = rawEvent(name, properties, trackOptions, webFields, ids)
    session.touch(config.now())
    if (!suppressed() && pendingSession && config.autocapture.sessions !== false) {
      pendingSession = undefined
      enqueueBuilt(rawEvent(SESSION_START, { sessionId: event.sessionId! }))
    }
    return event
  }
  function remove(batch: AnalyticsEvent[]) {
    const removed = queue.remove(new Set(batch.map((event) => event.eventId)))
    persist()
    return removed
  }
  async function deliver(
    batch: AnalyticsEvent[],
    keepalive = false,
    serialized?: string,
  ): Promise<void> {
    for (let attempt = 0; ; attempt++) {
      const active = new Set(queue.toJSON().map((event) => event.eventId))
      if (optedOut || !batch.some((event) => active.has(event.eventId))) return
      const outcome = await sendBatch(config, batch, {
        keepalive,
        ...(serialized ? { serialized } : {}),
      })
      if (outcome.kind === "accepted") {
        const removed = new Set(remove(batch).map((event) => event.eventId))
        const rejected = outcome.ack.rejected.flatMap((item) => {
          const event = batch[item.index]
          return event && removed.has(event.eventId) ? [event] : []
        })
        counters.accepted += removed.size - rejected.length
        counters.rejected += rejected.length
        if (rejected.length)
          drop("rejected", rejected, outcome.ack.rejected.flatMap((item) => item.errors).join("; "))
        return
      }
      if (outcome.kind === "permanent") {
        const events = remove(batch)
        if (events.length) drop("permanent_error", events, `HTTP ${outcome.status}`)
        return
      }
      if (outcome.kind === "too_large") {
        if (keepalive) return // Retain the mirror; normal delivery can split safely.
        // Keep both halves persisted until each has a terminal response.
        const half = Math.ceil(batch.length / 2)
        await deliver(batch.slice(0, half), keepalive)
        await deliver(batch.slice(half), keepalive)
        return
      }
      // Exit retries belong to the persisted mirror; avoid delays after page teardown.
      if (keepalive) return
      if (attempt >= config.maxRetries) {
        const events = remove(batch)
        if (events.length) drop("retries_exhausted", events, outcome.detail)
        return
      }
      await new Promise<void>((resolve) =>
        config.timers.setTimeout(
          resolve,
          Math.max(outcome.retryAfterMs ?? 0, backoffDelayMs(attempt, config.retryBaseDelayMs)),
        ),
      )
    }
  }
  function flush(): Promise<void> {
    if (inFlight) return inFlight
    // Defer the loop by one microtask so even synchronous injected transports share one promise.
    inFlight = Promise.resolve()
      .then(async () => {
        while (queue.size && !optedOut)
          await deliver(queue.peekBatch(config.maxBatchEvents, config.maxBatchBytes))
      })
      .finally(() => {
        inFlight = undefined
      })
    return inFlight
  }
  function exitFlush() {
    if (suppressed()) return
    exiting = true
    try {
      for (const listener of exitListeners) listener()
    } finally {
      exiting = false
    }
    const budget = exitBudget()
    const beacon = config.exitTransport === "beacon"
    const batch: AnalyticsEvent[] = []
    let serialized = ""
    for (const event of queue.toJSON()) {
      if (batch.length >= config.maxBatchEvents) break
      const candidate = serializeBatch(config, [...batch, event], beacon)
      if (jsonBytesRaw(candidate) > Math.min(config.maxBatchBytes, 61440 - budget.bytes)) continue
      batch.push(event)
      serialized = candidate
    }
    if (!batch.length) return
    const bytes = jsonBytesRaw(serialized)
    budget.bytes += bytes
    if (beacon) {
      try {
        if (
          typeof navigator !== "undefined" &&
          typeof navigator.sendBeacon === "function" &&
          navigator.sendBeacon(
            `${config.baseUrl}/v1/beacon`,
            new Blob([serialized], { type: "text/plain;charset=UTF-8" }),
          )
        ) {
          counters.bestEffortQueued += batch.length
          return // No response is available. Keep every ID in the queue mirror.
        }
      } catch {
        /* A refused/absent API can use the same reserved allowance. */
      }
      serialized = serializeBatch(config, batch)
      budget.bytes -= bytes
      const fallbackBytes = jsonBytesRaw(serialized)
      if (fallbackBytes + budget.bytes > 61440) return
      budget.bytes += fallbackBytes
      void deliver(batch, true, serialized).finally(() => {
        budget.bytes -= fallbackBytes
      })
    } else {
      void deliver(batch, true, serialized).finally(() => {
        budget.bytes -= bytes
      })
    }
  }
  function onStart(install: () => (() => void) | void) {
    installers.push(install)
    if (started) {
      const teardown = install()
      if (teardown) teardowns.push(teardown)
    }
  }
  onStart(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const schedule = () => {
      timer = config.timers.setTimeout(() => {
        if (started) {
          void flush()
          schedule()
        }
      }, config.flushIntervalMs)
    }
    schedule()
    const detach = typeof window === "undefined" ? () => {} : attachExitFlush(window, exitFlush)
    return () => {
      if (timer !== undefined) config.timers.clearTimeout(timer)
      detach()
    }
  })
  const client = {
    config,
    get stats() {
      return Object.freeze({ queued: queue.size, ...counters })
    },
    track(name: string, properties?: JsonObject, trackOptions?: TrackOptions) {
      try {
        if (suppressed()) {
          drop(
            "opted_out",
            [rawEvent(name, properties, trackOptions)],
            terminal || closing ? "shutdown" : undefined,
          )
          return
        }
        enqueueBuilt(boundEvent(name, properties, trackOptions))
      } catch (error) {
        drop("invalid", [], String(error))
      }
    },
    flush,
    start() {
      if (started || terminal || closing) return
      started = true
      for (const install of installers) {
        const teardown = install()
        if (teardown) teardowns.push(teardown)
      }
    },
    stop() {
      if (!started) return
      started = false
      for (const teardown of teardowns.reverse()) teardown()
      teardowns = []
      void flush()
    },
    async shutdown() {
      if (terminal) return
      closing = true
      client.stop()
      await flush()
      terminal = true
    },
    optOut() {
      optedOut = true
      storage.set(optKey, "true")
      const events = remove(queue.toJSON())
      if (events.length) drop("opted_out", events)
    },
    optIn() {
      optedOut = false
      storage.remove(optKey)
    },
    isOptedOut: () => optedOut,
    getAnonymousId: () => identity.snapshot().anonymousId,
    getUserId: () => identity.snapshot().userId,
    getSessionId: currentSession,
    buildEvent: boundEvent,
    enqueueBuilt,
    registerContextProvider(provider: () => JsonObject) {
      providers.add(provider)
      return () => {
        providers.delete(provider)
      }
    },
    onStart,
    onExit(listener: () => void) {
      exitListeners.add(listener)
      return () => {
        exitListeners.delete(listener)
      }
    },
    drop,
    isSuppressed: suppressed,
    setSuppression(check: () => boolean) {
      suppression = check
    },
    identity,
    session,
    storage,
    rotateSession() {
      const current = session.rotate(config.now())
      pendingSession = current.id
      if (!suppressed() && config.autocapture.sessions !== false) {
        pendingSession = undefined
        enqueueBuilt(rawEvent(SESSION_START, { sessionId: current.id }))
      }
    },
  }
  if (config.autoStart && !deferStart) client.start()
  return client
}
export type InternalClient = ReturnType<typeof createInternalClient>
export function createKansoku(options: KansokuOptions): KansokuClient {
  const core = createInternalClient(options, true)
  core.registerContextProvider(() => collectContext(version))
  core.setSuppression(
    () =>
      (core.config.respectDoNotTrack && isDoNotTrackEnabled()) ||
      (core.config.respectGlobalPrivacyControl && isGlobalPrivacyControlEnabled()),
  )
  let pageSnapshot: { event: AnalyticsEvent; started: number; left: boolean } | undefined
  const monotonic = () => performance.now()
  const leavePage = () => {
    if (
      !pageSnapshot ||
      pageSnapshot.left ||
      core.config.autocapture.pageLeave === false ||
      core.isSuppressed()
    )
      return
    pageSnapshot.left = true
    const original = pageSnapshot.event
    core.enqueueBuilt({
      ...original,
      eventId: randomId(),
      eventName: "page_leave",
      occurredAt: new Date(core.config.now()).toISOString(),
      receivedAt: new Date(core.config.now()).toISOString(),
      schemaVersion: core.config.schemaVersions.page_leave ?? 1,
      properties: {
        url: original.properties.url ?? "",
        path: original.properties.path ?? "",
        durationMs: Math.max(0, monotonic() - pageSnapshot.started),
      },
    })
  }
  core.onExit(leavePage)
  const client: KansokuClient = Object.assign(core, createIdentityApi(core), {
    page(properties?: JsonObject, trackOptions?: TrackOptions) {
      if (typeof document === "undefined") return
      if (core.isSuppressed()) {
        core.drop("opted_out", [])
        return
      }
      leavePage()
      const event = buildPageView(core, properties, trackOptions)
      if (core.enqueueBuilt(event)) pageSnapshot = { event, started: monotonic(), left: false }
    },
    experiment(
      experiment: string,
      variant: string,
      properties?: JsonObject,
      exposureOptions?: ExperimentOptions,
    ) {
      recordExposure(core, experiment, variant, properties, exposureOptions)
    },
  })
  let lastPage: string | undefined
  core.onStart(() => {
    if (core.config.autocapture.pageViews === false || typeof document === "undefined") return
    const capture = () => {
      if (core.isSuppressed()) return
      const key = location.origin + location.pathname + location.search
      if (key === lastPage) return
      client.page()
      lastPage = key
    }
    capture()
    const detach = installNavigationCapture(core.config, capture)
    const resume = (event: PageTransitionEvent) => {
      if (event.persisted) client.page()
    }
    window.addEventListener("pageshow", resume)
    return () => {
      detach()
      window.removeEventListener("pageshow", resume)
    }
  })
  if (core.config.autoStart) client.start()
  return client
}
