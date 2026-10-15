import type { KansokuOptions } from "./types.js"

export function installNavigationCapture(
  state: { timers: NonNullable<KansokuOptions["timers"]> },
  onNavigate: () => void,
): () => void {
  if (typeof window === "undefined" || typeof history === "undefined") return () => {}
  const originalPush = history.pushState
  const originalReplace = history.replaceState
  let active = true
  let pending: ReturnType<typeof setTimeout> | undefined
  const schedule = () => {
    if (!active || pending !== undefined) return
    pending = state.timers.setTimeout(() => {
      pending = undefined
      if (active) onNavigate()
    }, 0)
  }
  const push: History["pushState"] = function (this: History, ...args) {
    originalPush.apply(this, args)
    schedule()
  }
  const replace: History["replaceState"] = function (this: History, ...args) {
    originalReplace.apply(this, args)
    schedule()
  }
  history.pushState = push
  history.replaceState = replace
  window.addEventListener("popstate", schedule)
  return () => {
    active = false
    if (pending !== undefined) state.timers.clearTimeout(pending)
    window.removeEventListener("popstate", schedule)
    if (history.pushState === push) history.pushState = originalPush
    if (history.replaceState === replace) history.replaceState = originalReplace
  }
}
