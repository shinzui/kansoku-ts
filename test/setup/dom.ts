import { GlobalRegistrator } from "@happy-dom/global-registrator"

if (process.env.KANSOKU_TEST_NO_DOM !== "1") {
  GlobalRegistrator.register({ url: "http://localhost:3000/", width: 1280, height: 720 })
}
