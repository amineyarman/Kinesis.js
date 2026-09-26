import { resolve } from "node:path"
import { defineConfig } from "vite"

export default defineConfig({
  build: {
    target: "es2020",
    lib: {
      entry: {
        kinesis: resolve(__dirname, "src/index.ts"),
        text: resolve(__dirname, "src/text.ts"),
        audio: resolve(__dirname, "src/audio.ts"),
        vue: resolve(__dirname, "src/vue.ts"),
        auto: resolve(__dirname, "src/auto.ts"),
      },
      formats: ["es"],
    },
    rollupOptions: {
      output: {
        chunkFileNames: "shared-[hash].js",
      },
    },
  },
})
