import { describe, expect, test } from "bun:test"

import { renderToString } from "react-dom/server"

import { createFetchMock } from "../../../../test/helpers/fetch-mock.js"
import {
  KansokuProvider,
  useExperiment,
  useIdentify,
  useIdentifyOnce,
  useKansoku,
  usePageView,
  useTrack,
} from "../../src/index.js"

describe.skipIf(typeof window !== "undefined")("server rendering", () => {
  test("all hooks render with no DOM or network activity, including without a provider", () => {
    const mock = createFetchMock()
    function Consumer() {
      const client = useKansoku()
      useTrack()("server-render")
      usePageView("server")
      useIdentify("user")
      useIdentifyOnce("user", { initial_plan: "free" })
      useExperiment("exp", "a")
      expect(client.isOptedOut()).toBe(true)
      return <span>server rendered</span>
    }
    expect(typeof window).toBe("undefined")
    expect(
      renderToString(
        <KansokuProvider
          options={{ baseUrl: "https://analytics.test", writeKey: "ksk_w_test", fetch: mock.fetch }}
        >
          <Consumer />
        </KansokuProvider>,
      ),
    ).toContain("server rendered")
    expect(renderToString(<Consumer />)).toContain("server rendered")
    expect(mock.requests).toHaveLength(0)
  })
})
