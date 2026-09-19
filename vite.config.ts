import { defineConfig } from "vite";
import path from "node:path";

export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(__dirname, "src/index.ts"), 
      name: "KinesisJS",
      fileName: (format) => `kinesis.${format}.js`,
    },
    rollupOptions: {
      external: [],
      output: {
        globals: {}, 
      },
    },
  },
});
