import type { JsonObject, KansokuClient } from "kansoku-js"
import { useEffect, useRef } from "react"

import { useKansoku } from "./useKansoku.js"

export function useIdentify(userId: string | undefined, traits?: JsonObject): void {
  const client = useKansoku()
  const latest = useRef(traits)
  latest.current = traits
  const previous = useRef<{ client: KansokuClient; userId: string } | undefined>(undefined)
  useEffect(() => {
    if (!userId) {
      previous.current = undefined
      return
    }
    if (previous.current?.client === client && previous.current.userId === userId) return
    client.identify(userId, latest.current)
    previous.current = { client, userId }
  }, [client, userId])
}
