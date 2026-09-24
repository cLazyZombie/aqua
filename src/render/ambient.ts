// 소소한 볼거리: 은빛 무리 반짝임, 발광 생물의 바닥 빛 웅덩이, 바다눈, 구름 그림자, 달과 스넬의 창,
// 모래 발자국, 스쳐 터진 기포, 희귀 색 변이의 반짝임, 방문자 단골 개체의 무늬.
// 모두 시간·개체 번호·해시로 정해 시뮬레이션 난수를 쓰지 않는다. 가산 빛은 하얗게 타지 않게 세기에 상한을 둔다.

import type { SceneAssets } from "./assets";
import { bodyOf, glowDot } from "./creatures";
import type { Frame, Rgba, Sprite } from "./draw";
import { WHITE, fullUv, hash, pixelRect, pixelSprite, remEuclid, rgb, rgba, roundHalfAway, solids } from "./draw";
import { glowColorOf, pixelsOf, solidAt } from "./pixels";
import type { View } from "./scene";
import { type Actor, type Aquarium, FLOOR_Y, WIDTH, faceTravel, silver } from "./simapi";

const TAU = Math.PI * 2;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// ---------------------------------------------------------------------------
// 구름 그림자

/// 수면 위를 지나는 구름(속도 px/s, 폭, 위치 오프셋, 나타났다 사라지는 주기 초)이다.
const CLOUDS: [number, number, number, number][] = [
  [4.2, 190, 0, 150],
  [3.1, 150, 260, 210],
];

/// 지금 지나는 구름의 (가운데 x, 폭, 세기 0..1)다. 밤·폭풍에는 없다.
function clouds(game: Aquarium): [number, number, number][] {
  const day = game.daylight() * (1 - game.weather.strength);
  if (day < 0.05) return [];
  return CLOUDS.map(([speed, width, offset, period]) => {
    const span = WIDTH + width + 240;
    const x = remEuclid(game.time * speed + offset, span) - width * 0.5 - 120;
    // 수십 초에 걸쳐 천천히 생겼다가 흩어진다.
    const presence = clamp(Math.sin((game.time * TAU) / period + offset) * 1.6 + 0.3, 0, 1);
    return [x, width, presence * day];
  });
}

/// x 자리가 구름 그림자에 얼마나 들었는지(0..1, 3단 띠)다. 빛줄기·해 알갱이가 이만큼 약해진다.
export function cloudCover(game: Aquarium, x: number): number {
  let cover = 0;
  for (const [cx, width, strength] of clouds(game)) {
    const inside = 1 - Math.abs(x - cx) / (width * 0.5);
    const band = inside > 0.6 ? 1 : inside > 0.25 ? 0.6 : inside > 0 ? 0.3 : 0;
    cover = Math.max(cover, band * strength);
  }
  return cover;
}

/// 모래 위를 천천히 가로지르는 부드러운 그림자. 세 겹 타원을 곱해 가운데일수록 어둡다.
export function appendClouds(frame: Frame, game: Aquarium): void {
  const shadows: Sprite[] = [];
  for (const [cx, width, strength] of clouds(game)) {
    if (strength < 0.02) continue;
    [
      [1, 30],
      [0.7, 24],
      [0.42, 18],
    ].forEach(([scale, height]) => {
      const g = 255 * (1 - 0.1 * strength);
      shadows.push({ cx: roundHalfAway(cx), cy: FLOOR_Y + 2, w: roundHalfAway(width * scale), h: height, rotation: 0, shape: { kind: "ellipse", segments: 40 }, uv: fullUv(), color: [g, g, Math.min(255, g + 4), 255], order: -88.5 });
    });
  }
  if (shadows.length > 0) frame.layers.push(solids("cloud-shadow", "multiply", shadows));
}

// ---------------------------------------------------------------------------
// 달과 스넬의 창

