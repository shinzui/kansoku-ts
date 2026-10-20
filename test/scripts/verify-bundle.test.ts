import { afterEach, beforeEach, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { verifyBundle } from "../../scripts/verify-bundle.js"

let directory: string
let source: string

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "verify-bundle-"))
  source = join(directory, "index.ts")
  await writeFile(
    source,
    'export const version = "1.0.0"\nexport function createKansoku() {}\nexport const SESSION_START = "session_start"\n',
  )
})

afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

async function bundle(name: string, contents: string): Promise<string> {
  const path = join(directory, name)
  await writeFile(path, contents)
  return path
}

test("accepts a bundle with the source's exports", async () => {
  const path = await bundle(
    "complete.js",
    'const v="1.0.0";function c(){}const e="session_start";export{v as version,c as createKansoku,e as SESSION_START}',
  )
  expect(await verifyBundle(path, source)).toEqual({
    exports: ["SESSION_START", "createKansoku", "version"],
    problems: [],
  })
})

test("rejects the BUG-1 shape, whose export list names undefined bindings", async () => {
  const path = await bundle(
    "bug-1.js",
    'const e="session_start";export{K as version,j as createKansoku,e as SESSION_START}',
  )
  const { problems } = await verifyBundle(path, source)
  expect(problems).toHaveLength(1)
  expect(problems[0]).toStartWith("bundle cannot be imported")
})

test("reports an export missing from the bundle", async () => {
  const path = await bundle(
    "missing.js",
    'const v="1.0.0";const e="session_start";export{v as version,e as SESSION_START}',
  )
  expect((await verifyBundle(path, source)).problems).toEqual([
    "createKansoku: missing from bundle",
  ])
})

test("reports an export only in the bundle", async () => {
  const path = await bundle(
    "extra.js",
    'const v="1.0.0";function c(){}const e="session_start";const d=1;export{v as version,c as createKansoku,e as SESSION_START,d as debug}',
  )
  expect((await verifyBundle(path, source)).problems).toEqual(["debug: not in source"])
})

test("reports an export whose type differs from the source", async () => {
  const path = await bundle(
    "wrong-type.js",
    'const v="1.0.0";const c="x";const e="session_start";export{v as version,c as createKansoku,e as SESSION_START}',
  )
  expect((await verifyBundle(path, source)).problems).toEqual([
    "createKansoku: source function, bundle string",
  ])
})
