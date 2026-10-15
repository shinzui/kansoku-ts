import { afterEach } from "bun:test"

import { createFetchMock } from "../../../test/helpers/fetch-mock.js"
import { createKansoku } from "../src/index.js"
import type { AnalyticsEvent, DropInfo, KansokuClient, KansokuOptions } from "../src/types.js"

const clients: KansokuClient[] = []
afterEach(async () => {
  for (const client of clients.splice(0).reverse()) await client.shutdown()
})
export function fixture(options: Partial<KansokuOptions> = {}) {
  const mock = createFetchMock()
  const drops: DropInfo[] = []
  const client = createKansoku({
    baseUrl: "https://analytics.test",
    writeKey: "ksk_w_test",
    fetch: mock.fetch,
    storage: "memory",
    persistQueue: false,
    autocapture: { pageViews: false, sessions: false },
    onDrop: (info) => drops.push(info),
    ...options,
  })
  clients.push(client)
  return {
    client,
    mock,
    drops,
    events: () => mock.requests.flatMap((r) => r.body as AnalyticsEvent[]),
  }
}
export const nextNavigation = () => new Promise<void>((resolve) => setTimeout(resolve, 5))
