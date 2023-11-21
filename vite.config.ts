import { defineConfig } from "vite"

export default defineConfig({
  root: "src/",
  publicDir: false,
  assetsInclude: ["**/data/**"],
  base: "./",
  build: {
    target: "esnext",
    polyfillModulePreload: false,
    outDir: "../dst/",
    emptyOutDir: true,
  },
})
