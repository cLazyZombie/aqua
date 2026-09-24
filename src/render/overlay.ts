// 시간대·폭풍 색보정, 비와 번개, 비네트, 후처리 체인, 타이틀·사건 자막·도감 창.

import type { SceneAssets } from "./assets";
import type { Frame, Rgba, Sprite, TextItem } from "./draw";
import { WHITE, fract, fullUv, hash, mix, pixelRect, rgb, rgba, roundHalfAway, solids, textured } from "./draw";
import type { View } from "./scene";
import { type Aquarium, HEIGHT, WIDTH } from "./simapi";

/// 색보정 띠, 노을, 폭풍의 비와 번개, 비네트.
export function appendScreen(frame: Frame, view: View, game: Aquarium, assets: SceneAssets): void {
  const screen = view.shift(0);
  const twilight = game.twilight();
  const night = game.nightStrength();
  const storm = game.weather.strength;
  const golden = game.golden;
  if (twilight > 0.01 || night > 0.01 || storm > 0.01 || golden > 0.01) {
    const rows: Sprite[] = [];
    for (let row = 0; row < HEIGHT / 2; row++) {
      const y = row * 2;
      const nearSurface = Math.pow(Math.min(1, Math.max(0, 1 - y / (HEIGHT * 0.85))), 1.4);
      let warm = mix([255, 255, 255], [255, 128, 118], twilight * (0.2 + 0.8 * nearSurface));
      warm = mix(warm, [255, 196, 120], golden * (0.25 + 0.6 * nearSurface));
      const gloomy = mix(warm, [128, 140, 158], storm * 0.7);
      const grade = mix(gloomy, [34, 50, 112], night);
      rows.push(pixelRect(screen[0], screen[1] + y, WIDTH, 2, fullUv(), rgb(grade, 1), 30));
    }
    frame.layers.push(solids("time-of-day", "multiply", rows));
  }
  if (twilight > 0.01 || golden > 0.01) {
    const tone = mix([255, 128, 70], [255, 190, 60], golden / Math.max(0.01, golden + twilight));
    const strength = Math.max(0.6 * twilight, 0.55 * golden);
    frame.layers.push(textured("sunset", assets.skylight, "additive", [pixelRect(screen[0], screen[1], WIDTH, HEIGHT, fullUv(), rgb(tone, strength), 31)]));
  }
  if (storm > 0.01) appendRain(frame, view, game, storm);
  const flash = game.weather.flash;
  if (flash > 0.01) {
    frame.layers.push(textured("lightning", assets.skylight, "additive", [pixelRect(screen[0], screen[1], WIDTH, HEIGHT, fullUv(), rgba(215, 235, 255, flash * 0.9), 35)]));
  }
  frame.layers.push(textured("vignette", assets.vignette, "alpha", [pixelRect(screen[0], screen[1], WIDTH, HEIGHT, fullUv(), WHITE, 40)]));
}

/// 물속에서 올려다본 비. 수면 띠 위에 물결 고리가 번지고 물방울 왕관이 튀며 잔기포가 가라앉는다.
function appendRain(frame: Frame, view: View, game: Aquarium, storm: number): void {
  const screen = view.shift(0);
  const light: Sprite[] = [];
  for (let drop = 0; drop < 110; drop++) {
    const seed = drop * 7.31;
    const period = 0.55 + hash(seed) * 0.55;
    const clock = game.time + hash(seed + 1) * period;
    const cycle = Math.floor(clock / period);
    const t = fract(clock / period);
    const x = hash(seed * 1.7 + cycle * 3.13) * (WIDTH + 20) - 10 + screen[0];
    const depth = Math.pow(hash(seed * 2.3 + cycle * 1.91), 0.8);
    const y = 3 + depth * 24 + screen[1];
    const scale = 0.55 + depth * 0.9;
    const fade = storm * Math.pow(1 - t, 1.4);
    const radius = 1 + t * 7 * scale;
    const points = Math.trunc(Math.min(28, Math.max(6, radius * 3)));
    for (let point = 0; point < points; point++) {
      const angle = (point / points) * Math.PI * 2;
      light.push(pixelRect(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius * 0.3, 1, 1, fullUv(), rgba(220, 238, 250, fade * (0.35 + 0.35 * depth)), 32));
    }
    if (t < 0.14) {
      const splash = storm * (1 - t / 0.14);
      for (const [dx, dy] of [
        [0, -2],
        [-1, -1],
        [1, -1],
        [0, -3],
      ]) {
        light.push(pixelRect(x + dx, y + dy * scale, 1, 1, fullUv(), rgba(240, 250, 255, splash * 0.8), 32));
      }
    }
    if (t >= 0.05 && t < 0.9 && drop % 2 === 0) {
      for (let bead = 0; bead < 2; bead++) {
        const drift = (hash(seed + bead * 5) - 0.5) * 5;
        const sink = t * (6 + bead * 4) * scale;
        light.push(pixelRect(x + drift, y + 2 + sink, 1, 1, fullUv(), rgba(200, 235, 250, fade * 0.5), 32));
      }
    }
  }
  for (let glint = 0; glint < 60; glint++) {
    const seed = glint * 3.9 + 400;
    const flicker = Math.pow(Math.sin(game.time * (9 + hash(seed) * 7) + hash(seed + 1) * 30) * 0.5 + 0.5, 8);
    if (flicker < 0.2) continue;
    const x = hash(seed + 2) * WIDTH + screen[0];
    const y = 2 + hash(seed + 3) * 22 + screen[1];
    light.push(pixelRect(x, y, 2, 1, fullUv(), rgba(230, 245, 255, storm * flicker * 0.5), 32));
  }
  frame.layers.push(solids("rain", "additive", light));
}

