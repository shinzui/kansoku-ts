import { afterEach } from "bun:test"

import { cleanup } from "@testing-library/react"
import { createKansoku } from "kansoku-js"
import type { AnalyticsEvent, KansokuClient, KansokuOptions } from "kansoku-js"
import type { ReactNode } from "react"

import { createFetchMock } from "../../../test/helpers/fetch-mock.js"
import { KansokuProvider } from "../src/index.js"

const clients: KansokuClient[] = []
afterEach(async () => {
  cleanup()
  await Promise.all(clients.splice(0).map((client) => client.shutdown()))
})
export function fixture(options: Partial<KansokuOptions> = {}) {
  const mock = createFetchMock()
  const config: KansokuOptions = {
    baseUrl: "https://analytics.test",
    writeKey: "ksk_w_test",
    fetch: mock.fetch,
    storage: "memory",
    persistQueue: false,
    autocapture: { pageViews: false, sessions: false },
    ...options,
  }
  const client = createKansoku(config)
  clients.push(client)
  const wrapper = ({ children }: { children: ReactNode }) => (
    <KansokuProvider client={client}>{children}</KansokuProvider>
  )
  return {
    client,
    mock,
    config,
    wrapper,
    events: () => mock.requests.flatMap((request) => request.body as AnalyticsEvent[]),
  }
}
