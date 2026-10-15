import { createKansoku } from "kansoku-js"

import "./style.css"

const app = document.querySelector<HTMLDivElement>("#app")!
const baseUrl = import.meta.env.VITE_KANSOKU_BASE_URL
const writeKey = import.meta.env.VITE_KANSOKU_WRITE_KEY
if (!baseUrl || !writeKey) {
  app.textContent =
    "Set VITE_KANSOKU_BASE_URL and VITE_KANSOKU_WRITE_KEY in .env.local, then restart Vite."
} else {
  app.innerHTML = `<h1>Kansoku · vanilla browser example</h1><nav><a href="/">Home</a> <a href="/pricing">Pricing</a> <a href="/docs">Docs</a></nav><main></main><p><button id="cta">Track CTA</button> <button id="flush">Flush</button></p><output aria-label="Delivery stats"></output>`
  const render = () => {
    const name = location.pathname === "/" ? "Home" : location.pathname.slice(1)
    document.title = `Kansoku · ${name}`
    app.querySelector("main")!.textContent =
      `${name}: navigate to another page and watch delivery stats.`
  }
  render()
  const client = createKansoku({
    baseUrl,
    writeKey,
    sourceService: "vanilla-example",
    onDrop: (info) => console.warn("Kansoku dropped events", info),
  })
  const update = () => {
    app.querySelector("output")!.textContent = JSON.stringify(client.stats)
  }
  app.querySelectorAll("nav a").forEach((link) =>
    link.addEventListener("click", (event) => {
      event.preventDefault()
      history.pushState({}, "", link.getAttribute("href"))
      render()
    }),
  )
  window.addEventListener("popstate", render)
  app.querySelector("#cta")!.addEventListener("click", () => {
    client.track("cta_clicked", { cta: "pricing" })
    update()
  })
  app.querySelector("#flush")!.addEventListener("click", async () => {
    await client.flush()
    update()
  })
  setInterval(update, 1000)
  update()
}
