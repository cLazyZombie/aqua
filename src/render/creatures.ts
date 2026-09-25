// 먼 층 실루엣, 노멀맵 조명을 받는 가까운 층, 모래 그림자, 해파리 촉수, 발광과 입자.

import type { SceneAssets } from "./assets";
import type { Frame, Rgba, Sprite, Uv } from "./draw";
import { cellUv, fract, fullUv, pixelRect, pixelSprite, rgba, roundHalfAway, solids, textured } from "./draw";
import { glowAreaOf, glowColorOf } from "./pixels";
import { type Actor, type Aquarium, FLOOR_Y, faceTravel, grounded, type Look, moodLook } from "./simapi";

/// 한 생물을 그릴 자리와 모습이다. 몸·덧칠·발광·호버 테두리·마우스 판정이 모두 이것을 쓴다.
export interface Body {
  sprite: Sprite;
  /// 대체 그림(부푼 모습·교감 자세)을 쓰는지다.
  alt: boolean;
  look: Look;
  /// 보이는 방향(오른쪽 1, 왼쪽 -1)이다.
  facing: number;
}

/// 한 생물의 화면 sprite. 방향 전환 중에는 가로 폭을 줄여 몸을 뒤집고, 교감 모습(크기·회전·뒤집기)과
/// 모래에 파묻힌 만큼의 잘라 내기를 반영한다.
export function bodyOf(game: Aquarium, assets: SceneAssets, actor: Actor, color: Rgba, order: number): Body {
  const species = game.species[actor.species];
  const art = assets.species[actor.species];
  const look = moodLook(actor, species, game.time);
  const alt = (actor.puffed > 0 || look.alt) && art.alt !== null;
  const baseSize: [number, number] = alt && art.alt ? [art.alt.w, art.alt.h] : [species.frameW, species.frameH];
  // 사건이 개체 크기를 달리 보일 때(소라게 집 바꾸기) 배율을 곱한다.
  const size: [number, number] = [baseSize[0] * actor.scale, baseSize[1] * actor.scale];
  let [x, y] = actor.pose(game.time, species);
  // 교감 자세 그림(집게 들기)은 몸 높이가 달라도 발이 같은 모래선에 닿게 아래를 맞춘다.
  if (alt && art.alt && grounded(species)) y -= (size[1] - species.frameH) * 0.5;
  const [facing, squash] = actor.turning();
  const travels = faceTravel(species);
  const flip = travels && facing < 0;
  const scaledW = Math.max(1, roundHalfAway(size[0] * look.sx));
  let height = Math.max(1, roundHalfAway(size[1] * look.sy));
  const width = travels ? Math.max(2, roundHalfAway(scaledW * squash)) : scaledW;
  let uv: Uv = cellUv(actor.frame(species), species.frames, flip);
  if (look.flipY) uv = [uv[0], uv[3], uv[2], uv[1]];
  let cy = y + look.dy;
  // 모래 속으로 들어가거나 올라오는 중이면 모래선 아래를 잘라 낸다(아래쪽은 그대로, 위쪽만 보인다).
  const sunk = roundHalfAway(actor.sunk(species));
  if (sunk > 0 && !look.flipY) {
    const visible = Math.max(1, height - sunk);
    cy += (height - visible) * 0.5;
    uv = [uv[0], visible / height, uv[2], 0];
    height = visible;
  }
  const tinted: Rgba = [color[0], color[1], color[2], Math.trunc(color[3] * look.alpha)];
  const sprite = pixelSprite(x + look.dx, cy, width, height, uv, tinted, order);
  // 공중제비와 교감 회전은 오른쪽 기준 각도이므로 왼쪽을 볼 때 부호를 바꾼다.
  sprite.rotation = (actor.rollAngle() + look.rot) * facing;
  return { sprite, alt, look, facing };
}

/// 먼 층 생물. 조명 없이 물빛으로 가라앉힌 색 시트를 쓴다.
export function appendFar(frame: Frame, game: Aquarium, assets: SceneAssets): void {
  const batches = new Map<number, Sprite[]>();
  for (const actor of game.actors) {
    if (actor.depth !== 0) continue;
    const color = rgba(110, 160, 205, 0.72 * actor.alpha());
    push(batches, actor.species, bodyOf(game, assets, actor, color, -80).sprite);
  }
  for (const species of [...batches.keys()].sort((a, b) => a - b)) {
    frame.layers.push(textured(`far-${species}`, assets.species[species].texture, "alpha", batches.get(species)!));
  }
}

