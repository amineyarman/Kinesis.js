export interface PropertyDefinition {
  name: string
  syntax: string
  initial: string
  inherits: boolean
}

const define = (name: string, syntax: string, initial: string, inherits = false): PropertyDefinition => ({
  name,
  syntax,
  initial,
  inherits,
})

/**
 * Every CSS custom property Kinesis reads or writes, with the `@property` registration that
 * makes the browser resolve units, `calc()`, tokens, and colors before Kinesis sees them.
 */
export const properties: readonly PropertyDefinition[] = [
  define("--k-motion", "<custom-ident> | <number>+", "smooth", true),
  define("--k-intensity", "<number>", "1", true),
  define("--k-perspective", "<length>", "1000px", true),

  define("--k-parallax", "<length>+", "0px"),
  define("--k-tilt", "<angle>+", "0deg"),
  define("--k-magnetic", "<number>", "0"),
  define("--k-repel", "<length>", "0px"),
  define("--k-follow", "<number>", "0"),
  define("--k-look", "<angle>", "0deg"),
  define("--k-point", "none | <angle>", "none"),
  define("--k-depth", "<length>", "0px"),
  define("--k-drag", "none | x | y | both", "none"),

  define("--k-when", "none | <custom-ident>+", "none"),
  define("--k-x", "<length>+", "0px"),
  define("--k-y", "<length>+", "0px"),
  define("--k-rotate", "<angle>+", "0deg"),
  define("--k-scale", "none | <number>+", "none"),
  define("--k-opacity", "none | <number>+", "none"),
  define("--k-blur", "<length>+", "0px"),
  define("--k-color", "none | <color>+", "none"),
  define("--k-background", "none | <color>+", "none"),

  define("--k-area", "scope | self | viewport", "scope"),
  define("--k-radius", "<length>", "200px"),
  define("--k-limit", "none | <length>", "none"),
  define("--k-axis", "both | x | y", "both"),
  define("--k-bounds", "none | parent | scope | viewport", "none"),
  define("--k-release", "throw | stay | return", "throw"),
  define("--k-delay", "<time>", "0s"),
  define("--k-stagger", "<time>", "0s"),
  define("--k-index", "<integer>", "-1"),
  define("--k-track", "none | pointer", "none"),

  define("--k-progress", "<number>", "0", true),
  define("--k-pointer-x", "<number>", "0.5", true),
  define("--k-pointer-y", "<number>", "0.5", true),
]

/** Properties whose presence makes an element a Kinesis target. */
export const triggers = [
  "--k-parallax",
  "--k-tilt",
  "--k-magnetic",
  "--k-repel",
  "--k-follow",
  "--k-look",
  "--k-point",
  "--k-depth",
  "--k-drag",
  "--k-when",
  "--k-track",
] as const

/** Variables Kinesis writes. Authors read them; they are never configuration. */
export const outputs = ["--k-progress", "--k-pointer-x", "--k-pointer-y"] as const

let typed = false
let attempted = false

/**
 * Registers the vocabulary once. Returns false when registration is unavailable or another
 * definition already claimed a name; config parsing then falls back to raw tokens.
 */
export function registerProperties(): boolean {
  if (attempted) return typed
  attempted = true
  if (typeof CSS === "undefined" || typeof CSS.registerProperty !== "function") return false
  typed = true
  for (const property of properties) {
    try {
      CSS.registerProperty({
        name: property.name,
        syntax: property.syntax,
        inherits: property.inherits,
        initialValue: property.initial,
      })
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "InvalidModificationError")) typed = false
    }
  }
  return typed
}
