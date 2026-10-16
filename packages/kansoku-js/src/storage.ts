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
        return storage ? storage.getItem(key) : fallback.get(key)
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
export function cookieStorage({
  domain,
  debug = false,
}: { domain?: string; debug?: boolean } = {}): StorageAdapter {
  const fallback = memoryStorage()
  const read = (key: string): string | null => {
    const prefix = `${encodeURIComponent(key)}=`
    const cookie =
      typeof document === "undefined"
        ? undefined
        : document.cookie
            .split(";")
            .map((value) => value.trim())
            .find((value) => value.startsWith(prefix))
    return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : null
  }
  function write(key: string, value: string, maxAge: number) {
    if (typeof document !== "undefined")
      document.cookie = `${encodeURIComponent(key)}=${encodeURIComponent(value)}; Path=/; SameSite=Lax; Max-Age=${maxAge}; Expires=${new Date(maxAge === 0 ? 0 : Date.now() + maxAge * 1000).toUTCString()}${domain ? `; Domain=${domain}` : ""}${typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : ""}`
  }
  let persistent = false
  try {
    const probe = `kansoku.probe.${Math.random()}`
    write(probe, "1", 60)
    persistent = read(probe) === "1"
    write(probe, "", 0)
  } catch {
    /* Failed cookies never expand to another persistent adapter. */
  }
  if (!persistent && debug)
    console.debug("kansoku-js: cookie persistence unavailable; using memory")
  return {
    get(key) {
      if (persistent) {
        try {
          return read(key)
        } catch {
          persistent = false
        }
      }
      return fallback.get(key)
    },
    set(key, value) {
      fallback.set(key, value)
      if (persistent) {
        try {
          write(key, value, 400 * 86400)
          if (read(key) !== value) persistent = false
        } catch {
          persistent = false
        }
      }
    },
    remove(key) {
      fallback.remove(key)
      if (persistent) {
        try {
          write(key, "", 0)
        } catch {
          persistent = false
        }
      }
    },
  }
}
export function resolveStorage(
  option: KansokuOptions["storage"],
  domain?: string,
  debug = false,
): StorageAdapter {
  if (typeof option === "object") return option
  if (option === "memory") return memoryStorage()
  if (option === "cookie") return cookieStorage({ domain, debug })
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
