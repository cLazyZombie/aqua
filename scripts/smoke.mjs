#!/usr/bin/env node
// 창 모드(캡처 아님) 스모크 테스트: 빌드본을 띄워 몇 초 돌리며 키·마우스 입력을 넣고, 오류 없이 frame이 이어지는지 본다.
// 결과 화면은 output/capture/smoke-*.png에 남긴다.

import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";
import { build, preview } from "vite";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = resolve(ROOT, "output/capture");

function executablePath() {
  if (process.env.AQUA_CHROMIUM) return process.env.AQUA_CHROMIUM;
  if (existsSync(chromium.executablePath())) return undefined;
  const cache = resolve(homedir(), "Library/Caches/ms-playwright");
  const builds = readdirSync(cache).filter((n) => n.startsWith("chromium_headless_shell-")).sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));
  for (const b of builds) {
    const candidate = resolve(cache, b, "chrome-headless-shell-mac-arm64/chrome-headless-shell");
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

mkdirSync(OUTPUT, { recursive: true });
if (!process.env.AQUA_SKIP_BUILD) await build({ root: ROOT, logLevel: "error" });
const server = await preview({ root: ROOT, logLevel: "error", preview: { port: 0 } });
const browser = await chromium.launch({ executablePath: executablePath(), args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 700 }, deviceScaleFactor: 2 });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(`http://localhost:${server.httpServer.address().port}/`);
  await page.waitForFunction(() => window.__aquaReady === true || window.__aquaError !== undefined, null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: resolve(OUTPUT, "smoke-title.png") });
  // PWA: 매니페스트를 읽을 수 있고, Chromium이 설치를 막는 사유가 없고, 서비스 워커가 페이지를 제어해야 한다.
  const cdp = await page.context().newCDPSession(page);
  const manifest = await cdp.send("Page.getAppManifest");
  if (manifest.errors?.length) errors.push(`manifest: ${JSON.stringify(manifest.errors)}`);
  if (!manifest.data?.includes("Aqua")) errors.push("manifest was not found");
  const worker = await page.evaluate(async () => {
    const ready = await Promise.race([navigator.serviceWorker.ready.then(() => true), new Promise((done) => setTimeout(() => done(false), 8000))]);
    return { ready, scope: (await navigator.serviceWorker.getRegistration())?.scope ?? null };
  });
  if (!worker.ready) errors.push("service worker did not activate");
  try {
    const { installabilityErrors } = await cdp.send("Page.getInstallabilityErrors");
    if (installabilityErrors.length) errors.push(`installability: ${JSON.stringify(installabilityErrors)}`);
    console.log(`pwa: installable=${installabilityErrors.length === 0}, service worker=${worker.scope}`);
  } catch (error) {
    // headless shell 일부는 이 명령을 모른다. 그때는 매니페스트와 서비스 워커만 본다.
    console.log(`pwa: installability check unavailable (${error.message}), service worker=${worker.scope}`);
  }
  await page.keyboard.press("Space");
  await page.mouse.move(550, 350);
  await page.waitForTimeout(500);
  await page.mouse.click(550, 350);
  await page.mouse.click(600, 300, { button: "right" });
  // 화면을 격자로 훑으며 올리고(호버) 왼쪽·오른쪽 클릭한다. 생물에 맞으면 먹이·교감, 빈 곳이면 먹이·일렁임이다.
  for (let row = 0; row < 3; row++) {
    for (let column = 0; column < 6; column++) {
      const x = 120 + column * 170;
      const y = 150 + row * 170;
      await page.mouse.move(x, y);
      await page.waitForTimeout(60);
      await page.mouse.click(x, y);
      await page.mouse.click(x, y, { button: "right" });
    }
  }
  // 배경 컨셉을 두 번 바꿔 텍스처 교체와 새 배치를 확인한다.
  await page.keyboard.press("KeyB");
  await page.waitForTimeout(400);
  await page.keyboard.press("KeyB");
  await page.waitForTimeout(400);
  await page.keyboard.press("KeyE");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: resolve(OUTPUT, "smoke-live.png") });
  // 소리: 첫 입력 뒤 소리 장치가 돌고, 시간대 곡·수면 찰랑임·기포 소리를 받아 튼다. M으로 끄고 다시 켠다.
  const playing = await page
    .waitForFunction(() => {
      const s = window.__aquaSound?.state();
      return s && s.context === "running" && s.music !== null && s.lapping && s.bubbles ? s : null;
    }, null, { timeout: 30000 })
    .then((handle) => handle.jsonValue())
    .catch(async () => page.evaluate(() => window.__aquaSound?.state() ?? null));
  console.log(`sound: ${JSON.stringify(playing)}`);
  if (!playing || playing.context !== "running" || playing.music === null || !playing.lapping || !playing.bubbles) errors.push(`sound did not start: ${JSON.stringify(playing)}`);
  await page.keyboard.press("KeyM");
  await page.waitForTimeout(700);
  const muted = await page.evaluate(() => ({ state: window.__aquaSound?.state(), toast: document.getElementById("toast")?.textContent }));
  if (muted.state?.context !== "suspended" || muted.toast !== "소리 끔") errors.push(`mute failed: ${JSON.stringify(muted)}`);
  await page.keyboard.press("KeyM");
  await page.waitForTimeout(300);
  const unmuted = await page.evaluate(() => ({ state: window.__aquaSound?.state(), toast: document.getElementById("toast")?.textContent }));
  if (unmuted.state?.context !== "running" || unmuted.toast !== "소리 켬") errors.push(`unmute failed: ${JSON.stringify(unmuted)}`);
  await page.setViewportSize({ width: 800, height: 800 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: resolve(OUTPUT, "smoke-resized.png") });
  await page.keyboard.press("Tab");
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(OUTPUT, "smoke-dex.png") });
  const state = await page.evaluate(() => window.__aquaError ?? "ok");
  console.log(`smoke: ${state}, errors=${errors.length}`);
  for (const e of errors) console.log("  ", e);
  if (errors.length || state !== "ok") process.exitCode = 1;
} finally {
  await browser.close();
  await new Promise((done) => server.httpServer.close(done));
}
