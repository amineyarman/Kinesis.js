import { initKinesis } from "./api"

/** Importing this module starts Kinesis as soon as the document is ready. */
if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => initKinesis(), { once: true })
  } else {
    initKinesis()
  }
}

export { initKinesis }