/// 해(낮)·달(밤)이 보이는 수면 띠의 x다. 수면 거울은 이 둘레(스넬의 창)를 비추지 않는다.
export function windowX(game: Aquarium, view: View): number {
  const far = view.shift(0.2);
  return (game.daylight() > 0.3 ? 85 : 380) + far[0];
}

/// 달의 위상(0 삭, 0.5 보름)이다. 게임 속 하루마다 8분의 1씩 차고 기운다. 첫 밤은 보름달이다.
export function moonPhase(game: Aquarium): number {
  const day = Math.floor((game.time + 120) / 240);
  return (((day + 3) % 8) + 8) % 8 / 8;
}

/// 수면선(월드 행)이다. 이 위 띠가 물속에서 올려다본 수면이다.
const SURFACE_LINE = 16;

/// 수면 아랫면 전반사: 수면 가까이(36px 안) 온 생물을 수면선 위에 세 배로 눌러 거꾸로 비춘다.
/// 해·달이 보이는 스넬의 창 둘레는 거울이 아니라 옅게만 비친다. UI는 비치지 않는다.
export function appendReflections(frame: Frame, view: View, game: Aquarium, assets: SceneAssets): void {
  const window = windowX(game, view);
  const calm = 1 - 0.7 * game.weather.strength;
  const batches = new Map<string, { texture: SceneAssets["surface"]; sprites: Sprite[] }>();
  for (const actor of game.actors) {
    if (actor.depth !== 1) continue;
    const body = bodyOf(game, assets, actor, WHITE, -93);
    const { sprite } = body;
    // 몸 일부라도 수면 아래에 있고 윗면이 36px 안이면 비춘다(수면을 뚫고 솟은 돌고래도 아랫부분이 비친다).
    const top = sprite.cy - sprite.h * 0.5;
    const bottom = sprite.cy + sprite.h * 0.5;
    const depth = Math.max(0, top - SURFACE_LINE);
    if (bottom <= SURFACE_LINE + 2 || depth > 36 || sprite.rotation !== 0) continue;
    const open = Math.abs(sprite.cx - window) < 34 ? 0.3 : 1;
    const alpha = 0.4 * (1 - depth / 36) * open * calm * actor.alpha() * body.look.alpha;
    if (alpha < 0.02) continue;
    const art = assets.species[actor.species];
    const texture = body.alt && art.alt ? art.alt.texture : art.texture;
    const [u0, v0, u1, v1] = sprite.uv;
    const height = Math.max(1, roundHalfAway(sprite.h / 3));
    const reflected: Sprite = {
      ...sprite,
      cy: roundHalfAway(SURFACE_LINE - (sprite.cy - SURFACE_LINE) / 3) + (height % 2 === 0 ? 0 : 0.5),
      h: height,
      uv: [u0, v1, u1, v0],
      color: rgba(150, 200, 225, alpha),
    };
    const key = `${actor.species}:${body.alt}`;
    const entry = batches.get(key) ?? { texture, sprites: [] };
    entry.sprites.push(reflected);
    batches.set(key, entry);
  }
  for (const [key, { texture, sprites }] of batches) {
    frame.layers.push({ id: `reflect-${key}`, material: { kind: "texture", texture }, blend: "alpha", sprites });
  }
}

