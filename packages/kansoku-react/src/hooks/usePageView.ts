import type { JsonObject, KansokuClient } from "kansoku-js"
import { useEffect, useRef } from "react"

import { useKansoku } from "./useKansoku.js"

declare const process: { env?: { NODE_ENV?: string } }

let warned = false
export function usePageView(key: string, properties?: JsonObject): void {
  const client = useKansoku()
  const latest = useRef(properties)
  const previous = useRef<{ client: KansokuClient; key: string } | undefined>(undefined)
  latest.current = properties
  useEffect(() => {
    if (previous.current?.client === client && previous.current.key === key) return
    const production = typeof process !== "undefined" && process.env?.NODE_ENV === "production"
    if (client.config.autocapture.pageViews && !production && !warned) {
      warned = true
      console.warn(
        "kansoku-react: usePageView is active but kansoku-js autocapture.pageViews is still enabled; pass autocapture: { pageViews: false } to createKansoku or KansokuProvider options to avoid duplicate page_view events",
      )
    }
    client.page(latest.current)
    previous.current = { client, key }
  }, [client, key])
}
