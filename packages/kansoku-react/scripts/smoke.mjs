import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

import { createElement, useContext } from "react"
import { renderToString } from "react-dom/server"

import { KansokuContext, KansokuProvider, createNoopClient, useKansoku } from "../dist/index.js"

const mode = process.env.NODE_ENV
assert.ok(mode === "development" || mode === "production", "Set NODE_ENV before starting Node")
assert.equal(typeof window, "undefined")

const entry = await readFile(new URL("../dist/index.js", import.meta.url), "utf8")
assert.match(entry, /^['"]use client['"];?/)
assert.match(entry, /['"]react\/jsx-runtime['"]/)
assert.doesNotMatch(entry, /react\/jsx-dev-runtime/)

let fetchCalls = 0
const originalFetch = globalThis.fetch
globalThis.fetch = () => {
  fetchCalls++
  throw new Error("Server rendering must not fetch")
}

function Consumer({ expectedClient }) {
  const context = useContext(KansokuContext)
  const client = useKansoku()
  assert.notEqual(context, null, "Provider must supply context during server rendering")
  assert.equal(context.client, client)
  assert.equal(client.isOptedOut(), true)
  if (expectedClient) assert.equal(client, expectedClient)
  return createElement("span", null, "child")
}

try {
  const options = { baseUrl: "https://k.test", writeKey: "w", sourceService: "s" }
  assert.equal(
    renderToString(createElement(KansokuProvider, { options }, createElement(Consumer))),
    "<span>child</span>",
  )
  const client = createNoopClient()
  assert.equal(
    renderToString(
      createElement(
        KansokuProvider,
        { client },
        createElement(Consumer, { expectedClient: client }),
      ),
    ),
    "<span>child</span>",
  )
  assert.equal(fetchCalls, 0)
} finally {
  globalThis.fetch = originalFetch
}

console.log(`kansoku-react package-smoke: ${mode} ok`)
