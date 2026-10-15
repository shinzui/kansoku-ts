export function attachExitFlush(target: Window, onExit: () => void): () => void {
  let hidden = false
  const exit = () => {
    if (!hidden) {
      hidden = true
      onExit()
    }
  }
  const visibility = () => {
    if (target.document.visibilityState === "hidden") exit()
    else hidden = false
  }
  const show = () => {
    hidden = false
  }
  target.document.addEventListener("visibilitychange", visibility)
  target.addEventListener("pagehide", exit)
  target.addEventListener("pageshow", show)
  return () => {
    target.document.removeEventListener("visibilitychange", visibility)
    target.removeEventListener("pagehide", exit)
    target.removeEventListener("pageshow", show)
  }
}
