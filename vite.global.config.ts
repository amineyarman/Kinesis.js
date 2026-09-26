import { resolve } from "node:path"
import { defineConfig } from "vite"

// The <script> build: one minified file that exposes window.Kinesis and starts itself.
export default defineConfig({
  build: {
    target: "es2020",
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, "src/global.ts"),
      name: "Kinesis",
      formats: ["iife"],
      fileName: () => "kinesis.global.js",
    },
  },
})
