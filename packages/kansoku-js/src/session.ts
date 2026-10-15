import { randomId } from "./envelope.js"
import { readJSON } from "./storage.js"
import type { StorageAdapter } from "./types.js"

interface SessionRecord {
  id: string
  lastActivityAt: number
}
export function createSession(storage: StorageAdapter, prefix: string, timeoutMs: number) {
  const key = `${prefix}.session`
  const loaded = readJSON(storage, key) as SessionRecord | undefined
  let record =
    loaded &&
    typeof loaded.id === "string" &&
    loaded.id.length &&
    Number.isFinite(loaded.lastActivityAt)
      ? loaded
      : undefined
  const save = () => storage.set(key, JSON.stringify(record))
  function rotate(nowMs: number) {
    record = { id: randomId(), lastActivityAt: nowMs }
    save()
    return { id: record.id, started: true }
  }
  return {
    current(nowMs: number) {
      // Read shared storage again so another tab's activity keeps this session alive.
      const shared = readJSON(storage, key) as SessionRecord | undefined
      if (
        shared &&
        typeof shared.id === "string" &&
        shared.id.length &&
        Number.isFinite(shared.lastActivityAt)
      )
        record = shared
      if (!record || nowMs - record.lastActivityAt > timeoutMs) return rotate(nowMs)
      return { id: record.id, started: false }
    },
    touch(nowMs: number) {
      if (record) {
        record.lastActivityAt = nowMs
        save()
      }
    },
    rotate,
  }
}
