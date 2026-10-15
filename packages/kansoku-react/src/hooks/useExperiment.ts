import type { JsonObject } from "kansoku-js"
import { useEffect, useRef } from "react"

import { useKansoku } from "./useKansoku.js"

/** Record rendered exposure; kansoku-js owns per-session deduplication, including StrictMode. */
export function useExperiment(experiment: string, variant: string, properties?: JsonObject): void {
  const client = useKansoku()
  const latest = useRef(properties)
  latest.current = properties
  useEffect(() => {
    client.experiment(experiment, variant, latest.current)
  }, [client, experiment, variant])
}
