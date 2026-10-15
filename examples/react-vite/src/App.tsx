import { useExperiment, useIdentify, useKansoku, useTrack } from "kansoku-react"
import { useState } from "react"
import { Link, Route, Routes } from "react-router"

function PricingPanel({ variant }: { variant: string }) {
  useExperiment("pricing_layout", variant)
  return <p>Pricing layout: {variant}</p>
}
function Pricing() {
  const [variant, setVariant] = useState("control")
  return (
    <>
      <h2>Pricing</h2>
      <PricingPanel variant={variant} />
      <button onClick={() => setVariant(variant === "control" ? "variant_b" : "control")}>
        Toggle variant
      </button>
    </>
  )
}
export function App() {
  const client = useKansoku()
  const track = useTrack()
  const [user, setUser] = useState<{ id: string; plan: string }>()
  const [userId, setUserId] = useState("user_42")
  useIdentify(user?.id, { plan: user?.plan ?? "team" })
  return (
    <>
      <h1>Kansoku · React Router example</h1>
      <nav>
        <Link to="/">Home</Link>
        <Link to="/pricing">Pricing</Link>
        <Link to="/account">Account</Link>
      </nav>
      <main>
        <Routes>
          <Route
            path="/"
            element={
              <>
                <h2>Home</h2>
                <button onClick={() => track("cta_clicked", { cta: "pricing" })}>Track CTA</button>
              </>
            }
          />
          <Route path="/pricing" element={<Pricing />} />
          <Route
            path="/account"
            element={
              <>
                <h2>Account</h2>
                <form
                  onSubmit={(event) => {
                    event.preventDefault()
                    setUser({ id: userId, plan: "team" })
                  }}
                >
                  <label>
                    User ID{" "}
                    <input value={userId} onChange={(event) => setUserId(event.target.value)} />
                  </label>
                  <button type="submit">Sign in</button>
                </form>
                <p>{user ? `Signed in as ${user.id}` : "Anonymous"}</p>
                <button
                  onClick={() => {
                    client.reset()
                    setUser(undefined)
                  }}
                >
                  Sign out
                </button>
              </>
            }
          />
        </Routes>
      </main>
      <button onClick={() => void client.flush()}>Flush</button>
    </>
  )
}
