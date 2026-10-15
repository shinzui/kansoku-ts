import type { KansokuClient } from "kansoku-js"
import { useCallback } from "react"

import { useKansoku } from "./useKansoku.js"

export function useTrack(): KansokuClient["track"] {
  const client = useKansoku()
  return useCallback((...args) => client.track(...args), [client])
}