function push(map: Map<number, Sprite[]>, key: number, sprite: Sprite): void {
  const list = map.get(key);
  if (list) list.push(sprite);
  else map.set(key, [sprite]);
}

type Source = [number, number, number, number];

/// 발광 생물의 빛 위치와 세기다.
function lightSources(game: Aquarium): Source[] {
  const night = game.nightStrength();
  const sources: Source[] = [];
  game.actors.forEach((actor, index) => {
    if (actor.depth !== 1) return;
    const species = game.species[actor.species];
    if (!species.glowCenter) return;
    const [gx, gy] = species.glowCenter;
    const [x, y] = actor.pose(game.time, species);
    const facing = faceTravel(species) ? actor.facing : 1;
    const power = species.motion === "jelly" ? 0.8 : 1;
    sources.push([index, x + gx * facing, y + gy, (0.25 + 0.75 * night) * power * actor.alpha()]);
  });
  return sources;
}

/// 가장 가까운 발광원 방향과 세기를 정점 색에 담는다. 조명 셰이더가 R/G를 방향, B를 세기로 읽는다.
function lightColor(actor: Actor, index: number, pose: [number, number], sources: Source[]): Rgba {
  let best: [number, number, number] = [0, 0, 0];
  for (const [owner, lx, ly, power] of sources) {
    if (owner === index) continue;
    const dx = lx - pose[0];
    const dy = ly - pose[1];
    const distance = Math.max(0.001, Math.sqrt(dx * dx + dy * dy));
    const strength = Math.max(0, 1 - distance / 85) * power;
    if (strength > best[2]) best = [dx / distance, dy / distance, strength];
  }
  const channel = (v: number) => Math.min(255, Math.max(0, roundHalfAway((v * 0.5 + 0.5) * 255)));
  return [channel(best[0]), channel(best[1]), Math.trunc(Math.min(1, Math.max(0, best[2])) * 255), Math.trunc(Math.max(0, actor.alpha()) * 255)];
}

