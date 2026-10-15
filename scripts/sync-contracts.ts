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
const catalog = JSON.parse(events)
if (
  !Array.isArray(catalog.identifierKinds) ||
  catalog.identifierKinds.length === 0 ||
  !catalog.identifierKinds.every(
    (kind: unknown) => typeof kind === "string" && /^[a-z][a-z0-9_]*$/.test(kind),
  ) ||
  new Set(catalog.identifierKinds).size !== catalog.identifierKinds.length
)
  throw new Error("server catalog must publish a unique identifierKinds vocabulary")
const identifierSource =
  "// Generated from mori://shinzui/kansoku (docs/contracts/events.json; artifact-level URI pending).\n" +
  "export const IDENTIFIER_KINDS = " +
  JSON.stringify(catalog.identifierKinds) +
  " as const\n"
await mkdir("contracts", { recursive: true })
await Bun.write("contracts/openapi.json", openapi)
await Bun.write("contracts/events.json", events)
await Bun.write("packages/kansoku-js/src/generated/identifier-kinds.ts", identifierSource)
await Bun.write("contracts/KANSOKU_COMMIT", `${commit}\n`)
console.log(`pinned mori://shinzui/kansoku @ ${commit}`)
console.log(`wrote contracts/openapi.json (${Buffer.byteLength(openapi)} bytes)`)
console.log(`wrote contracts/events.json (${Buffer.byteLength(events)} bytes)`)
