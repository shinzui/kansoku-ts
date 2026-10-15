import type { KansokuClient } from "kansoku-js"
import { createContext } from "react"

export interface KansokuContextValue {
  client: KansokuClient
}
export const KansokuContext = createContext<KansokuContextValue | null>(null)