/// 가까운 층: 모래 그림자, 촉수, 조명 받는 몸, 먼지·먹이 입자.
export function appendNear(frame: Frame, game: Aquarium, assets: SceneAssets): void {
  const day = 0.35 + 0.65 * game.daylight();
  const shadows: Sprite[] = [];
  const strands: Sprite[] = [];
  const sources = lightSources(game);
  const bodies: { species: number; alt: boolean; variant: number; sprites: Sprite[] }[] = [];
  const tints: { species: number; alt: boolean; add: boolean; sprites: Sprite[] }[] = [];
  game.actors.forEach((actor, index) => {
    if (actor.depth !== 1) return;
    const species = game.species[actor.species];
    const [x, y] = actor.pose(game.time, species);
    const above = FLOOR_Y - (y + species.frameH * 0.5);
    if (above < 70 && species.motion !== "crawl") {
      const near = 1 - Math.max(0, above) / 70;
      const width = species.frameW * (0.45 + 0.35 * near);
      shadows.push(pixelSprite(x, FLOOR_Y + 3, width, 2 + 2 * near, fullUv(), rgba(255, 255, 255, 0.22 * near * day * actor.alpha()), -62));
    } else if (species.motion === "crawl") {
      shadows.push(pixelSprite(x, y + species.frameH * 0.5, species.frameW * 0.7, 2, fullUv(), rgba(255, 255, 255, 0.22 * day * actor.alpha()), -62));
    }
    const color = rgba(215, 205, 255, 0.45 * actor.alpha());
    for (const tentacle of actor.tentacles) {
      const points = tentacle.points;
      for (let i = 0; i + 1 < points.length; i++) {
        const [ax, ay] = points[i];
        const [bx, by] = points[i + 1];
        const steps = Math.max(1, Math.trunc(Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay)))));
        for (let step = 0; step < steps; step++) {
          const t = step / steps;
          strands.push(pixelSprite(ax + (bx - ax) * t, ay + (by - ay) * t, 1, 1, fullUv(), color, -12));
        }
      }
    }
    const body = bodyOf(game, assets, actor, lightColor(actor, index, [x, y], sources), -10);
    const { alt, look } = body;
    const entry = bodies.find((e) => e.species === actor.species && e.alt === alt && e.variant === actor.variant);
    if (entry) entry.sprites.push(body.sprite);
    else bodies.push({ species: actor.species, alt, variant: actor.variant, sprites: [body.sprite] });
    if (look.tint !== null && look.tint[3] > 0.01) {
      // 교감 색 변화: 몸 모양대로 색을 더하거나 덮는다.
      const [r, g, b, strength] = look.tint;
      const overlay = { ...body.sprite, color: rgba(Math.round(r), Math.round(g), Math.round(b), strength * actor.alpha() * look.alpha), order: -9 };
      const bucket = tints.find((e) => e.species === actor.species && e.alt === alt && e.add === look.tintAdd);
      if (bucket) bucket.sprites.push(overlay);
      else tints.push({ species: actor.species, alt, add: look.tintAdd, sprites: [overlay] });
    }
  });
  frame.layers.push(textured("sand-shadows", assets.shadow, "alpha", shadows));
  frame.layers.push(solids("tentacles", "alpha", strands));
  for (const { species, alt, variant, sprites } of bodies) {
    const art = assets.species[species];
    const sheet = alt && art.alt ? art.alt : art;
    frame.layers.push({ id: `lit-${species}-${alt}-${variant}`, material: { kind: "lit", texture: sheet.texture, normal: sheet.normal, variant }, blend: "alpha", sprites });
  }
  for (const { species, alt, add, sprites } of tints) {
    const art = assets.species[species];
    const sheet = alt && art.alt ? art.alt : art;
    frame.layers.push({ id: `tint-${species}-${alt}-${add}`, material: { kind: "silhouette", texture: sheet.texture }, blend: add ? "additive" : "alpha", sprites });
  }
  const specks: Sprite[] = [];
  for (const particle of game.particles) {
    const fade = particle.remaining();
    switch (particle.kind) {
      case "Dust":
        specks.push(pixelSprite(particle.x, particle.y, 1 + Math.floor(particle.seed * 2), 1, fullUv(), rgba(222, 205, 160, fade * 0.8), 2));
        break;
      case "Chomp":
        specks.push(pixelSprite(particle.x, particle.y, 1, 1, fullUv(), rgba(255, 240, 190, fade), 2));
        break;
      case "Food":
        specks.push(pixelSprite(particle.x, particle.y, 2, 2, fullUv(), rgba(196, 112, 52, Math.min(1, fade)), 2));
        specks.push(pixelSprite(particle.x - 0.5, particle.y - 0.5, 1, 1, fullUv(), rgba(255, 196, 120, Math.min(1, fade)), 3));
        break;
      case "Cookie": {
        // 동글동글한 물고기 과자: 황금빛 테두리에 밝은 가운데.
        const a = Math.min(1, fade);
        specks.push(pixelRect(particle.x - 1, particle.y - 1, 3, 3, fullUv(), rgba(196, 126, 58, a), 2));
        specks.push(pixelRect(particle.x, particle.y, 1, 1, fullUv(), rgba(255, 214, 130, a), 3));
        break;
      }
      case "Leaf": {
        // 해초 잎: 초록 잎에 밝은 잎맥 한 점. 흔들림에 따라 눕는 방향이 바뀐다.
        const a = Math.min(1, fade);
        const lean = Math.sin(game.time * 1.3 + particle.seed * 6.28) > 0 ? 1 : -1;
        specks.push(pixelRect(particle.x - 1, particle.y, 3, 1, fullUv(), rgba(70, 170, 80, a), 2));
        specks.push(pixelRect(particle.x + lean, particle.y - 1, 1, 1, fullUv(), rgba(70, 170, 80, a), 2));
        specks.push(pixelRect(particle.x, particle.y, 1, 1, fullUv(), rgba(170, 235, 130, a), 3));
        break;
      }
      case "Pellet": {
        // 새우빛 알갱이: 십자 모양에 밝은 가운데.
        const a = Math.min(1, fade);
        specks.push(pixelRect(particle.x - 1, particle.y, 3, 1, fullUv(), rgba(226, 118, 100, a), 2));
        specks.push(pixelRect(particle.x, particle.y - 1, 1, 3, fullUv(), rgba(226, 118, 100, a), 2));
        specks.push(pixelRect(particle.x, particle.y, 1, 1, fullUv(), rgba(255, 200, 170, a), 3));
        break;
      }
      default:
        break;
    }
  }
  frame.layers.push(solids("specks", "alpha", specks));
}

