import { expect, test } from "bun:test"

import manifest from "../package.json"
import { version } from "../src/index.js"
test("version matches the manifest", () => expect(version).toBe(manifest.version))
