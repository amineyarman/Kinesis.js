import { cssProperties } from "./spec"

let registered = false
let sheet: HTMLStyleElement | undefined

function registerProperties(): boolean {
  if (typeof window === "undefined") return false
  const css = window.CSS
  if (!css || typeof css.registerProperty !== "function") return false
  if (registered) return true
  cssProperties.forEach((property) => {
    try {
      css.registerProperty({
        name: property.name,
        syntax: "*",
        inherits: property.inherits,
        initialValue: property.defaultValue,
      })
    } catch {
      undefined
    }
  })
  registered = true
  return true
}

function installFallbackSheet(): void {
  if (typeof document === "undefined" || sheet) return
  const decls = cssProperties
    .filter((property) => !property.inherits)
    .map((property) => `${property.name}:${property.defaultValue};`)
    .join("")
  sheet = document.createElement("style")
  sheet.textContent = `[data-kinesis] :where(*){${decls}}`
  document.head.prepend(sheet)
}

export function registerCssProperties(): void {
  if (!registerProperties()) installFallbackSheet()
}