/// 스넬의 창 빛과 밤의 달. 달은 색보정 뒤에 그려 어두운 밤에도 또렷하다.
export function appendSky(frame: Frame, view: View, game: Aquarium): void {
  const far = view.shift(0.2);
  const day = game.daylight() * (1 - game.weather.strength);
  const night = game.nightStrength() * (1 - game.weather.strength);
  const x = windowX(game, view);
  const glow: Sprite[] = [];
  const tone: [number, number, number] = game.daylight() > 0.3 ? [255, 246, 220] : [170, 190, 240];
  const strength = game.daylight() > 0.3 ? day : night;
  if (strength > 0.02) {
    [
      [96, 26],
      [66, 20],
      [40, 14],
    ].forEach(([w, h]) => {
      glow.push({ cx: roundHalfAway(x), cy: 8 + far[1], w, h, rotation: 0, shape: { kind: "ellipse", segments: 32 }, uv: fullUv(), color: rgb(tone, 0.045 * strength), order: -97 });
    });
  }
  frame.layers.push(solids("snell-window", "additive", glow));
  if (night < 0.2) return;
  const moon: Sprite[] = [];
  const phase = moonPhase(game);
  const t = Math.cos(phase * TAU);
  const radius = 4.5;
  const cx = roundHalfAway(x);
  const cy = 9 + far[1];
  for (let dy = -4; dy <= 4; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      const u = dx / radius;
      const v = dy / radius;
      if (u * u + v * v > 1) continue;
      const w = Math.sqrt(1 - v * v);
      const lit = phase < 0.5 ? u > t * w : u < -t * w;
      const color: Rgba = lit ? rgba(236, 240, 255, 0.8 * night) : rgba(70, 82, 124, 0.25 * night);
      moon.push(pixelRect(cx + dx, cy + dy, 1, 1, fullUv(), color, 31));
    }
  }
  frame.layers.push(solids("moon", "additive", moon));
  const lit = 1 - Math.abs(phase - 0.5) * 2;
  if (lit > 0.1) frame.bloomLayers.push({ sprites: [glowDot(cx, cy, 7, rgba(220, 230, 255, 0.35 * night * lit))], intensity: 1.2 });
}

// ---------------------------------------------------------------------------
// 은빛 무리 반짝임

/// 은빛 물고기가 몸을 틀어 옆구리가 해를 받는 순간 반짝인다. 무리가 방향을 바꾸면 반짝임이 물결처럼 번진다.
export function appendSilverGlints(frame: Frame, game: Aquarium): void {
  const day = game.daylight() * (1 - game.weather.strength);
  if (day < 0.1) return;
  const candidates: [number, number, number][] = [];
  for (const actor of game.actors) {
    const species = game.species[actor.species];
    if (actor.depth !== 1 || !silver(species)) continue;
    let spec = 0;
    if (actor.school !== null) {
      // 옆구리가 해를 비추는 기울기(약 20°)에 가까울수록 세다. 대부분은 거의 수평이라 몇 마리만 번쩍인다.
      const tilt = Math.abs(Math.atan2(actor.vy, Math.abs(actor.vx)));
      spec = Math.pow(Math.max(0, Math.cos(tilt - 0.35)), 80);
    }
    if (actor.turn > 0) {
      // 돌아서는 도중 옆구리가 정면을 지날 때도 번쩍인다.
      const progress = 1 - actor.turn / 0.3;
      spec = Math.max(spec, Math.max(0, 1 - Math.abs(progress - 0.4) / 0.2));
    }
    const [x, y] = actor.pose(game.time, species);
    const shallow = clamp(1.4 - y / 220, 0.5, 1);
    const strength = spec * Math.min(1, day * 1.3) * shallow * actor.alpha();
    if (strength > 0.35) candidates.push([strength, x + actor.facing * species.frameW * 0.08, y - species.frameH * 0.1]);
  }
  candidates.sort((a, b) => b[0] - a[0]);
  const sparks: Sprite[] = [];
  const bloom: Sprite[] = [];
  for (const [strength, x, y] of candidates.slice(0, 12)) {
    const a = Math.min(1, strength);
    sparks.push(pixelSprite(x, y, 1, 1, fullUv(), rgba(255, 252, 228, a), 34));
    if (a > 0.6) {
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        sparks.push(pixelSprite(x + dx, y + dy, 1, 1, fullUv(), rgba(255, 248, 210, a * 0.6), 34));
      }
    }
    if (a > 0.85) {
      for (const [dx, dy] of [
        [2, 0],
        [-2, 0],
        [0, 2],
        [0, -2],
      ]) {
        sparks.push(pixelSprite(x + dx, y + dy, 1, 1, fullUv(), rgba(255, 244, 200, a * 0.3), 34));
      }
    }
    bloom.push(glowDot(x, y, 3, rgba(255, 250, 220, a * 0.7)));
  }
  frame.layers.push(solids("silver-glints", "additive", sparks));
  if (bloom.length > 0) frame.bloomLayers.push({ sprites: bloom, intensity: 1.4 });
}

