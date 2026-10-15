import { createKansoku } from "../dist/index.js"

const server = Bun.serve({
  port: 0,
  async fetch(request) {
    if (new URL(request.url).pathname !== "/v1/batch") return new Response(null, { status: 404 })
    if (request.headers.get("X-Api-Key") !== "ksk_w_smoke")
      return new Response(null, { status: 401 })
    const events = await request.json()
    return Response.json({ accepted: events.length, rejected: [] }, { status: 202 })
  },
})
try {
  const client = createKansoku({
    baseUrl: server.url.origin,
    writeKey: "ksk_w_smoke",
    storage: "memory",
    persistQueue: false,
    autocapture: { pageViews: false, sessions: false },
  })
  for (const name of ["one", "two", "three"]) client.track(name)
  await client.flush()
  if (client.stats.accepted !== 3)
    throw new Error(`Unexpected stats: ${JSON.stringify(client.stats)}`)
  await client.shutdown()
  console.log(`accepted: ${client.stats.accepted}`)
} finally {
  server.stop(true)
}
