// 패럴랙스 층, 수면과 햇빛, 빛줄기, 산호·해초, 기포.

import { cloudCover } from "./ambient";
import type { SceneAssets } from "./assets";
import type { Frame, Sprite } from "./draw";
import { WHITE, cellUv, fullUv, hash, mix, pixelRect, pixelSprite, rgb, rgba, roundHalfAway, solids, textured } from "./draw";
import type { View } from "./scene";
import { type Aquarium, FLOOR_Y, HEIGHT, SURFACE_Y, WIDTH, faceTravel, grounded, ventBubbles } from "./simapi";

const FAR = 0.2;
const DEEP = 0.12;
const KELP_WALL = 0.42;
const MID = 0.55;

export function appendBack(frame: Frame, view: View, game: Aquarium, assets: SceneAssets): void {
  const far = view.shift(FAR);
  const scene = assets.scene;
  frame.layers.push(textured("far", scene.far, "alpha", [pixelRect(-10 + far[0], -6 + far[1], 500, 282, fullUv(), WHITE, -100)]));
  const light = 0.25 + 0.75 * game.daylight();
  const sky = mix([230, 255, 255], [255, 178, 110], game.twilight());
  let surfaceFrame = Math.trunc(game.time * 7) % 8;
  const surface: Sprite[] = [];
  for (let tile = 0; tile < 3; tile++) {
    surface.push(
      pixelRect(-10 + far[0] + tile * 240, -6 + far[1], 240, 30, cellUv(surfaceFrame, 8, false), rgb(sky, 0.6 * light + 0.25 * game.twilight()), -99),
    );
  }
  frame.layers.push(textured("surface", assets.surface, "additive", surface));
  appendSun(frame, game, far);
  const deep = view.shift(DEEP);
  frame.layers.push(textured("deep-ridge", scene.deep, "alpha", [pixelRect(-10 + deep[0], 80 + deep[1], 500, 170, fullUv(), scene.style.deep, -98)]));
  const wall = view.shift(KELP_WALL);
  frame.layers.push(
    textured("back-wall", scene.back, "alpha", [pixelRect(-16 + wall[0], FLOOR_Y - 224 + wall[1], 512, 230, fullUv(), scene.style.back, -95)]),
  );
  const mid = view.shift(MID);
  frame.layers.push(textured("mid", scene.mid, "alpha", [pixelRect(-16 + mid[0], -9 + mid[1], 512, 288, fullUv(), scene.style.mid, -94)]));
  frame.layers.push(textured("floor", scene.floor, "alpha", [pixelRect(-16, HEIGHT - 48, 512, 48, fullUv(), WHITE, -90)]));
  surfaceFrame = Math.trunc(game.time * 5) % 8;
  frame.layers.push(
    textured("caustics", scene.caustics, "additive", [pixelRect(0, HEIGHT - 48, WIDTH, 48, cellUv(surfaceFrame, 8, false), rgba(255, 255, 230, 0.5 * light), -89)]),
  );
}

/// 수면 너머 해가 있는 자리에서 반짝이는 빛 알갱이. bloom으로 번진다.
function appendSun(frame: Frame, game: Aquarium, far: [number, number]): void {
  // 구름이 해를 가리면 해 알갱이도 옅어진다.
  const day = game.daylight() * (1 - game.weather.strength) * (1 - 0.6 * cloudCover(game, 85));
  if (day < 0.05) return;
  const glints: Sprite[] = [];
  const bloom: Sprite[] = [];
  for (let index = 0; index < 14; index++) {
    const seed = index * 7.3;
    const twinkle = Math.pow(Math.sin(game.time * (1.5 + hash(seed) * 2) + hash(seed + 1) * Math.PI * 2) * 0.5 + 0.5, 4);
    if (twinkle < 0.1) continue;
    const x = 85 + far[0] + (hash(seed + 2) - 0.5) * 90;
    const y = 2 + far[1] + hash(seed + 3) * 16;
    glints.push(pixelSprite(x, y, 1, 1, fullUv(), rgba(255, 255, 235, day * twinkle), -98));
    if (twinkle > 0.5) {
      bloom.push({ cx: x, cy: y, w: 3, h: 3, rotation: 0, shape: { kind: "ellipse", segments: 8 }, uv: fullUv(), color: rgba(255, 250, 220, day * twinkle), order: 0 });
    }
  }
  frame.layers.push(solids("sun-glints", "additive", glints));
  frame.bloomLayers.push({ sprites: bloom, intensity: 2 });
}