// ---------------------------------------------------------------------------
// 발광 생물의 바닥 빛 웅덩이

/// 한 겹씩 작아지는 세 타원(가산)으로 바닥에 비친 빛을 그린다.
function puddle(out: Sprite[], x: number, width: number, color: [number, number, number], strength: number): void {
  const height = Math.max(3, roundHalfAway(width / 4));
  [1, 0.66, 0.36].forEach((scale) => {
    out.push({
      cx: roundHalfAway(x),
      cy: FLOOR_Y + 3,
      w: Math.max(2, roundHalfAway(width * scale)),
      h: Math.max(2, roundHalfAway(height * scale)),
      rotation: 0,
      shape: { kind: "ellipse", segments: 24 },
      uv: fullUv(),
      color: rgb(color, 0.1 * strength),
      order: 31,
    });
  });
}

/// 밤에 발광 생물·손전등이 바닥 가까이 오면 모래에 납작한 타원 빛이 비친다. 가까울수록 작고 진하다.
export function appendFloorGlow(frame: Frame, game: Aquarium, assets: SceneAssets): void {
  const night = game.nightStrength();
  if (night < 0.05) return;
  const pools: [number, Sprite[]][] = [];
  for (const actor of game.actors) {
    const art = assets.species[actor.species];
    if (actor.depth !== 1 || art.glow === null) continue;
    const species = game.species[actor.species];
    const [x, y] = actor.pose(game.time, species);
    const above = FLOOR_Y - (y + species.frameH * 0.5);
    if (above > 50 || above < -12) continue;
    const d = Math.max(above, 0);
    const [gx] = species.glowCenter ?? [0, 0];
    const facing = faceTravel(species) ? actor.facing : 1;
    const strength = (1 - d / 50) * night * actor.alpha() * (game.traits[actor.species].glow === 2 ? 1 : 0.7);
    const sprites: Sprite[] = [];
    puddle(sprites, x + gx * facing, Math.max(8, species.frameW * 0.6 * (1 + d / 20)), glowColorOf(art.glow, species.frameW, [140, 235, 255]), strength);
    pools.push([strength, sprites]);
  }
  if (game.flashlight && night > 0.2 && game.pointer) {
    const [px, py] = game.pointer;
    const d = FLOOR_Y - py;
    if (d < 80 && d > -10) {
      const sprites: Sprite[] = [];
      puddle(sprites, px, 50 * (1 + Math.max(d, 0) / 40), [255, 245, 210], (1 - Math.max(d, 0) / 80) * night);
      pools.push([1, sprites]);
    }
  }
  pools.sort((a, b) => b[0] - a[0]);
  const sprites = pools.slice(0, 8).flatMap(([, list]) => list);
  if (sprites.length > 0) frame.layers.push(solids("floor-glow", "additive", sprites));
}

// ---------------------------------------------------------------------------
// 바다눈

/// 아래쪽 물에 아주 천천히 가라앉는 부스러기. 평소엔 거의 안 보이고 손전등 안에 든 것만 하얗게 떠오른다.
export function appendMarineSnow(frame: Frame, game: Aquarium): void {
  const faint: Sprite[] = [];
  const lit: Sprite[] = [];
  const night = game.nightStrength();
  const torch = game.flashlight && night > 0.2 ? game.pointer : null;
  for (let index = 0; index < 36; index++) {
    const seed = index * 3.7 + 900;
    const speed = 1.5 + hash(seed) * 2.5;
    const y = 110 + remEuclid(hash(seed + 1) * 140 + game.time * speed, 140);
    const x = hash(seed + 2) * WIDTH + Math.sin(game.time * 0.3 + seed) * 3;
    faint.push(pixelSprite(x, y, 1, 1, fullUv(), rgba(200, 212, 222, 0.12 + 0.08 * hash(seed + 3)), 29));
    if (torch) {
      const distance = Math.hypot(x - torch[0], y - torch[1]);
      const glow = distance < 30 ? 0.55 : distance < 46 ? 0.3 : 0;
      if (glow > 0) lit.push(pixelSprite(x, y, 1, 1, fullUv(), rgba(236, 240, 245, glow * night), 34));
    }
  }
  frame.layers.push(solids("marine-snow", "alpha", faint));
  if (lit.length > 0) frame.layers.push(solids("marine-snow-lit", "additive", lit));
}

