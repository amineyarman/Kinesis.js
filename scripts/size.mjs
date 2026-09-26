// Reports minified + gzipped size for what a user actually ships.
import { build } from "esbuild"
import { gzipSync } from "node:zlib"

const cases = {
  "core (initKinesis)": 'import { initKinesis } from "./src/index.ts"; initKinesis()',
  "core + kinesis()": 'import { initKinesis, kinesis } from "./src/index.ts"; initKinesis(); kinesis("x")',
  "everything": 'export * from "./src/index.ts"',
  "text": 'export * from "./src/text.ts"',
  "audio": 'export * from "./src/audio.ts"',
  "vue": 'export * from "./src/vue.ts"',
}

for (const [name, contents] of Object.entries(cases)) {
  const result = await build({
    stdin: { contents, resolveDir: process.cwd(), loader: "ts" },
    bundle: true,
    minify: true,
    format: "esm",
    write: false,
    logLevel: "silent",
  })
  const code = result.outputFiles[0].contents
  console.log(`${name.padEnd(22)} ${(code.length / 1024).toFixed(1).padStart(6)} KB min  ${(gzipSync(code).length / 1024).toFixed(1).padStart(5)} KB gzip`)
}