/// 산호와 해초를 뒷줄(물빛으로 가라앉힘) 또는 앞줄(선명)로, 배치 시드가 정한 자리에 세운다.
function appendProps(frame: Frame, game: Aquarium, assets: SceneAssets, front: boolean): void {
  const batches: Sprite[][] = assets.props.map(() => []);
  const style = assets.scene.style;
  for (const { prop: index, x, row, flip, phase } of assets.scene.layout) {
    if (row !== (front ? "front" : "back")) continue;
    const prop = assets.props[index];
    if (!prop) continue;
    const [bottom, color, order] = front ? [HEIGHT + 3, WHITE, 10] : [FLOOR_Y + 1, style.backProps, -60];
    let propFrame = Math.trunc(Math.floor(game.time * 4.5 + x * 0.071 + phase * 8)) % prop.frames;
    // 강한 해류에는 해초가 흐름 쪽으로 가장 많이 굽은 프레임 근처에 머문다.
    if (prop.frames === 8 && Math.abs(game.current) > 6) {
      const bent = game.current > 0 ? 7 : 3;
      const flutter = Math.trunc(Math.floor(game.time * 5 + x * 0.1)) % 2;
      propFrame = (bent + 8 - flutter) % 8;
    } else if (prop.frames === 8) {
      // 생물이 헤치고 지나가면 그쪽으로 밀렸다가 출렁이며 돌아온다.
      const push = pushOf(game, x, bottom - prop.h, bottom, prop.w);
      if (Math.abs(push) > 0.15) propFrame = bendFrame(bendOf(propFrame) * (1 - Math.abs(push)) + push, propFrame);
    }
    batches[index].push(pixelRect(x - prop.w * 0.5, bottom - prop.h, prop.w, prop.h, cellUv(propFrame, prop.frames, flip), color, order));
  }
  batches.forEach((sprites, index) => {
    if (sprites.length > 0) frame.layers.push(textured(`props-${front ? "front" : "back"}-${index}`, assets.props[index].texture, "alpha", sprites));
  });
}

/// 조개 하나가 지금 얼마나 열렸는지(0 닫힘, 1 반쯤, 2 활짝)와 여닫는 박자(0..1)다.
function clamOpening(game: Aquarium, x: number, phase: number): [number, number, boolean] {
  // 주기(12~20초)와 시작 박자를 서로 다른 값에서 뽑아 조개끼리 박자가 맞지 않게 한다.
  const period = 12 + phase * 8;
  const offset = phase * 7.919 - Math.floor(phase * 7.919);
  const cycle = game.time / period + offset;
  const t = cycle - Math.floor(cycle);
  let open = t < 0.3 ? 0 : t < 0.36 ? 1 : t < 0.9 ? 2 : t < 0.96 ? 1 : 0;
  const nearby = game.actors.some((actor) => {
    const species = game.species[actor.species];
    return actor.depth === 1 && Math.abs(actor.x - x) < 22 + species.frameW * 0.5 && actor.y + species.frameH * 0.5 > FLOOR_Y - 34;
  });
  const tapped = game.taps.some(([tx, ty, age]) => age < 1.2 && Math.hypot(tx - x, ty - FLOOR_Y) < 90);
  if (tapped) open = 0;
  else if (nearby) open = Math.min(open, 1);
  // 진주가 빛나는 밤에는 모두 활짝 연다.
  if (game.setpiece.pearls > 0.3 && !tapped) open = 2;
  return [open, t, tapped];
}

/// 바닥 조개들의 지금 열림 단계다(캡처 보고용).
export function clamStates(game: Aquarium, assets: SceneAssets): { x: number; open: number }[] {
  return assets.scene.layout.filter((placement) => placement.row === "floor").map(({ x, phase }) => ({ x, open: clamOpening(game, x, phase)[0] }));
}

