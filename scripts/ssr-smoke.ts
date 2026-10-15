import { createKansoku } from "../packages/kansoku-js/src/index.js"

if (typeof window !== "undefined") throw new Error("ssr-smoke requires no DOM globals")
const client = createKansoku({
  baseUrl: "http://localhost:0",
  writeKey: "ksk_w_test",
  storage: "memory",
  persistQueue: false,
  fetch: (async (_input, init) =>
    Response.json(
      { accepted: JSON.parse(String(init?.body)).length, rejected: [] },
      { status: 202 },
    )) as typeof fetch,
})
client.page()
client.identify("u")
client.experiment("exp", "a")
client.stop()
client.start()
client.reset()
await client.shutdown()
console.log("ssr-smoke: ok")
