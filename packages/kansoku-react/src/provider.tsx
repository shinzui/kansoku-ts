import { createKansoku } from "kansoku-js"
import type { KansokuClient, KansokuOptions } from "kansoku-js"
import { useEffect, useMemo, useState } from "react"
import type { ReactElement, ReactNode } from "react"

import { KansokuContext } from "./context.js"
import { createNoopClient } from "./noop-client.js"

export type KansokuProviderProps = (
  | { client: KansokuClient; options?: never }
  | { options: KansokuOptions; client?: never }
) & { children: ReactNode }

export function KansokuProvider(props: KansokuProviderProps): ReactElement {
  const [initial] = useState(() => ({
    client:
      props.client ??
      (typeof window === "undefined"
        ? createNoopClient()
        : createKansoku({ ...props.options!, autoStart: false })),
    owned: !props.client,
  }))
  const client = props.client ?? initial.client
  const ownsClient = !props.client && initial.owned
  useEffect(() => {
    if (!ownsClient) return
    client.start()
    return () => client.stop()
  }, [client, ownsClient])
  const value = useMemo(() => ({ client }), [client])
  return <KansokuContext.Provider value={value}>{props.children}</KansokuContext.Provider>
}