/// 바닥의 조개: 12~20초 주기로 천천히 입을 벌렸다 닫는다(앞을 보고 열린다). 생물이 가까이 지나가면 반쯤 닫고,
/// 유리를 두드리면 꼭 닫는다. 닫힐 때 작은 기포가 오르고, 열린 진주조개의 진주는 가끔 반짝인다.
export function appendClams(frame: Frame, game: Aquarium, assets: SceneAssets): void {
  const style = assets.scene.style;
  const batches = new Map<number, Sprite[]>();
  const extras: Sprite[] = [];
  const bubbles: Sprite[] = [];
  for (const { prop: index, x, row, flip, phase } of assets.scene.layout) {
    if (row !== "floor") continue;
    const prop = assets.props[index];
    if (!prop || prop.kind !== "clam") continue;
    const [open, t, tapped] = clamOpening(game, x, phase);
    const bottom = FLOOR_Y + 5;
    const sprite = pixelRect(x - prop.w * 0.5, bottom - prop.h, prop.w, prop.h, cellUv(open, prop.frames, flip), style.floorProps, -58);
    const list = batches.get(index);
    if (list) list.push(sprite);
    else batches.set(index, [sprite]);
    // 막 닫히는 순간 작은 기포가 오른다.
    if (t >= 0.96 && !tapped) {
      const rise = (t - 0.96) / 0.04;
      for (let bead = 0; bead < 2; bead++) {
        bubbles.push(pixelSprite(x + (bead - 0.5) * 5, bottom - prop.h * 0.5 - rise * 14 - bead * 4, 7, 7, cellUv(0, 3, false), rgba(255, 255, 255, 1 - rise), -57));
      }
    }
    if (game.setpiece.pearls > 0.05 && open === 2) {
      // 조개 속이 은은하게 빛난다(진주조개는 더 밝다).
      const strength = game.setpiece.pearls * (prop.name === "clam-pearl" ? 1 : 0.6) * (0.85 + 0.15 * Math.sin(game.time * 2 + phase * 9));
      const cy = bottom - prop.h * 0.42;
      [
        [16, 0.1],
        [10, 0.12],
        [5, 0.16],
      ].forEach(([size, alpha]) => {
        extras.push({ cx: roundHalfAway(x) + 0.5, cy: roundHalfAway(cy) + 0.5, w: size, h: size * 0.7, rotation: 0, shape: { kind: "ellipse", segments: 16 }, uv: fullUv(), color: rgba(255, 236, 240, alpha * strength), order: 34 });
      });
    }
    if (prop.name === "clam-pearl" && open === 2) {
      const beat = game.time * 0.7 + phase * 5;
      const glint = beat - Math.floor(beat);
      if (glint < 0.12) {
        const px = x;
        const py = bottom - prop.h * 0.42;
        extras.push(pixelSprite(px, py, 1, 1, fullUv(), rgba(255, 255, 250, 1), 34));
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          extras.push(pixelSprite(px + dx, py + dy, 1, 1, fullUv(), rgba(255, 250, 235, 0.6), 34));
        }
      }
    }
  }
  for (const [index, sprites] of batches) {
    frame.layers.push(textured(`clams-${index}`, assets.props[index].texture, "alpha", sprites));
  }
  frame.layers.push(textured("clam-bubbles", assets.bubbles, "alpha", bubbles));
  frame.layers.push(solids("pearl-glint", "additive", extras));
}

/// 8프레임 흔들림에서 프레임의 굽힘(오른쪽 +1, 왼쪽 -1)이다. 7번이 오른쪽, 3번이 왼쪽으로 가장 많이 굽는다.
function bendOf(frame: number): number {
  return Math.cos(((frame - 7) / 8) * Math.PI * 2);
}

/// 원하는 굽힘에 가장 가까운 프레임이다. 같으면 지금 프레임에 가까운 쪽을 고른다.
function bendFrame(bend: number, current: number): number {
  let best = current;
  let score = Infinity;
  for (let frame = 0; frame < 8; frame++) {
    const distance = Math.min(Math.abs(frame - current), 8 - Math.abs(frame - current));
    const value = Math.abs(bendOf(frame) - bend) * 10 + distance * 0.01;
    if (value < score) {
      score = value;
      best = frame;
    }
  }
  return best;
}

/// 소품(가운데 x, 위·아래, 폭)을 지나는 생물이 미는 힘(-1..1)이다. 지나간 뒤에는 감쇄 진동으로 되돌아온다.
function pushOf(game: Aquarium, px: number, top: number, bottom: number, width: number): number {
  let push = 0;
  for (const actor of game.actors) {
    if (actor.depth !== 1 || actor.burrow > 0) continue;
    const species = game.species[actor.species];
    const [x, y] = actor.pose(game.time, species);
    if (y + species.frameH * 0.5 < top || y - species.frameH * 0.5 > bottom) continue;
    const direction = faceTravel(species) || grounded(species) ? actor.facing : x >= px ? 1 : -1;
    const reach = (width + species.frameW) * 0.5;
    const passed = (x - px) * direction;
    let bend = 0;
    if (Math.abs(x - px) < reach) {
      bend = Math.min(1, 1.2 * (1 - Math.abs(x - px) / reach) + 0.3);
    } else if (passed > reach && passed < reach + 44) {
      const after = passed - reach;
      bend = Math.exp(-after / 14) * Math.cos(after / 7);
    }
    const size = Math.min(1, species.frameW / 30 + 0.3);
    const value = bend * direction * size;
    if (Math.abs(value) > Math.abs(push)) push = value;
  }
  return push;
}

