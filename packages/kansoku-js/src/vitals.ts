import { onCLS, onFCP, onINP, onLCP, onTTFB } from "web-vitals"
import type { Metric } from "web-vitals"

export type Sample = Pick<Metric, "name" | "value" | "id" | "navigationType">
type Sink = (sample: Sample) => void
const sinks = new Set<Sink>()
const latest = new Map<string, Sample>()

export function vitalProperties(name: string, value: number) {
  return /^(LCP|INP|CLS|FCP|TTFB)$/.test(name) && Number.isFinite(value) && value >= 0
    ? { metric: name, value }
    : undefined
}

export function subscribe(sink: Sink) {
  sinks.add(sink)
  for (const sample of latest.values()) sink(sample)
  return () => {
    sinks.delete(sink)
  }
}

if (typeof document !== "undefined" && typeof PerformanceObserver !== "undefined") {
  addEventListener("pageshow", (event) => {
    if ((event as PageTransitionEvent).persisted) latest.clear()
  })
  const report = (metric: Metric) => {
    if (
      !vitalProperties(metric.name, metric.value) ||
      (metric.name === "TTFB" && metric.navigationType === "back-forward-cache")
    )
      return
    const sample: Sample = {
      name: metric.name,
      value: metric.value,
      id: metric.id,
      navigationType: metric.navigationType,
    }
    latest.set(metric.name, sample)
    for (const sink of sinks) sink(sample)
  }
  onFCP(report)
  onTTFB(report)
  onLCP(report, { reportAllChanges: true })
  onCLS(report, { reportAllChanges: true })
  onINP(report, { reportAllChanges: true })
}
