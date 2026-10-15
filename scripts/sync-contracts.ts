import { mkdir } from "node:fs/promises"
import { parseArgs } from "node:util"

const { values } = parseArgs({
  options: {
    from: { type: "string", default: "../kansoku" },
    ref: { type: "string", default: "master" },
  },
})
function git(...args: string[]): string {
  const result = Bun.spawnSync(["git", "-C", values.from!, ...args])
  if (result.exitCode !== 0) throw new Error(result.stderr.toString())
  return result.stdout.toString()
}
const commit = git("rev-parse", "--verify", `${values.ref}^{commit}`).trim()
// Read both before writing so a missing source cannot leave half a contract refresh.
const openapi = git("show", `${commit}:docs/api/openapi.json`)
const events = git("show", `${commit}:docs/contracts/events.json`)
JSON.parse(openapi)
JSON.parse(events)
await mkdir("contracts", { recursive: true })
await Bun.write("contracts/openapi.json", openapi)
await Bun.write("contracts/events.json", events)
await Bun.write("contracts/KANSOKU_COMMIT", `${commit}\n`)
console.log(`pinned mori://shinzui/kansoku @ ${commit}`)
console.log(`wrote contracts/openapi.json (${Buffer.byteLength(openapi)} bytes)`)
console.log(`wrote contracts/events.json (${Buffer.byteLength(events)} bytes)`)