/// 발광 마스크(가산), 밤의 둥근 빛 고리, 발광 궤적, 흐름장 플랑크톤과 그 bloom.
export function appendGlow(frame: Frame, game: Aquarium, assets: SceneAssets): void {
  const night = game.nightStrength();
  const day = game.daylight() * (1 - game.weather.strength);
  const batches = new Map<number, Sprite[]>();
  const masks = new Map<string, { texture: number; boosted: boolean; sprites: Sprite[] }>();
  const halos: Sprite[] = [];
  const haloBloom: Sprite[] = [];
  for (const actor of game.actors) {
    const art = assets.species[actor.species];
    const species = game.species[actor.species];
    const traits = game.traits[actor.species];
    if (art.glow === null && actor.mood === null) continue;
    const flicker = 0.85 + 0.15 * Math.sin(game.time * 3.1 + actor.phase);
    const depth = actor.depth === 0 ? 0.5 : 1;
    const probe = bodyOf(game, assets, actor, rgba(255, 255, 255, 1), 33);
    const look = probe.look;
    const color = art.glow !== null ? glowColorOf(art.glow, species.frameW, [140, 235, 255]) : ([255, 246, 220] as [number, number, number]);
    if (art.glow !== null) {
      // 은은하게: 빛나는 면적이 넓을수록(몸 전체가 빛나는 해파리·관해파리) 덧칠과 번짐을 약하게 준다.
      // 루어·발광점 같은 점광원(30픽셀 이하)은 1, 몸 전체 발광은 0.2까지 내려간다. 덧칠은 0.62를 넘지 않는다.
      const spot = Math.min(1, Math.sqrt(30 / glowAreaOf(art.glow, species.frameW)));
      // 무리는 여러 마리가 겹치므로 한 마리 몫을 줄인다.
      const crowd = actor.school !== null ? 0.5 : 1;
      const boost = 1 + (look.glow - 1) * 0.5;
      const strength = Math.min(0.62, (0.12 + 0.5 * night) * (0.3 + 0.5 * spot) * crowd * boost) * flicker * actor.alpha() * depth;
      push(batches, actor.species, { ...probe.sprite, color: rgba(255, 255, 255, strength * look.alpha) });
      if (night > 0.05 || look.glow > 1.05) {
        const lit = Math.max(night, (look.glow - 1) / 1.2);
        const boosted = look.glow > 1.05;
        const key = `${actor.species}:${boosted}`;
        const entry = masks.get(key) ?? { texture: actor.species, boosted, sprites: [] };
        const bloom = lit * spot * spot * crowd * crowd * flicker * actor.alpha() * depth * look.alpha;
        entry.sprites.push({ ...probe.sprite, color: rgba(color[0], color[1], color[2], bloom), order: 0 });
        masks.set(key, entry);
      }
    }
    // 강한 발광 생물은 밤에, 교감으로 빛나는 생물은 언제나 3~4겹 둥근 빛 고리를 두른다.
    const ring = Math.max(traits.glow === 2 && actor.depth === 1 ? night : 0, look.halo);
    if (ring > 0.02) {
      const facing = faceTravel(species) ? probe.facing : 1;
      const [gx, gy] = species.glowCenter ?? [0, 0];
      const cx = probe.sprite.cx + gx * facing * look.sx;
      const cy = probe.sprite.cy + gy * look.sy;
      const radius = (5 + species.frameW * 0.07) * (1 + 0.25 * look.halo);
      // 교감 번뜩임 중에는 고리가 커질 뿐 아니라 조금 더 밝아진다.
      const strength = ring * (1 + 0.35 * look.halo) * flicker * actor.alpha() * depth * (actor.school !== null ? 0.4 : 1);
      RINGS.forEach(([scale, alpha]) => {
        const size = roundHalfAway(radius * scale) * 2;
        halos.push(disc(cx, cy, size, rgba(color[0], color[1], color[2], alpha * strength)));
      });
      haloBloom.push(disc(cx, cy, roundHalfAway(radius) * 2, rgba(color[0], color[1], color[2], 0.2 * strength)));
    }
  }
  for (const species of [...batches.keys()].sort((a, b) => a - b)) {
    frame.layers.push(textured(`glow-${species}`, assets.species[species].glow!, "additive", batches.get(species)!));
  }
  if (halos.length > 0) frame.layers.push(solids("glow-rings", "additive", halos));
  if (haloBloom.length > 0) frame.bloomLayers.push({ sprites: haloBloom, intensity: 0.6 + 0.6 * night });
  // 밤이 깊을수록 발광 bloom을 조금 더 준다(각 종의 발광색으로). 교감으로 번뜩이는 생물은 조금 더 준다.
  const maskIntensity = 1.1 + 0.9 * night;
  for (const { texture, boosted, sprites } of masks.values()) {
    frame.alphaMaskBloomLayers.push({ texture: assets.species[texture].glow!, sprites, intensity: maskIntensity * (boosted ? 1.15 : 1) });
  }
  const rays = rayCenters(game);
  const bloomTime = Math.min(1, Math.max(0, (night - 0.8) / 0.2));
  const sparks: Sprite[] = [];
  const bloom: Sprite[] = [];
  for (const particle of game.particles) {
    if (particle.kind === "Plankton") {
      const blink = Math.pow(Math.sin(game.time * (0.8 + fract(particle.seed)) + particle.seed * 9) * 0.5 + 0.5, 3);
      const lit = rays.some(([x, width]) => Math.abs(x + particle.y * 0.2 - particle.x) < width);
      const sun = lit ? day * (0.35 + 0.65 * blink) : day * 0.12;
      const glow = night * (0.15 + 0.85 * blink) * (0.4 + 0.6 * bloomTime);
      const size = bloomTime > 0.3 && blink > 0.6 ? 2 : 1;
      sparks.push(pixelSprite(particle.x, particle.y, size, size, fullUv(), rgba(200, 245, 255, sun), 34));
      sparks.push(pixelSprite(particle.x, particle.y, size, size, fullUv(), rgba(90, 255, 220, glow), 34));
      if (glow > 0.55 || sun > 0.75) bloom.push(glowDot(particle.x, particle.y, 3, rgba(110, 255, 230, Math.max(glow, sun * 0.6))));
    } else if (particle.kind === "Glimmer") {
      // 반짝 플랑크톤 먹이: 낮에도 보이게 밝게 깜박이고, 밤에는 bloom으로 번진다.
      const blink = 0.55 + 0.45 * Math.sin(game.time * 7 + particle.seed * 40);
      const fade = Math.min(1, particle.remaining() * 3) * blink;
      sparks.push(pixelSprite(particle.x, particle.y, 1, 1, fullUv(), rgba(190, 255, 235, fade), 34));
      if (night > 0.3 && blink > 0.8) bloom.push(glowDot(particle.x, particle.y, 2, rgba(140, 255, 225, fade * night)));
    } else if (particle.kind === "Trail") {
      const fade = particle.remaining() * night;
      sparks.push(pixelSprite(particle.x, particle.y, 1, 1, fullUv(), rgba(110, 250, 255, fade * 0.7), 34));
      if (fade > 0.75) bloom.push(glowDot(particle.x, particle.y, 2, rgba(110, 250, 255, fade * 0.5)));
    }
  }
  frame.layers.push(solids("plankton", "additive", sparks));
  if (bloom.length > 0) frame.bloomLayers.push({ sprites: bloom, intensity: 2.2 });
}

