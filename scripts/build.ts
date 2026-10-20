import { rm } from "node:fs/promises"
import { resolve } from "node:path"

import { verifyBundle } from "./verify-bundle.js"

const root = await Bun.file(resolve(import.meta.dir, "../package.json")).json()
const requiredBun: string = root.engines.bun
if (!Bun.semver.satisfies(Bun.version, requiredBun)) {
  console.error(
    `scripts/build.ts requires bun ${requiredBun} (root package.json engines.bun); this is bun ${Bun.version}.`,
  )
  console.error(
    "Older bun drops the entry module's named re-exports (BUG-1). Build inside `nix develop`.",
  )
  process.exit(1)
}

const directory = resolve(process.argv[2] ?? ".")
const manifest = await Bun.file(resolve(directory, "package.json")).json()
await rm(resolve(directory, "dist"), { recursive: true, force: true })
const external = Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies })
if (external.includes("react")) external.push("react/jsx-runtime")
const banner: string | undefined = manifest.kansoku?.banner
const result = await Bun.build({
  entrypoints: [resolve(directory, "src/index.ts")],
  outdir: resolve(directory, "dist"),
  target: "browser",
  format: "esm",
  naming: "index.js",
  sourcemap: "linked",
  minify: true,
  external,
  banner,
})
if (!result.success) {
  for (const log of result.logs) console.error(log)
  process.exit(1)
}
const { exports, problems } = await verifyBundle(
  resolve(directory, "dist/index.js"),
  resolve(directory, "src/index.ts"),
)
if (problems.length > 0) {
  console.error(`${manifest.name}: dist/index.js does not match src/index.ts`)
  for (const problem of problems) console.error(`  ${problem}`)
  process.exit(1)
}
// Invoke the development shell's compiler, not the generator's TypeScript 5 peer.
const compiler = Bun.spawn(["tsc", "-p", "tsconfig.build.json"], {
  cwd: directory,
  stdout: "inherit",
  stderr: "inherit",
})
const code = await compiler.exited
if (code !== 0) process.exit(code)
console.log(`${manifest.name}: dist/index.js, dist/index.js.map, dist/index.d.ts`)
if (banner) console.log(`banner: ${banner}`)
console.log(`exports: ${exports.length} verified`)
