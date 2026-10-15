export {}
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
if (exceeded) process.exit(1)
