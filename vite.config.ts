import { defineConfig } from "vite"

export default defineConfig({
  root: "src/",
  publicDir: "public",
  assetsInclude: ["**/data/**"],
  base: "./",
  build: {
    target: "esnext",
    polyfillModulePreload: false,
    outDir: "../dst/",
    emptyOutDir: true,
  },
})
