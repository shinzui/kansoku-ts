import { resolve } from "node:path"
import { pathToFileURL } from "node:url"

export type BundleVerification = { exports: string[]; problems: string[] }

function describe(error: unknown): string {
  if (error instanceof AggregateError && error.errors.length > 0)
    return error.errors.map(describe).join("; ")
  return error instanceof Error ? error.message : String(error)
}

// Compares the bundle's runtime exports with the source entry's: names and typeof.
export async function verifyBundle(
  bundlePath: string,
  sourcePath: string,
): Promise<BundleVerification> {
  const source: Record<string, unknown> = await import(pathToFileURL(resolve(sourcePath)).href)
  let bundle: Record<string, unknown>
  try {
    bundle = await import(pathToFileURL(resolve(bundlePath)).href)
  } catch (error) {
    return { exports: [], problems: [`bundle cannot be imported: ${describe(error)}`] }
  }
  const expected = Object.keys(source).sort()
  const actual = Object.keys(bundle).sort()
  const problems: string[] = []
  for (const name of expected) {
    if (!(name in bundle)) problems.push(`${name}: missing from bundle`)
    else if (typeof bundle[name] !== typeof source[name])
      problems.push(`${name}: source ${typeof source[name]}, bundle ${typeof bundle[name]}`)
  }
  for (const name of actual) if (!(name in source)) problems.push(`${name}: not in source`)
  return { exports: actual, problems }
}

if (import.meta.main) {
  const [bundlePath, sourcePath] = process.argv.slice(2)
  if (!bundlePath || !sourcePath) {
    console.error("usage: bun scripts/verify-bundle.ts <bundle> <source-entry>")
    process.exit(2)
  }
  const { exports, problems } = await verifyBundle(bundlePath, sourcePath)
  if (problems.length > 0) {
    for (const problem of problems) console.error(problem)
    process.exit(1)
  }
  console.log(`exports: ${exports.length} verified`)
}
