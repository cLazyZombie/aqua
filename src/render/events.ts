// 먼 실루엣, 가라앉는 물건·간식 바구니, 해류선, 손전등·잠수부 불빛, 빛나는 물결, 사건 입자.

import type { SceneAssets, Sheet } from "./assets";
import type { Frame, Rgba, Sprite } from "./draw";
import { WHITE, cellUv, fullUv, hash, mix, pixelRect, pixelSprite, remEuclid, rgb, rgba, roundHalfAway, solids, textured } from "./draw";
import type { View } from "./scene";
import { type Aquarium, HEIGHT, VIEW_LEFT, VIEW_WIDTH, WIDTH } from "./simapi";

/// 먼 층 실루엣 패럴랙스 계수다.
const FAR_THING = 0.35;

function dot(x: number, y: number, size: number, color: Rgba): Sprite {
  return { cx: roundHalfAway(x) + 0.5, cy: roundHalfAway(y) + 0.5, w: size, h: size, rotation: 0, shape: { kind: "ellipse", segments: 8 }, uv: fullUv(), color, order: 0 };
}

/// 먼 배경 층 사이에 끼는 고래·대왕오징어·잠수정 실루엣과 잠수정 탐조등.
export function appendFar(frame: Frame, view: View, game: Aquarium, assets: SceneAssets): void {
  const shift = view.shift(FAR_THING);
  const night = game.nightStrength();
  const tint = mix([40, 72, 118], [14, 30, 70], night);
  for (const thing of game.farThings) {
    let sheet: Sheet;
    let color: Rgba;
    if (thing.kind === "Whale") {
      sheet = assets.whale;
      color = rgb(tint, 0.78);
    } else if (thing.kind === "Squid") {
      sheet = assets.squid;
      color = rgb(mix(tint, [200, 90, 100], 0.6), 0.95);
    } else {
      sheet = assets.submarine;
      color = rgb(mix([150, 150, 120], tint, 0.4), 0.9);
    }
    const index = Math.trunc(Math.floor(thing.anim)) % sheet.frames;
    const x = thing.x + shift[0];
    const y = thing.y + shift[1];
    frame.layers.push(textured(`far-thing-${thing.kind}`, sheet.texture, "alpha", [pixelSprite(x, y, sheet.w, sheet.h, cellUv(index, sheet.frames, thing.facing < 0), color, -97)]));
    if (thing.kind === "Submarine") {
      // 잠수정 코끝에서 앞아래로 흔들리며 훑는 탐조등.
      const sweep = Math.sin(game.time * 0.6) * 0.35 + 0.35;
      const angle = thing.facing > 0 ? -sweep : Math.PI + sweep;
      const nose = [x + thing.facing * sheet.w * 0.45, y + 4];
      const length = 150;
      frame.layers.push(
        textured("sub-searchlight", assets.cone, "additive", [
          {
            cx: nose[0] + Math.cos(angle) * length * 0.5,
            cy: nose[1] - Math.sin(angle) * length * 0.5,
            w: length,
            h: 70,
            rotation: angle,
            shape: { kind: "quad" },
            uv: fullUv(),
            color: rgba(255, 245, 200, 0.35 + 0.25 * night),
            order: -96,
          },
        ]),
      );
    }
  }
}

/// 해류가 흐르는 동안 물속을 가로지르는 가는 흐름선.
export function appendCurrent(frame: Frame, game: Aquarium): void {
  const strength = Math.abs(game.current) / 26;
  if (strength < 0.02) return;
  const lines: Sprite[] = [];
  for (let index = 0; index < 32; index++) {
    const seed = index * 5.1;
    const length = 10 + hash(seed) * 26;
    const speed = game.current * (2.5 + hash(seed + 1) * 2);
    const x = remEuclid(hash(seed + 2) * (VIEW_WIDTH + 60) + game.time * speed, VIEW_WIDTH + 60) + VIEW_LEFT - 30;
    const y = 40 + hash(seed + 3) * 190;
    lines.push(pixelRect(x, y, length, 1, fullUv(), rgba(210, 245, 255, 0.28 * strength), 13));
  }
  frame.layers.push(solids("current-lines", "additive", lines));
}

