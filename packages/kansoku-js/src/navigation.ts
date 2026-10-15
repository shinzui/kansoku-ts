import type { KansokuOptions } from "./types.js"

const wrappers = new WeakMap<Function, { previous: Function; active: () => boolean }>()
function unwrap<T extends Function>(fn: T): T {
  let current: Function = fn
  for (let entry = wrappers.get(current); entry && !entry.active(); entry = wrappers.get(current))
    current = entry.previous
  return current as T
}

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
  wrappers.set(push, { previous: originalPush, active: () => active })
  wrappers.set(replace, { previous: originalReplace, active: () => active })
  history.pushState = push
  history.replaceState = replace
  window.addEventListener("popstate", schedule)
  return () => {
    active = false
    if (pending !== undefined) state.timers.clearTimeout(pending)
    window.removeEventListener("popstate", schedule)
    if (history.pushState === push) history.pushState = unwrap(originalPush)
    if (history.replaceState === replace) history.replaceState = unwrap(originalReplace)
  }
}
