#!/usr/bin/env node
// headless 캡처: 한 번 빌드(dist)한 뒤 vite preview로 띄우고 Playwright Chromium으로 장면마다 PNG와 상태 JSON을 남긴다.
// 개발 서버는 파일이 바뀌면 페이지를 다시 읽어 캡처가 끊기므로 쓰지 않는다.
// 사용: pnpm capture [장면 이름...]   (결과: output/capture/<name>.png, .json)

import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";
import { build, preview } from "vite";

import { SCENARIOS, sizeOf, webQuery } from "./scenarios.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = resolve(ROOT, "output/capture");

/// playwright 패키지가 요구하는 브라우저 빌드가 없으면 이미 받아 둔 가장 새 headless shell을 쓴다.
function executablePath() {
  if (process.env.AQUA_CHROMIUM) return process.env.AQUA_CHROMIUM;
  if (existsSync(chromium.executablePath())) return undefined;
  const cache = resolve(homedir(), "Library/Caches/ms-playwright");
  const builds = existsSync(cache)
    ? readdirSync(cache)
        .filter((name) => name.startsWith("chromium_headless_shell-"))
        .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]))
    : [];
  for (const build of builds) {
    const candidate = resolve(cache, build, "chrome-headless-shell-mac-arm64/chrome-headless-shell");
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

async function main() {
  const only = process.argv.slice(2);
  const scenarios = only.length ? SCENARIOS.filter((s) => only.includes(s.name)) : SCENARIOS;
  mkdirSync(OUTPUT, { recursive: true });
  if (!process.env.AQUA_SKIP_BUILD) await build({ root: ROOT, logLevel: "error" });
  const server = await preview({ root: ROOT, logLevel: "error", preview: { port: 0, strictPort: false } });
  const address = server.httpServer.address();
  const base = `http://localhost:${address.port}/`;
  const browser = await chromium.launch({
    executablePath: executablePath(),
    args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"],
  });
  try {
    for (const scenario of scenarios) {
      const { width, height } = sizeOf(scenario);
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
      page.on("pageerror", (error) => console.error(`[${scenario.name}] page error:`, error.message));
      const image = resolve(OUTPUT, `${scenario.name}.png`);
      await page.goto(`${base}?${webQuery(scenario)}&image=${encodeURIComponent(image)}`);
      await page.waitForFunction(() => window.__aquaReady === true || window.__aquaError !== undefined, null, { timeout: 120000 });
      const error = await page.evaluate(() => window.__aquaError);
      if (error) throw new Error(`${scenario.name}: ${error}`);
      await page.screenshot({ path: image });
      const report = await page.evaluate(() => window.__aquaReport);
      writeFileSync(resolve(OUTPUT, `${scenario.name}.json`), JSON.stringify(report, null, 2));
      if (scenario.enter) {
        await page.evaluate(() => window.__aquaEnter());
        await page.screenshot({ path: resolve(OUTPUT, `${scenario.name}-entered.png`) });
      }
      console.log(`captured ${scenario.name} (${width}x${height}) creatures=${report.active_count}`);
      await page.close();
    }
  } finally {
    await browser.close();
    await new Promise((done) => server.httpServer.close(done));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