/// 후처리 체인. 발광 bloom → 밝은 픽셀 bloom → 두드림 일렁임 → 수중 픽셀 후처리.
export function appendPost(frame: Frame, view: View, game: Aquarium): void {
  if (frame.bloomLayers.length > 0 || frame.alphaMaskBloomLayers.length > 0) {
    frame.post.push({ kind: "bloom-hdr", settings: { intensity: 0.9, threshold: 1, softKnee: 0.4, radius: 0.55 } });
  }
  frame.post.push({ kind: "bloom-frame", settings: { intensity: 0.3, threshold: 0.8, softKnee: 0.2, radius: 0.45 } });
  for (const [x, y, age, scale] of game.ripples()) {
    const center = view.toScreen(x, y);
    const centerUv: [number, number] = [center[0] / view.viewport[0], center[1] / view.viewport[1]];
    [0, 0.2, 0.4].forEach((delay, ring) => {
      const progress = Math.min(1, Math.max(0, (age - delay) / 0.9));
      if (progress <= 0 || progress >= 1) return;
      frame.post.push({
        kind: "screen",
        effect: {
          kind: "pulse",
          centerUv,
          direction: [1, 0],
          progress,
          radiusUv: 0.3 * scale,
          aspect: view.viewport[0] / view.viewport[1],
          intensity: Math.pow(1 - progress, 1.2) * [1, 0.65, 0.4][ring] * Math.min(1, 0.4 + scale),
          bandWidth: 0.09,
          offsetStrength: 0.045,
          edgeOpacity: 0,
          desaturation: 0,
        },
      });
    });
  }
  const size: [number, number] = [(WIDTH * view.zoom) / view.viewport[0], (HEIGHT * view.zoom) / view.viewport[1]];
  frame.post.push({
    kind: "screen",
    effect: {
      kind: "underwater",
      centerUv: [(1 - size[0]) * 0.5, (1 - size[1]) * 0.5],
      direction: size,
      progress: game.time % 3600,
      radiusUv: game.look.palette ? 1 : 0,
      aspect: game.look.crt ? 1 : 0,
      intensity: 1 + game.weather.strength,
      bandWidth: 0.6 + 0.4 * game.nightStrength(),
      offsetStrength: 0,
      edgeOpacity: 0,
      desaturation: 0.12 - 0.25 * game.weather.strength,
    },
  });
}

/// 타이틀, 게임 중에는 사건 자막 또는 펼친 도감 창.
export function appendUi(frame: Frame, view: View, game: Aquarium): void {
  if (!game.started) {
    appendTitle(frame, view, game);
    return;
  }
  if (game.dex.open) {
    appendDex(frame, view, game);
    return;
  }
  appendBanner(frame, view, game);
}

/// 월드 좌표 사각형 안에 글자 한 줄을 놓는다.
export function label(frame: Frame, view: View, rect: [number, number, number, number], text: string, size: number, color: Rgba, align: "left" | "center"): void {
  const corner = view.toScreen(rect[0], rect[1]);
  frame.texts.push({
    x: Math.trunc(corner[0]),
    y: Math.trunc(corner[1]),
    w: Math.trunc(rect[2] * view.zoom),
    h: Math.trunc(rect[3] * view.zoom),
    text,
    fontSize: Math.trunc(size * view.zoom),
    bold: false,
    color,
    shadow: { color: [4, 14, 32, color[3]], dx: Math.trunc(view.zoom), dy: Math.trunc(view.zoom) },
    align,
  });
}

/// 한글 11px·영문 6px 기준의 대략적인 글자 폭(월드 픽셀)이다.
export function textWidth(text: string): number {
  let width = 0;
  for (const c of text) width += c.charCodeAt(0) < 128 ? 6 : 11;
  return width;
}

