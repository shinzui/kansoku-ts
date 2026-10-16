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
// Emit only governed trait metadata into the runtime bundle; the full catalog
// remains an offline contract artifact. Refuse incompatible declarations.
const setSchema = catalog.events?.identify?.versions?.find(
  (value: { version: number }) => value.version === 2,
)
const onceSchema = catalog.events?.identify_once?.versions?.find(
  (value: { version: number }) => value.version === 1,
)
if (!setSchema || !onceSchema)
  throw new Error("server catalog must include identify v2 and identify_once v1")
function traitTypes(schema: {
  properties: Array<{
    name: string
    type: string
    minimum?: number
    multipleOf?: number
    required: boolean
  }>
}) {
  return Object.fromEntries(
    schema.properties.map((property) => {
      if (!/^[a-z][a-z0-9_]*$/.test(property.name) || property.required)
        throw new Error("governed traits must have safe names and be optional")
      const type =
        property.type === "string"
          ? "string"
          : property.type === "number" && property.minimum === 0 && property.multipleOf === 1
            ? "integer"
            : undefined
      if (!type) throw new Error(`unsupported governed trait type: ${property.name}`)
      return [property.name, type]
    }),
  )
}
const traits = traitTypes(setSchema)
if (JSON.stringify(traits) !== JSON.stringify(traitTypes(onceSchema)))
  throw new Error("set/set-once trait catalogs disagree")
const traitSource =
  "// Generated from mori://shinzui/kansoku (docs/contracts/events.json; artifact-level URI pending).\n" +
  "export const USER_TRAIT_TYPES = " +
  JSON.stringify(traits) +
  " as const\n" +
  "export const GOVERNED_TRAIT_VERSIONS = { identify: 2, identify_once: 1 } as const\n"
await mkdir("contracts", { recursive: true })
await Bun.write("contracts/openapi.json", openapi)
await Bun.write("contracts/events.json", events)
await Bun.write("packages/kansoku-js/src/generated/identifier-kinds.ts", identifierSource)
await Bun.write("packages/kansoku-js/src/generated/trait-schema.ts", traitSource)
await Bun.write("contracts/KANSOKU_COMMIT", `${commit}\n`)
console.log(`pinned mori://shinzui/kansoku @ ${commit}`)
console.log(`wrote contracts/openapi.json (${Buffer.byteLength(openapi)} bytes)`)
console.log(`wrote contracts/events.json (${Buffer.byteLength(events)} bytes)`)
