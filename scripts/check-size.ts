import { readdir } from "node:fs/promises"

const budgets = { "kansoku-js": 10 * 1024, "kansoku-react": 3 * 1024 }
let exceeded = false
console.log("package          raw      gzip     budget")
for (const [name, budget] of Object.entries(budgets)) {
  const file = Bun.file(`packages/${name}/dist/index.js`)
  if (!(await file.exists()))
    throw new Error(`${name}: missing dist/index.js; run just build first`)
  const raw = new Uint8Array(await file.arrayBuffer())
  const size = Bun.gzipSync(raw).byteLength
  console.log(
    `${name.padEnd(16)} ${String(raw.byteLength).padStart(7)} ${String(size).padStart(8)} ${String(budget).padStart(8)} ${size > budget ? "OVER BUDGET" : "ok"}`,
  )
  exceeded ||= size > budget
}

const measurements = (await readdir("packages/kansoku-js/dist")).filter(
  (name) => name.endsWith(".js") && name !== "index.js",
)
if (measurements.length !== 1 || !measurements[0]!.startsWith("vitals-"))
  throw new Error("kansoku-js must ship exactly one deferred vitals file and no shared chunks")
for (const name of measurements) {
  const raw = new Uint8Array(await Bun.file(`packages/kansoku-js/dist/${name}`).arrayBuffer())
  const size = Bun.gzipSync(raw).byteLength
  console.log(
    `${name} raw=${raw.length} gzip=${size} budget=5120 ${size > 5120 ? "OVER BUDGET" : "ok"}`,
  )
  if (size > 5120) process.exit(1)
}

if (exceeded) process.exit(1)