/// 둥근 빛 고리의 (반지름 배율, 불투명도)다. 겹칠수록 가운데가 밝아져 계단식으로 감쇄한다.
const RINGS: [number, number][] = [
  [1, 0.14],
  [1.6, 0.09],
  [2.3, 0.055],
  [3.1, 0.03],
];

/// 픽셀 격자에 맞춘 둥근 판이다(빛 고리 한 겹).
function disc(x: number, y: number, size: number, color: Rgba): Sprite {
  return { cx: roundHalfAway(x) + 0.5, cy: roundHalfAway(y) + 0.5, w: size, h: size, rotation: 0, shape: { kind: "ellipse", segments: 32 }, uv: fullUv(), color, order: 33 };
}

export function glowDot(x: number, y: number, size: number, color: Rgba): Sprite {
  return { cx: roundHalfAway(x) + 0.5, cy: roundHalfAway(y) + 0.5, w: size, h: size, rotation: 0, shape: { kind: "ellipse", segments: 8 }, uv: fullUv(), color, order: 0 };
}

/// 빛줄기의 윗부분 중심 x와 반폭이다.
function rayCenters(game: Aquarium): [number, number][] {
  const out: [number, number][] = [];
  for (let index = 0; index < 6; index++) {
    out.push([12 + index * 78 + Math.sin(game.time * 0.11 + index * 1.7) * 10 + 8, 7]);
  }
  return out;
}
