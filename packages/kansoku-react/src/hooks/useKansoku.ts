import type { KansokuClient } from "kansoku-js"
import { useContext } from "react"

import { KansokuContext } from "../context.js"
import { createNoopClient } from "../noop-client.js"

const serverClient = createNoopClient()
export function useKansoku(): KansokuClient {
  const value = useContext(KansokuContext)
  if (value) return value.client
  if (typeof window === "undefined") return serverClient
  throw new Error("useKansoku must be used inside <KansokuProvider>")
}