/// 뒷줄 소품과 그 앞에 까는 물빛 안개.
export function appendBackProps(frame: Frame, view: View, game: Aquarium, assets: SceneAssets): void {
  appendProps(frame, game, assets, false);
  const screen = view.shift(0);
  frame.layers.push(textured("depth-haze", assets.haze, "alpha", [pixelRect(screen[0], screen[1], WIDTH, HEIGHT, fullUv(), rgba(255, 255, 255, 0.3), -55)]));
}

/// 수면에서 비스듬히 내려오는 빛줄기.
export function appendRays(frame: Frame, game: Aquarium, assets: SceneAssets): void {
  const day = game.daylight() * (1 - game.weather.strength * 0.8);
  const moon = game.nightStrength();
  const flash = game.weather.flash;
  const rays: Sprite[] = [];
  for (let index = 0; index < 6; index++) {
    const seed = index;
    const sway = Math.sin(game.time * 0.11 + seed * 1.7) * 10;
    const x = 12 + seed * 78 + sway;
    const breathe = 0.5 + 0.5 * Math.sin(game.time * 0.37 + seed * 2.3);
    // 구름 그림자가 지나가는 자리의 빛줄기는 옅어진다.
    const shade = 1 - 0.45 * cloudCover(game, x + 28);
    const strength = day * shade * (0.16 + 0.22 * breathe) + moon * 0.07 * breathe + game.twilight() * 0.08 + flash * 0.35 + game.golden * (0.25 + 0.15 * breathe);
    let warm = mix([255, 250, 215], [255, 168, 96], game.twilight());
    warm = mix(warm, [255, 205, 90], game.golden);
    const tint = mix(warm, [150, 190, 255], moon);
    rays.push(pixelRect(x, -6, 56, 250, cellUv(index % 3, 3, false), rgb(tint, strength), -50));
  }
  frame.layers.push(textured("light-rays", assets.rays, "additive", rays));
}

/// 기포 줄기, 앞줄 산호·해초.
export function appendFront(frame: Frame, game: Aquarium, assets: SceneAssets): void {
  const bubbles: Sprite[] = [];
  const pops: Sprite[] = [];
  // 기포 줄기. 포인터가 스쳐 터뜨린 알은 이번 오름이 끝날 때까지 그리지 않는다.
  for (const bubble of ventBubbles(game.time)) {
    if (game.popped.has(bubble.key)) continue;
    if (bubble.popping !== null) {
      // 수면에 닿은 기포는 네 점으로 터지며 퍼진다.
      const spread = bubble.popping * 0.6 + 1;
      for (const [dx, dy] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ]) {
        pops.push(pixelSprite(bubble.x + dx * spread, SURFACE_Y + dy * spread * 0.5, 1, 1, fullUv(), rgba(220, 250, 255, 1 - bubble.popping / 8), 1));
      }
      continue;
    }
    bubbles.push(pixelSprite(bubble.x, bubble.y, 7, 7, cellUv(bubble.size, 3, false), WHITE, 0));
  }
  game.actors.forEach((actor, index) => {
    const species = game.species[actor.species];
    if (actor.school !== null || !faceTravel(species) || actor.depth === 0) return;
    const c = game.time * 0.23 + hash(index + actor.phase);
    const cycle = (c - Math.trunc(c)) * 6;
    if (cycle > 2.2) return;
    const [x, y] = actor.pose(game.time, species);
    const mouthX = x + actor.facing * species.frameW * 0.45;
    for (let bead = 0; bead < 2; bead++) {
      const t = cycle - bead * 0.35;
      if (t < 0) continue;
      const bx = mouthX + actor.facing * t * 2 + Math.sin(t * 6);
      bubbles.push(pixelSprite(bx, y - 4 - t * 14, 7, 7, cellUv(0, 3, false), rgba(255, 255, 255, 1 - t / 2.2), 1));
    }
  });
  frame.layers.push(textured("bubbles", assets.bubbles, "alpha", bubbles));
  frame.layers.push(solids("bubble-pops", "alpha", pops));
  appendProps(frame, game, assets, true);
}
