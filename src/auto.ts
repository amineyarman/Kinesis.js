import { initKinesis } from "./api"

/** Starts Kinesis as soon as the document is ready. */
export function autoStart(): void {
  if (typeof document === "undefined") return
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => initKinesis(), { once: true })
  } else {
    initKinesis()
  }
}

// Importing this module is enough: `import "@amineyarman/kinesis/auto"`.
autoStart()

export { initKinesis }
