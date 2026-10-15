import { expect, test } from "bun:test"

import { readAttribution } from "../src/attribution.js"

test("maps UTM parameters and omits absent and empty attribution", () => {
  expect(
    readAttribution(
      {
        href: "https://test/pricing",
        search: "?utm_source=email&utm_medium=&utm_campaign=launch&utm_content=cta&utm_term=word",
      },
      "https://referrer.test",
    ),
  ).toEqual({
    url: "https://test/pricing",
    referrer: "https://referrer.test",
    utmSource: "email",
    utmCampaign: "launch",
    utmContent: "cta",
    utmTerm: "word",
  })
  expect(readAttribution({ href: "https://test", search: "" }, "")).toEqual({ url: "https://test" })
})
