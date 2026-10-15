import { defineConfig } from "@playwright/test"

const env = {
  VITE_KANSOKU_BASE_URL: process.env.KANSOKU_SMOKE_BASE_URL ?? "http://127.0.0.1:4180",
  VITE_KANSOKU_WRITE_KEY: process.env.KANSOKU_SMOKE_WRITE_KEY ?? "ksk_w_smoke",
}
export default defineConfig({
  testDir: ".",
  testMatch: "*.pw.ts",
  workers: 1,
  timeout: 20000,
  use: { browserName: "chromium", headless: true, baseURL: "http://127.0.0.1:4173" },
  webServer: [
    {
      command:
        "bun run --cwd examples/vanilla-vite build && bun run --cwd examples/vanilla-vite preview --port 4173 --strictPort",
      cwd: "../..",
      url: "http://127.0.0.1:4173",
      env,
      reuseExistingServer: false,
    },
    {
      command: "bun run --cwd examples/react-vite dev --port 4174 --strictPort",
      cwd: "../..",
      url: "http://127.0.0.1:4174",
      env,
      reuseExistingServer: false,
    },
  ],
})
