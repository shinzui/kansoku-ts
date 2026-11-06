import type { InternalClient } from "./client.js"
import type { AnalyticsEvent, JsonObject } from "./types.js"
import type { Sample } from "./vitals.js"

// Internal loader seam; deliberately absent from the package entry exports.
export const measurementLoader = { load: () => import("./vitals.js") }

export function createVitalCapture(
  core: InternalClient,
  copy: (original: AnalyticsEvent, name: string, properties: JsonObject) => AnalyticsEvent,
) {
  let original: AnalyticsEvent | undefined
  let retired = false
  let hiddenBeforeLoad = false
  let loading: ReturnType<typeof measurementLoader.load> | undefined
  let pending = new Map<string, Sample>()
  const emitted = new Set<string>()
  let restored = false
  const retire = () => {
    original = undefined
    pending.clear()
    retired = true
  }
  const ready = () => {
    if (core.isSuppressed() || (original && original.anonymousId !== core.getAnonymousId()))
      retire()
    return original && !retired
  }
  const finalize = (immediate: boolean) => {
    if (!ready()) return
    const events: AnalyticsEvent[] = []
    for (const sample of pending.values()) {
      if (emitted.has(sample.id) || immediate !== (sample.name === "FCP" || sample.name === "TTFB"))
        continue
      emitted.add(sample.id)
      events.push(copy(original!, "web_vital", { metric: sample.name, value: sample.value }))
    }
    core.enqueueMany(events)
  }
  core.onStart(() => {
    if (typeof document === "undefined") return
    let active = true
    let detach: (() => void) | undefined
    const exit = core.onExit(() => {
      if (!detach) hiddenBeforeLoad = true
      finalize(false)
    })
    const resume = (event: PageTransitionEvent) => {
      if (!event.persisted) return
      original = undefined
      retired = false
      hiddenBeforeLoad = false
      restored = true
      pending.clear()
      emitted.clear()
      if (!detach) attach()
    }
    window.addEventListener("pageshow", resume)
    const attach = () => {
      if (!active || hiddenBeforeLoad) return
      loading ??= measurementLoader.load()
      void loading
        .then((module) => {
          if (!active || hiddenBeforeLoad || detach) return
          // The measurement module exposes only finite, nonnegative, supported samples.
          detach = module.subscribe((sample) => {
            if (
              (sample.navigationType === "back-forward-cache") !== restored ||
              (restored && sample.name === "TTFB")
            )
              return
            pending.set(sample.name, sample)
            finalize(true)
          })
        })
        .catch((error) => {
          if (core.config.debug) console.debug("kansoku-js: vitals", error)
        })
    }
    const idle = typeof requestIdleCallback === "function"
    const timer = idle
      ? requestIdleCallback(attach, { timeout: 1000 })
      : core.config.timers.setTimeout(attach, 0)
    return () => {
      active = false
      if (idle) cancelIdleCallback(timer as number)
      else core.config.timers.clearTimeout(timer as ReturnType<typeof setTimeout>)
      detach?.()
      exit()
      window.removeEventListener("pageshow", resume)
    }
  })
  return {
    retire,
    page(event: AnalyticsEvent) {
      if (!original && !retired) {
        original = event
        finalize(true)
      }
    },
  }
}
