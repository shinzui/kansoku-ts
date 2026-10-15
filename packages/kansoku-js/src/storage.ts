import type { KansokuOptions, StorageAdapter } from "./types.js"
export type { StorageAdapter } from "./types.js"

export function memoryStorage(): StorageAdapter {
  const values = new Map<string, string>()
  return {
    get: (key) => values.get(key) ?? null,
    set: (key, value) => {
      values.set(key, value)
    },
    remove: (key) => {
      values.delete(key)
    },
  }
}
function browserStorage(kind: "localStorage" | "sessionStorage"): StorageAdapter {
  const fallback = memoryStorage()
  let storage: Storage | undefined
  try {
    storage = globalThis[kind]
    const probe = `kansoku.probe.${Math.random()}`
    storage?.setItem(probe, "1")
    storage?.removeItem(probe)
  } catch {
    storage = undefined
  }
  return {
    get(key) {
      try {
        return storage?.getItem(key) ?? fallback.get(key)
      } catch {
        return fallback.get(key)
      }
    },
    set(key, value) {
      fallback.set(key, value)
      try {
        storage?.setItem(key, value)
      } catch {
        storage = undefined
      }
    },
    remove(key) {
      fallback.remove(key)
      try {
        storage?.removeItem(key)
      } catch {
        storage = undefined
      }
    },
  }
}
export const localStorageAdapter = (): StorageAdapter => browserStorage("localStorage")
export const sessionStorageAdapter = (): StorageAdapter => browserStorage("sessionStorage")
export function cookieStorage({ domain }: { domain?: string } = {}): StorageAdapter {
  const fallback = memoryStorage()
  function write(key: string, value: string, maxAge: number) {
    try {
      if (typeof document !== "undefined")
        document.cookie = `${encodeURIComponent(key)}=${encodeURIComponent(value)}; Path=/; SameSite=Lax; Max-Age=${maxAge}; Expires=${new Date(maxAge === 0 ? 0 : Date.now() + maxAge * 1000).toUTCString()}${domain ? `; Domain=${domain}` : ""}${typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : ""}`
    } catch {
      /* Storage is optional. */
    }
  }
  return {
    get(key) {
      try {
        const prefix = `${encodeURIComponent(key)}=`
        const cookie =
          typeof document === "undefined"
            ? undefined
            : document.cookie
                .split(";")
                .map((v) => v.trim())
                .find((v) => v.startsWith(prefix))
        if (cookie) return decodeURIComponent(cookie.slice(prefix.length))
      } catch {
        /* Fall back to memory. */
      }
      return fallback.get(key)
    },
    set(key, value) {
      fallback.set(key, value)
      write(key, value, 400 * 86400)
    },
    remove(key) {
      fallback.remove(key)
      write(key, "", 0)
    },
  }
}
export function resolveStorage(option: KansokuOptions["storage"], domain?: string): StorageAdapter {
  if (typeof option === "object") return option
  if (option === "memory") return memoryStorage()
  if (option === "cookie") return cookieStorage({ domain })
  return localStorageAdapter()
}
export function readJSON(storage: StorageAdapter, key: string): unknown {
  try {
    const value = storage.get(key)
    return value === null ? undefined : JSON.parse(value)
  } catch {
    return undefined
  }
}
