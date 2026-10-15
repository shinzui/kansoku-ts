import { rm } from "node:fs/promises"
import { resolve } from "node:path"

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
  minify: false,
  external,
  banner,
})
if (!result.success) {
  for (const log of result.logs) console.error(log)
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
