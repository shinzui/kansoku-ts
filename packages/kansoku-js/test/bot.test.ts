import { expect, test } from "bun:test"

import { isBot } from "../src/bot.js"
import { fixture } from "./capture-helper.js"

test("synthetic matcher v1 classifies bounded representative bot and human agents", () => {
  for (const agent of [
    "Googlebot/2.1",
    "bingbot/2.0",
    "DuckDuckBot/1",
    "HeadlessChrome/140",
    "facebookexternalhit/1",
    "curl/8",
    "Wget/1",
    "python-requests/2",
    "Go-http-client/1",
    "SyntheticCrawler/1",
    "TestSpider/1",
  ])
    expect(isBot(agent)).toBe(true)
  for (const agent of [
    "",
    "Mozilla/5.0 Chrome/140 Safari/537",
    "Mozilla/5.0 Firefox/144",
    "Mobile Safari/604",
    "Botanist Reader/1",
    "robotics-app/1",
    "x".repeat(2048) + "Googlebot",
  ])
    expect(isBot(agent)).toBe(false)
})
test("flag, drop and off share privacy gates and never replace an existing true", async () => {
  const flag = fixture()
  flag.client.track("flag", {}, { context: { userAgent: "Googlebot/2.1" } })
  flag.client.track("true", {}, { context: { userAgent: "Chrome/140", bot: true } })
  await flag.client.flush()
  expect(flag.events().map((event) => event.context.bot)).toEqual([true, true])
  const drop = fixture({ botDetection: "drop" })
  drop.client.track("bot", {}, { context: { userAgent: "Googlebot/2.1" } })
  await drop.client.flush()
  expect(drop.events()).toHaveLength(0)
  expect(drop.drops[0]?.reason).toBe("bot")
  expect(drop.client.stats.dropped).toBe(1)
  const off = fixture({ botDetection: "off" })
  off.client.track("off", {}, { context: { userAgent: "Googlebot/2.1" } })
  await off.client.flush()
  expect(off.events()[0]?.context.bot).toBeUndefined()
  const privateClient = fixture({ botDetection: "drop", optOut: true })
  privateClient.client.track("private", {}, { context: { userAgent: "Googlebot/2.1" } })
  expect(privateClient.drops[0]?.reason).toBe("opted_out")
})