// ---------------------------------------------------------------------------
// 모래 발자국과 터진 기포

/// 모래 위 자국은 모래보다 한 단계 어두운 1픽셀로, 3단으로 옅어진다. 코스틱 빛 아래에 깐다.
export function appendPrints(frame: Frame, game: Aquarium): void {
  const marks: Sprite[] = [];
  const pops: Sprite[] = [];
  for (const particle of game.particles) {
    if (particle.kind === "Print") {
      const left = particle.remaining();
      const a = left > 0.66 ? 0.45 : left > 0.33 ? 0.3 : 0.15;
      const color = rgba(150, 128, 92, a);
      if (particle.seed === 0) {
        marks.push(pixelSprite(particle.x, particle.y, 1, 1, fullUv(), color, -89.5));
      } else if (particle.seed === 1) {
        const back = -Math.sign(particle.vx || 1);
        marks.push(pixelRect(Math.min(particle.x, particle.x + back * 2), particle.y, 3, 1, fullUv(), color, -89.5));
      } else {
        // 물건이 떨어져 파인 자리: 어두운 타원 자국과 위쪽 밝은 테.
        marks.push({ cx: roundHalfAway(particle.x), cy: roundHalfAway(particle.y) + 0.5, w: 12, h: 3, rotation: 0, shape: { kind: "ellipse", segments: 16 }, uv: fullUv(), color, order: -89.5 });
        marks.push(pixelRect(particle.x - 5, particle.y - 2, 10, 1, fullUv(), rgba(236, 220, 176, a * 0.8), -89.5));
      }
    } else if (particle.kind === "Pop") {
      // 기포가 톡 터지며 작은 고리가 번진다.
      const t = particle.age / particle.life;
      const radius = 1 + t * 4;
      const fade = 1 - t;
      for (let point = 0; point < 8; point++) {
        const angle = (point / 8) * TAU;
        pops.push(pixelSprite(particle.x + Math.cos(angle) * radius, particle.y + Math.sin(angle) * radius * 0.8, 1, 1, fullUv(), rgba(220, 250, 255, fade * 0.8), 34));
      }
    }
  }
  frame.layers.push(solids("sand-prints", "alpha", marks));
  frame.layers.push(solids("bubble-taps", "additive", pops));
}

// ---------------------------------------------------------------------------
// 희귀 색 변이의 반짝임과 단골 개체 무늬

const VARIANT_SPARK: Record<number, [number, number, number]> = {
  1: [255, 236, 150],
  2: [255, 238, 244],
  3: [170, 190, 255],
};

/// 단골 개체 무늬(몸 칸 안 좌표)를 한 번만 찾아 둔다.
const markCache = new Map<string, [number, number][]>();