/// 사건이 시작될 때 화면 위 가운데에 잠깐 뜨는 자막.
function appendBanner(frame: Frame, view: View, game: Aquarium): void {
  const banner = game.director.banner;
  if (!banner) return;
  const alpha = banner.alpha();
  const [edge, mark]: [[number, number, number], string] =
    banner.rarity === "Common" ? [[150, 220, 240], ""] : banner.rarity === "Rare" ? [[120, 255, 220], "◆ "] : [[255, 214, 90], "★ "];
  const text = `${mark}${banner.text}`;
  const width = roundHalfAway(textWidth(text) + 24);
  const screen = view.shift(0);
  const left = roundHalfAway(screen[0] + (WIDTH - width) * 0.5);
  const top = screen[1] + 12 - (1 - alpha) * 6;
  frame.layers.push(
    solids("banner", "alpha", [
      pixelRect(left - 1, top - 1, width + 2, 18, fullUv(), rgba(4, 14, 32, 0.9 * alpha), 50),
      pixelRect(left, top, width, 16, fullUv(), rgba(14, 40, 70, 0.88 * alpha), 51),
      pixelRect(left, top, width, 1, fullUv(), rgb(edge, alpha), 52),
      pixelRect(left, top + 15, width, 1, fullUv(), rgb(edge, alpha * 0.6), 52),
    ]),
  );
  label(frame, view, [left, top, width, 16], text, 11, [edge[0], edge[1], edge[2], Math.trunc(alpha * 255)], "center");
}

/// Tab으로 여는 목격 도감.
function appendDex(frame: Frame, view: View, game: Aquarium): void {
  const screen = view.shift(0);
  const entries = game.dexEntries();
  const seen = entries.filter((entry) => entry.seen).length;
  const [left, top, width, height] = [screen[0] + 24, screen[1] + 14, WIDTH - 48, HEIGHT - 28];
  frame.layers.push(
    solids("dex-panel", "alpha", [
      pixelRect(left - 1, top - 1, width + 2, height + 2, fullUv(), rgba(150, 220, 240, 0.9), 60),
      pixelRect(left, top, width, height, fullUv(), rgba(8, 24, 46, 0.94), 61),
      pixelRect(left + 8, top + 20, width - 16, 1, fullUv(), rgba(150, 220, 240, 0.5), 62),
    ]),
  );
  // 한 쪽에 3열 × 17줄. 생물이 먼저, 사건이 나중에 이어진다.
  const PER_PAGE = 51;
  const pages = Math.max(1, Math.ceil(entries.length / PER_PAGE));
  const page = game.dex.page % pages;
  const title = `목격 도감  ${seen}/${entries.length}   ◀ ${page + 1}/${pages} ▶   (←→ 넘기기, Tab 닫기)`;
  label(frame, view, [left, top + 3, width, 14], title, 11, [255, 236, 160, 255], "center");
  const columnWidth = (width - 20) / 3;
  entries.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE).forEach((entry, slot) => {
    const column = Math.trunc(slot / 17);
    const row = slot % 17;
    const x = left + 10 + column * columnWidth;
    const y = top + 24 + row * 12;
    const event = entry.key.startsWith("event:");
    let text: string;
    let color: Rgba;
    if (entry.seen) {
      text = event ? `◆ ${entry.name}` : entry.name;
      color = event ? [150, 255, 220, 255] : [226, 246, 255, 255];
    } else {
      text = event ? "◆ ???" : "???";
      color = event ? [80, 130, 125, 255] : [90, 120, 150, 255];
    }
    label(frame, view, [x, y, columnWidth, 11], text, 9, color, "left");
  });
}

function appendTitle(frame: Frame, view: View, game: Aquarium): void {
  const unit = view.zoom * 0.5;
  const top = view.viewport[1] * 0.5 - HEIGHT * view.zoom * 0.5;
  const at = (y: number) => Math.trunc(top + y * unit);
  const px = (value: number) => Math.max(1, roundHalfAway(value * unit));
  const title: TextItem = {
    x: 0,
    y: at(150),
    w: Math.trunc(view.viewport[0]),
    h: px(110),
    text: "AQUA",
    fontSize: px(88),
    bold: true,
    color: [240, 253, 250, 255],
    shadow: { color: [4, 16, 44, 255], dx: px(4), dy: px(4) },
    align: "center",
  };
  frame.texts.push(title);
  const blink = fract(game.time * 1.6) < 0.62 ? 255 : 0;
  frame.texts.push({
    x: 0,
    y: at(262),
    w: Math.trunc(view.viewport[0]),
    h: px(44),
    text: "PRESS ANY KEY",
    fontSize: px(22),
    bold: false,
    color: [255, 236, 150, blink],
    shadow: { color: [4, 16, 44, blink], dx: px(2), dy: px(2) },
    align: "center",
  });
}