/// 가라앉는 물건과 줄에 매달린 간식 바구니.
export function appendObjects(frame: Frame, game: Aquarium, assets: SceneAssets): void {
  for (const item of game.debris) {
    // 얼음 조각은 빙하 바다 소품 가운데 얼음 덩어리 그림을 쓴다.
    const ice = assets.props.find((prop) => prop.name === "ice-set-03");
    const sheet =
      item.kind === "Anchor"
        ? assets.anchor
        : item.kind === "Chest"
          ? item.open
            ? assets.chestOpen
            : assets.chestClosed
          : item.kind === "Ice" && ice
            ? { texture: ice.texture, w: ice.w, h: ice.h, frames: 1 }
            : assets.bottle;
    const tilt = item.landed === null ? Math.sin(game.time * 1.3 + item.h) * 0.15 : 0;
    const sprite = pixelSprite(item.x, item.y - (sheet.h - item.h) * 0.5, sheet.w, sheet.h, fullUv(), rgba(255, 255, 255, item.alpha()), -11);
    sprite.rotation = tilt;
    frame.layers.push(textured(`debris-${item.kind}`, sheet.texture, "alpha", [sprite]));
  }
  const hook = game.hook;
  if (hook) {
    const sheet = assets.basket;
    const line: Sprite[] = [];
    for (let y = 0; y < hook.y - sheet.h * 0.5; y += 2) {
      line.push(pixelRect(hook.x, y, 1, 2, fullUv(), rgba(220, 230, 235, 0.55), -11));
    }
    frame.layers.push(solids("basket-rope", "alpha", line));
    frame.layers.push(textured("treat-basket", sheet.texture, "alpha", [pixelSprite(hook.x, hook.y, sheet.w, sheet.h, fullUv(), WHITE, -9)]));
  }
}