/// 방문자 개체마다 다른 무늬: 0 별무늬(흩어진 흰 점 다섯), 1 흉터(사선 넷), 2 반달(작은 호).
function marksOf(game: Aquarium, assets: SceneAssets, actor: Actor): [number, number][] {
  const key = `${actor.species}:${actor.individual}`;
  const known = markCache.get(key);
  if (known) return known;
  const species = game.species[actor.species];
  const pixels = pixelsOf(assets.species[actor.species].texture);
  if (!pixels) return [];
  const cellW = species.frameW;
  const cellH = species.frameH;
  // 몸 안쪽(둘레 2픽셀까지 몸인 곳)만 무늬 자리로 쓴다.
  const inner = (x: number, y: number) => x >= 2 && y >= 2 && x < cellW - 2 && y < cellH - 2 && solidAt(pixels, x, y) && solidAt(pixels, x - 2, y) && solidAt(pixels, x + 2, y) && solidAt(pixels, x, y - 2) && solidAt(pixels, x, y + 2);
  const pattern: [number, number][][] = [
    [
      [0, 0],
      [3, -1],
      [-3, 1],
      [1, 3],
      [-2, -3],
    ],
    [
      [0, 0],
      [1, 1],
      [2, 2],
      [3, 3],
    ],
    [
      [-2, 0],
      [-1, -1],
      [0, -1],
      [1, -1],
      [2, 0],
    ],
  ];
  const marks: [number, number][] = [];
  for (let attempt = 0; attempt < 200; attempt++) {
    const ax = Math.floor(hash(actor.species * 31 + actor.individual * 7 + attempt * 1.3) * cellW);
    const ay = Math.floor(hash(actor.species * 17 + actor.individual * 5 + attempt * 2.1 + 40) * cellH * 0.7);
    if (!inner(ax, ay)) continue;
    for (const [dx, dy] of pattern[actor.individual] ?? []) {
      if (inner(ax + dx, ay + dy)) marks.push([ax + dx - cellW / 2 + 0.5, ay + dy - cellH / 2 + 0.5]);
    }
    break;
  }
  markCache.set(key, marks);
  return marks;
}

/// 희귀 색 변이 개체는 가끔 몸 위에 네 갈래 별이 반짝이고, 방문자 단골 개체는 몸에 자기 무늬가 있다.
export function appendMarks(frame: Frame, game: Aquarium, assets: SceneAssets): void {
  const stars: Sprite[] = [];
  const marks: Sprite[] = [];
  for (const actor of game.actors) {
    if (actor.depth !== 1) continue;
    const species = game.species[actor.species];
    if (actor.variant > 0) {
      const beat = game.time * 0.45 + hash(actor.id * 3.1);
      const t = beat - Math.floor(beat);
      if (t < 0.14) {
        const cycle = Math.floor(beat);
        const [x, y] = actor.pose(game.time, species);
        const sx = x + (hash(actor.id + cycle * 1.7) - 0.5) * species.frameW * 0.6;
        const sy = y + (hash(actor.id * 2 + cycle * 2.3) - 0.5) * species.frameH * 0.5;
        const size = t < 0.05 || t > 0.1 ? 1 : 2;
        const [r, g, b] = VARIANT_SPARK[actor.variant];
        const a = actor.alpha();
        stars.push(pixelSprite(sx, sy, 1, 1, fullUv(), rgba(r, g, b, a), 34));
        for (let arm = 1; arm <= size; arm++) {
          for (const [dx, dy] of [
            [arm, 0],
            [-arm, 0],
            [0, arm],
            [0, -arm],
          ]) {
            stars.push(pixelSprite(sx + dx, sy + dy, 1, 1, fullUv(), rgba(r, g, b, a * (arm === 1 ? 0.7 : 0.35)), 34));
          }
        }
      }
    }
    if (actor.individual >= 0) {
      const body = bodyOf(game, assets, actor, WHITE, -8);
      if (body.alt || body.sprite.rotation !== 0) continue;
      const flip = body.sprite.uv[0] > body.sprite.uv[2] ? -1 : 1;
      const scaleX = body.sprite.w / species.frameW;
      const scaleY = body.sprite.h / species.frameH;
      for (const [ox, oy] of marksOf(game, assets, actor)) {
        marks.push(pixelSprite(body.sprite.cx + ox * scaleX * flip, body.sprite.cy + oy * scaleY, 1, 1, fullUv(), rgba(236, 240, 230, 0.7 * actor.alpha()), -8));
      }
    }
  }
  frame.layers.push(solids("variant-stars", "additive", stars));
  frame.layers.push(solids("individual-marks", "alpha", marks));
}
