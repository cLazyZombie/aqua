import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  server: { port: 5173 },
  // three.js가 한 덩어리로 약 650KB라 경고 기준을 올린다.
  build: { target: "es2022", assetsInlineLimit: 0, chunkSizeWarningLimit: 1500 },
  test: { include: ["tests/**/*.test.ts"] },
});