/// 손전등·잠수부 불빛, 빛나는 물결, 유성, 고리, 사건 입자.
export function appendLights(frame: Frame, game: Aquarium, assets: SceneAssets): void {
  const night = game.nightStrength();
  const bloom: Sprite[] = [];
  const cones: Sprite[] = [];
  for (const actor of game.actors) {
    const species = game.species[actor.species];
    if (species.id !== "diver") continue;
    const [x, y] = actor.pose(game.time, species);
    const hand = [x + actor.facing * species.frameW * 0.46, y - 2];
    const length = 130;
    cones.push({
      cx: hand[0] + actor.facing * length * 0.5,
      cy: hand[1] + 6,
      w: length,
      h: 64,
      rotation: -0.08 * actor.facing,
      shape: { kind: "quad" },
      uv: cellUv(0, 1, actor.facing < 0),
      color: rgba(255, 250, 215, (0.25 + 0.5 * night) * actor.alpha()),
      order: 33,
    });
    bloom.push(dot(hand[0], hand[1], 5, rgba(255, 250, 220, actor.alpha())));
  }
  if (cones.length > 0) frame.layers.push(textured("diver-light", assets.cone, "additive", cones));
  if (game.flashlight && night > 0.2 && game.pointer) {
    const [px, py] = game.pointer;
    // 손전등도 은은하게: 비춘 발광 생물이 하얗게 타지 않을 만큼만 밝힌다.
    frame.layers.push(textured("flashlight", assets.spot, "additive", [pixelSprite(px, py, 96, 96, fullUv(), rgba(255, 245, 210, 0.36 * night), 33)]));
    bloom.push(dot(px, py, 5, rgba(255, 245, 220, 0.6 * night)));
  }
  const glow: Sprite[] = [];
  if (game.glowWave !== null) {
    // 수면 아래를 따라 한쪽에서 반대쪽으로 번지는 청록 빛 물결.
    const head = VIEW_LEFT + game.glowWave * (VIEW_WIDTH + 200) - 100;
    for (let column = 0; column < VIEW_WIDTH / 2; column++) {
      const x = VIEW_LEFT + column * 2;
      const distance = Math.abs(x - head);
      if (distance > 90) continue;
      const strength = Math.pow(1 - distance / 90, 1.5) * (0.4 + 0.6 * night);
      const ripple = roundHalfAway(Math.sin(x * 0.18 - game.time * 4) * 3);
      for (let row = 0; row < 4; row++) {
        glow.push(pixelRect(x, 26 + ripple + row * 3, 2, 2, fullUv(), rgba(90, 255, 225, strength * (1 - row * 0.22)), 34));
      }
      if (column % 3 === 0 && strength > 0.5) bloom.push(dot(x, 28 + ripple, 4, rgba(90, 255, 225, strength)));
    }
  }
  const specks: [number, number, number, number][] = [];
  const love: Sprite[] = [];
  const fireworks: Sprite[] = [];
  for (const particle of game.particles) {
    const fade = particle.remaining();
    const { x, y } = particle;
    switch (particle.kind) {
      case "Meteor":
        for (let trail = 0; trail < 6; trail++) {
          const t = trail * 0.012;
          glow.push(pixelRect(x - particle.vx * t, y - particle.vy * t, 1, 1, fullUv(), rgba(255, 250, 225, fade * (1 - trail / 6)), 34));
        }
        bloom.push(dot(x, y, 3, rgba(255, 250, 225, fade)));
        break;
      case "Ring": {
        if (particle.age < 0) break;
        // 고래 노래 고리(수명 2초 넘음)는 천천히, 유리 두드림 고리는 빠르게 퍼진다.
        const speed = particle.life > 2 ? 34 : 70;
        const radius = 4 + particle.age * speed;
        const points = Math.trunc(Math.min(64, Math.max(12, radius * 0.9)));
        for (let point = 0; point < points; point++) {
          const angle = (point / points) * Math.PI * 2;
          glow.push(pixelRect(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius * 0.6, 1, 1, fullUv(), rgba(200, 240, 255, fade * 0.7), 34));
        }
        break;
      }
      case "Spark":
      case "Gold": {
        const color = particle.kind === "Gold" ? rgba(255, 215, 90, fade) : rgba(255, 255, 200, fade);
        glow.push(pixelSprite(x, y, 1, 1, fullUv(), color, 34));
        if (fade > 0.5) bloom.push(dot(x, y, 2, color));
        break;
      }
      case "Spawn": {
        const tone = particle.seed < 0.5 ? rgba(255, 170, 190, fade) : rgba(255, 215, 150, fade);
        glow.push(pixelSprite(x, y, 1, 1, fullUv(), tone, 34));
        if (night > 0.3 && particle.seed > 0.85) bloom.push(dot(x, y, 2, rgba(255, 190, 200, fade * night)));
        break;
      }
      case "Bubble":
        specks.push([x, y, particle.seed > 0.6 ? 1 : 0, fade]);
        break;
      case "Ink": {
        const size = roundHalfAway(2 + particle.age * 3);
        glow.push({ cx: roundHalfAway(x) + 0.5, cy: roundHalfAway(y) + 0.5, w: size, h: size, rotation: 0, shape: { kind: "quad" }, uv: fullUv(), color: rgba(18, 12, 34, fade * 0.75), order: 12 });
        break;
      }
      case "Heart": {
        const color = rgba(255, 120, 170, fade);
        for (const [dx, dy] of [
          [-1, 0],
          [1, 0],
          [-1, -1],
          [1, -1],
          [0, 0],
          [0, 1],
        ]) {
          glow.push(pixelRect(x + dx, y + dy, 1, 1, fullUv(), color, 34));
        }
        break;
      }
      case "Exclaim": {
        const color = rgba(255, 250, 180, fade);
        glow.push(pixelRect(x, y - 3, 1, 3, fullUv(), color, 34));
        glow.push(pixelRect(x, y + 1, 1, 1, fullUv(), color, 34));
        break;
      }
      case "Note": {
        // 8분음표: 둥근 머리, 기둥, 꼬리 한 점.
        const color = rgba(255, 236, 160, Math.min(1, fade * 1.4));
        glow.push(pixelRect(x - 1, y - 1, 2, 2, fullUv(), color, 34));
        glow.push(pixelRect(x + 1, y - 5, 1, 5, fullUv(), color, 34));
        glow.push(pixelRect(x + 2, y - 5, 1, 1, fullUv(), color, 34));
        glow.push(pixelRect(x + 3, y - 4, 1, 1, fullUv(), color, 34));
        break;
      }
      case "Zap": {
        const color = rgba(150, 225, 255, fade);
        const bend = particle.seed * 10 > 5 ? 1 : -1;
        glow.push(pixelRect(x, y - 2, 1, 2, fullUv(), color, 34));
        glow.push(pixelRect(x + bend, y, 1, 1, fullUv(), color, 34));
        glow.push(pixelRect(x, y + 1, 1, 2, fullUv(), color, 34));
        bloom.push(dot(x, y, 3, rgba(120, 200, 255, fade)));
        break;
      }
      case "Donut": {
        // 도넛 기포 고리: 커지며 떠오르는 타원 테두리(옆에서 본 고리).
        const grow = Math.min(1, particle.age / 1.5);
        const rx = 5 + grow * 7;
        const ry = rx * 0.42;
        const points = 22;
        for (let point = 0; point < points; point++) {
          const angle = (point / points) * Math.PI * 2 + Math.sin(game.time * 3) * 0.1;
          const px = x + Math.cos(angle) * rx;
          const py = y + Math.sin(angle) * ry;
          const front = Math.sin(angle) > 0;
          love.push(pixelRect(px, py, 1, 1, fullUv(), rgba(front ? 235 : 190, front ? 250 : 225, 255, fade * (front ? 0.9 : 0.55)), 36));
        }
        break;
      }
      case "Fry": {
        // 갓 태어난 새끼: 1x2 픽셀. 흰동가리 치어(seed 0.9 이상)는 주황, 새끼 해마는 연한 금빛.
        const color = particle.seed >= 0.9 ? rgba(255, 150, 80, fade) : rgba(255, 214, 150, fade);
        love.push(pixelRect(x, y, 1, 2, fullUv(), color, 36));
        break;
      }
      case "Firework": {
        const palette: [number, number, number][] = [
          [255, 120, 170],
          [255, 214, 90],
          [120, 230, 255],
          [170, 255, 120],
          [190, 140, 255],
          [255, 160, 90],
        ];
        const tone = palette[Math.min(5, Math.floor(particle.seed * 6))];
        // 불꽃은 비네트 위(order 41)에 2픽셀로 그려 어두운 밤 수면에서도 또렷하다.
        fireworks.push(pixelSprite(x, y, 2, 2, fullUv(), rgb(tone, fade), 41));
        if (fade > 0.4) bloom.push(dot(x, y, 3, rgb(tone, fade * 0.7)));
        break;
      }
      case "Love": {
        // 교감 때 떠오르는 큰 하트(7x6). 가산이 아니라 덮어 그려 밝은 낮에도 또렷하다.
        const a = Math.min(1, fade * 1.6);
        const rows = [".XX.XX.", "XXXXXXX", "XXXXXXX", ".XXXXX.", "..XXX..", "...X..."];
        rows.forEach((row, dy) => {
          for (let dx = 0; dx < row.length; dx++) {
            if (row[dx] !== "X") continue;
            const shine = dx === 1 && dy === 1;
            love.push(pixelRect(x - 3 + dx, y - 3 + dy, 1, 1, fullUv(), shine ? rgba(255, 225, 235, a) : rgba(255, 96, 150, a), 38));
          }
        });
        love.push(pixelRect(x - 4, y - 2, 1, 2, fullUv(), rgba(120, 20, 60, a * 0.7), 37));
        love.push(pixelRect(x + 4, y - 2, 1, 2, fullUv(), rgba(120, 20, 60, a * 0.7), 37));
        if (fade > 0.4) bloom.push(dot(x, y, 5, rgba(255, 120, 170, fade * 0.6)));
        break;
      }
      default:
        break;
    }
  }
  frame.layers.push(solids("event-ink", "alpha", glow.filter((s) => s.order === 12)));
  frame.layers.push(solids("love", "alpha", love));
  frame.layers.push(solids("fireworks", "additive", fireworks));
  frame.layers.push(solids("event-glow", "additive", glow.filter((s) => s.order !== 12)));
  frame.layers.push(
    textured(
      "event-bubbles",
      assets.bubbles,
      "alpha",
      specks.map(([x, y, size, fade]) => pixelSprite(x, y, 7, 7, cellUv(size, 3, false), rgba(255, 255, 255, Math.min(1, fade)), 1)),
    ),
  );
  if (bloom.length > 0) frame.bloomLayers.push({ sprites: bloom, intensity: 2.2 });
}

/// 잠수부 사진 플래시. 화면 전체가 짧게 하얗게 번쩍인다.
export function appendPhoto(frame: Frame, view: View, game: Aquarium, assets: SceneAssets): void {
  if (game.photo < 0.01) return;
  const screen = view.shift(0);
  frame.layers.push(
    textured("photo-flash", assets.spot, "additive", [
      pixelRect(screen[0] - WIDTH * 0.25, screen[1] - HEIGHT * 0.6, WIDTH * 1.5, HEIGHT * 2.2, fullUv(), rgba(255, 255, 255, game.photo * 0.8), 36),
    ]),
  );
}
