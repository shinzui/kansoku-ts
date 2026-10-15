import { KansokuProvider } from "kansoku-react"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router"

import { App } from "./App.js"

import "../../vanilla-vite/src/style.css"

const root = document.querySelector<HTMLDivElement>("#app")!
const baseUrl = import.meta.env.VITE_KANSOKU_BASE_URL
const writeKey = import.meta.env.VITE_KANSOKU_WRITE_KEY
if (!baseUrl || !writeKey) {
  root.textContent =
    "Set VITE_KANSOKU_BASE_URL and VITE_KANSOKU_WRITE_KEY in .env.local, then restart Vite."
} else {
  createRoot(root).render(
    <StrictMode>
      <KansokuProvider
        options={{
          baseUrl,
          writeKey,
          sourceService: "react-example",
          onDrop: (info) => console.warn("Kansoku dropped events", info),
        }}
      >
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </KansokuProvider>
    </StrictMode>,
  )
}
