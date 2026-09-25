// 사건 2부의 무대 그리기: 캠프파이어 빛기둥, 돌고래 해초 잎, 문어 조개껍데기, 망둑 굴, 켈프 햇살, 난파선 금빛,
// 유적 룬, 오로라, 고무 오리, 흰동가리 알, 빈 소라 껍데기, 다이버가 심은 산호, 해녀의 테왁.
// 가산 빛은 하얗게 타지 않게 옅게 두고, 모두 시간·해시로만 흔든다.

import { glowDot } from "./creatures";
import type { SceneAssets } from "./assets";
import type { Frame, Sprite } from "./draw";
import { cellUv, fullUv, hash, pixelRect, rgb, rgba, roundHalfAway, solids, textured } from "./draw";
import { type Aquarium, FLOOR_Y, VIEW_LEFT, VIEW_RIGHT, VIEW_WIDTH } from "./simapi";

const TAU = Math.PI * 2;

/// 모래 위 물건(굴·조개껍데기·알·빈 껍데기·산호·오리)과 물속 빛(빛기둥·햇살·금빛·룬·오로라)을 그린다.
export function appendSetPieces(frame: Frame, game: Aquarium, assets: SceneAssets): void {
  const set = game.setpiece;
  const night = game.nightStrength();
  const solidsBack: Sprite[] = [];
  const glow: Sprite[] = [];
  const aurora: Sprite[] = [];
  const bloom: Sprite[] = [];
  // 망둑·딱총새우 굴: 모래에 난 어두운 구멍.
  if (set.burrow) {
    const x = set.burrow.x;
    solidsBack.push({ cx: roundHalfAway(x), cy: FLOOR_Y + 2.5, w: 16, h: 5, rotation: 0, shape: { kind: "ellipse", segments: 16 }, uv: fullUv(), color: rgba(92, 72, 48, 0.9), order: -57.6 });
    solidsBack.push({ cx: roundHalfAway(x), cy: FLOOR_Y + 2.5, w: 10, h: 3, rotation: 0, shape: { kind: "ellipse", segments: 12 }, uv: fullUv(), color: rgba(30, 24, 20, 0.95), order: -57.5 });
  }
  // 문어가 모으는 조개껍데기(부채꼴·원뿔 두 모양).
  for (const trinket of set.trinkets) {
    const tone = trinket.seed < 0.33 ? [250, 206, 196] : trinket.seed < 0.66 ? [246, 226, 170] : [214, 206, 246];
    const color = rgb(tone as [number, number, number], 1);
    const dark = rgba(tone[0] * 0.6, tone[1] * 0.6, tone[2] * 0.6, 1);
    // 깊이 안개(-55) 앞에 그려 모래 위 물건이 흐려지지 않게 한다.
    const order = trinket.carrier === null ? -54 : -9;
    const x = trinket.x;
    const y = trinket.y;
    if (trinket.seed < 0.5) {
      solidsBack.push(pixelRect(x - 2, y - 3, 5, 3, fullUv(), color, order));
      solidsBack.push(pixelRect(x - 1, y - 4, 3, 1, fullUv(), color, order));
      solidsBack.push(pixelRect(x - 1, y - 3, 1, 3, fullUv(), dark, order + 0.01));
      solidsBack.push(pixelRect(x + 1, y - 3, 1, 3, fullUv(), dark, order + 0.01));
    } else {
      solidsBack.push(pixelRect(x - 2, y - 2, 4, 2, fullUv(), color, order));
      solidsBack.push(pixelRect(x - 1, y - 4, 2, 2, fullUv(), color, order));
      solidsBack.push(pixelRect(x, y - 5, 1, 1, fullUv(), dark, order + 0.01));
    }
  }
  // 흰동가리 알 무더기: 주황 알이 오글오글 붙어 있고, 부화가 가까우면 은빛 눈이 비치고 살짝 꿈틀댄다.
  if (set.nest) {
    const { x, y, hatch } = set.nest;
    const alpha = 1 - hatch;
    for (let egg = 0; egg < 22; egg++) {
      const angle = hash(egg * 3.7) * TAU;
      const radius = Math.sqrt(hash(egg * 5.1)) * 6;
      const wiggle = game.time % 1.6 < 0.2 && egg % 3 === 0 ? 1 : 0;
      const ex = x + Math.cos(angle) * radius * 1.6 + wiggle;
      const ey = y - 2 + Math.sin(angle) * radius * 0.6;
      solidsBack.push(pixelRect(ex, ey, 2, 2, fullUv(), rgba(255, 140, 70, alpha), -54));
      solidsBack.push(pixelRect(ex, ey, 1, 1, fullUv(), rgba(255, 200, 150, alpha), -53.9));
      if (egg % 2 === 0) solidsBack.push(pixelRect(ex + 1, ey + 1, 1, 1, fullUv(), rgba(70, 70, 90, alpha * 0.8), -53.8));
    }
  }
  frame.layers.push(solids("setpiece-floor", "alpha", solidsBack));
  // 소라게들이 차례로 들어가는 빈 소라 껍데기.
  if (set.shell) {
    const sheet = assets.shell;
    const w = Math.max(4, roundHalfAway(sheet.w * set.shell.scale));
    const h = Math.max(4, roundHalfAway(sheet.h * set.shell.scale));
    frame.layers.push(textured("empty-shell", sheet.texture, "alpha", [pixelRect(set.shell.x - w * 0.5, set.shell.y - h + 1, w, h, fullUv(), rgba(236, 236, 236, 1), -54)]));
  }
  // 다이버가 심은 산호: 조금씩 자라 이번 실행 동안 남는다.
  const coral = assets.props.find((prop) => prop.name === "coral-06") ?? assets.props[0];
  if (coral) {
    const planted = set.planted
      .filter((plant) => plant.grow > 0.02)
      .map((plant) => {
        const w = Math.max(2, roundHalfAway(coral.w * (0.3 + 0.7 * plant.grow)));
        const h = Math.max(2, roundHalfAway(coral.h * (0.3 + 0.7 * plant.grow)));
        return pixelRect(plant.x - w * 0.5, FLOOR_Y + 1 - h, w, h, cellUv(0, coral.frames, false), rgba(214, 232, 240, 1), -59);
      });
    if (planted.length > 0) frame.layers.push(textured("planted-coral", coral.texture, "alpha", planted));
  }
  // 수면을 떠가는 고무 오리: 몸 아래쪽이 수면 아래로 잠겨 보인다.
  if (set.floaters.length > 0) {
    const sheet = assets.duck;
    const ducks = set.floaters.map((duck) => {
      const bob = roundHalfAway(Math.sin(game.time * 2.2 + duck.phase) * 1);
      return pixelRect(duck.x - sheet.w * 0.5, 17 - sheet.h * 0.62 + bob, sheet.w, sheet.h, cellUv(0, 1, duck.facing < 0), rgba(255, 255, 255, 0.95), -93);
    });
    frame.layers.push(textured("rubber-ducks", sheet.texture, "alpha", ducks));
  }
  // 해녀의 테왁(주황 부표): 해녀 머리 위 수면에 뜨고, 줄이 해녀 손까지 이어진다.
  const floats: Sprite[] = [];
  for (const actor of game.actors) {
    if (game.species[actor.species].id !== "haenyeo" || actor.depth !== 1) continue;
    const fx = actor.x - actor.facing * 6;
    const bob = roundHalfAway(Math.sin(game.time * 1.8 + actor.phase));
    floats.push({ cx: roundHalfAway(fx), cy: 18 + bob, w: 9, h: 7, rotation: 0, shape: { kind: "ellipse", segments: 16 }, uv: fullUv(), color: rgba(242, 124, 40, actor.alpha()), order: -92 });
    floats.push(pixelRect(fx - 3, 16 + bob, 2, 1, fullUv(), rgba(255, 200, 150, actor.alpha()), -91.9));
    floats.push(pixelRect(fx - 4, 20 + bob, 9, 1, fullUv(), rgba(60, 40, 30, actor.alpha()), -91.9));
    const top = 22 + bob;
    const bottom = actor.y - 6;
    for (let y = top; y < bottom; y += 3) {
      const t = (y - top) / Math.max(1, bottom - top);
      floats.push(pixelRect(fx + (actor.x - fx) * t, y, 1, 2, fullUv(), rgba(210, 200, 170, 0.45 * actor.alpha()), -92));
    }
  }
  frame.layers.push(solids("tewak", "alpha", floats));
  // 만타 캠프파이어 빛기둥: 모래에서 위로 비추는 부드러운 원뿔.
  if (set.beam && set.beam.strength > 0.01) {
    const length = 170;
    const strength = set.beam.strength * (0.25 + 0.75 * night);
    frame.layers.push(
      textured("campfire-beam", assets.cone, "additive", [
        { cx: set.beam.x, cy: FLOOR_Y - 14 - length * 0.5, w: length, h: 70, rotation: Math.PI / 2, shape: { kind: "quad" }, uv: fullUv(), color: rgba(255, 246, 214, 0.32 * strength), order: 33 },
      ]),
    );
    bloom.push(glowDot(set.beam.x, FLOOR_Y - 16, 4, rgba(255, 240, 200, 0.7 * strength)));
  }
  // 돌고래가 주고받는 해초 잎(초록 리본과 밝은 잎맥).
  if (set.toy) {
    const { x, y } = set.toy;
    const tilt = Math.sin(game.time * 3) > 0 ? 1 : -1;
    const blade: Sprite[] = [];
    for (let k = -7; k <= 7; k++) {
      const dy = roundHalfAway(Math.sin(k * 0.5 + game.time * 4) * 1.2) + (k > 2 ? tilt : 0);
      const thick = Math.abs(k) < 5 ? 3 : 2;
      blade.push(pixelRect(x + k, y + dy - 1, 1, thick, fullUv(), rgba(56, 150, 66, 1), -9));
      if (Math.abs(k) < 5) blade.push(pixelRect(x + k, y + dy, 1, 1, fullUv(), rgba(170, 230, 120, 1), -8.9));
    }
    frame.layers.push(solids("kelp-toy", "alpha", blade));
  }
  // 켈프 숲 햇살 커튼: 다시마 사이로 흔들리며 내려오는 빛기둥과 모래 위에 일렁이는 빛 무늬.
  if (set.sunflecks > 0.01) {
    const shafts: Sprite[] = [];
    const dapples: Sprite[] = [];
    for (let shaft = 0; shaft < 5; shaft++) {
      const seed = shaft * 3.1 + 40;
      const x = 50 + shaft * 92 + hash(seed) * 24 + Math.sin(game.time * 0.3 + seed) * 12;
      const breathe = 0.55 + 0.45 * Math.sin(game.time * (0.5 + hash(seed + 1) * 0.3) + seed);
      const tilt = -Math.PI / 2 + 0.1 + Math.sin(game.time * 0.2 + seed) * 0.05;
      const length = 250;
      shafts.push({
        cx: x + Math.cos(tilt) * length * 0.5,
        cy: -8 - Math.sin(tilt) * length * 0.5,
        w: length,
        h: 38 + hash(seed + 2) * 16,
        rotation: tilt,
        shape: { kind: "quad" },
        uv: fullUv(),
        color: rgba(255, 244, 190, 0.2 * breathe * set.sunflecks),
        order: 32.4,
      });
    }
    frame.layers.push(textured("sun-curtain", assets.cone, "additive", shafts));
    for (let fleck = 0; fleck < 26; fleck++) {
      const seed = fleck * 2.9 + 300;
      const x = VIEW_LEFT + hash(seed) * VIEW_WIDTH + Math.sin(game.time * 0.5 + seed) * 6;
      const y = FLOOR_Y - 3 + hash(seed + 1) * 9;
      const flicker = Math.pow(Math.sin(game.time * (1.2 + hash(seed + 2)) + seed) * 0.5 + 0.5, 2);
      const a = set.sunflecks * flicker * 0.34;
      if (a < 0.02) continue;
      dapples.push({ cx: roundHalfAway(x), cy: roundHalfAway(y), w: 6 + roundHalfAway(hash(seed + 3) * 6), h: 2 + roundHalfAway(hash(seed + 4)), rotation: 0, shape: { kind: "ellipse", segments: 10 }, uv: fullUv(), color: rgba(255, 244, 196, a), order: -56 });
    }
    frame.layers.push(solids("sun-dapples", "additive", dapples));
  }
  // 난파선 선체 구멍에서 새어 나오는 금빛.
  if (set.wreckGlow > 0.01) {
    const pulse = 0.8 + 0.2 * Math.sin(game.time * 2.4);
    [
      [40, 0.14],
      [26, 0.12],
      [14, 0.1],
    ].forEach(([size, alpha]) => {
      glow.push({ cx: 94, cy: 190, w: size * 1.4, h: size, rotation: 0, shape: { kind: "ellipse", segments: 24 }, uv: fullUv(), color: rgba(255, 206, 90, alpha * set.wreckGlow * pulse), order: 32.5 });
    });
    bloom.push(glowDot(94, 190, 6, rgba(255, 210, 110, 0.5 * set.wreckGlow)));
  }
  // 빙하 바다 오로라: 얼음판 너머로 초록·보라 빛 커튼이 느리게 일렁인다. 위는 진하고 아래로 세 단계 옅어진다.
  if (set.aurora > 0.01) {
    for (let column = VIEW_LEFT; column < VIEW_RIGHT; column += 2) {
      const broad = 0.5 + 0.5 * Math.sin(column * 0.023 + game.time * 0.4) * Math.sin(column * 0.009 - game.time * 0.17 + 1.3);
      // 가는 세로 결을 얹어 커튼 주름처럼 보이게 한다.
      const wave = broad * (0.72 + 0.28 * Math.sin(column * 0.19 + game.time * 1.1));
      const level = wave > 0.5 ? 1 : wave > 0.32 ? 0.65 : 0.35;
      // 대부분 초록이고 군데군데 보랏빛이 섞인다.
      const t = (0.5 + 0.5 * Math.sin(column * 0.014 + game.time * 0.05)) ** 2;
      const color: [number, number, number] = [60 + 140 * t, 255 - 120 * t, 150 + 100 * t];
      const top = roundHalfAway(4 + 6 * Math.sin(column * 0.017 + game.time * 0.3));
      const height = roundHalfAway(10 + 22 * wave);
      const alpha = 0.5 * level * set.aurora * night;
      // 비네트 위(order 41)에 그려 어두운 밤에도 빛 커튼이 보인다.
      [[0, 1], [height, 0.5], [height + 8, 0.22]].forEach(([offset, share], step) => {
        const span = step === 0 ? height : 8;
        aurora.push(pixelRect(column, Math.max(0, top) + offset, 2, span, fullUv(), rgb(color, alpha * share), 41));
      });
    }
  }
  frame.layers.push(solids("setpiece-light", "additive", glow));
  frame.layers.push(solids("aurora", "additive", aurora));
  // 해저 유적 룬: 유적 소품이 왼쪽부터 차례로 청록빛으로 떠오른다.
  if (set.runeStrength > 0.01) {
    const stones = assets.scene.layout
      .filter((placement) => placement.row !== "floor" && assets.props[placement.prop]?.name.startsWith("ruins-set"))
      .sort((a, b) => a.x - b.x);
    const runes: Map<number, Sprite[]> = new Map();
    stones.forEach((placement, rank) => {
      const prop = assets.props[placement.prop];
      const lit = Math.min(1, Math.max(0, set.runes * (stones.length + 1) - rank));
      if (lit <= 0) return;
      const bottom = placement.row === "front" ? 273 : FLOOR_Y + 1;
      const pulse = 0.7 + 0.3 * Math.sin(game.time * 3 + rank);
      const sprite = pixelRect(placement.x - prop.w * 0.5, bottom - prop.h, prop.w, prop.h, cellUv(0, prop.frames, placement.flip), rgba(110, 240, 255, 0.35 * lit * pulse * set.runeStrength), 33);
      const list = runes.get(placement.prop) ?? [];
      list.push(sprite);
      runes.set(placement.prop, list);
      bloom.push(glowDot(placement.x, bottom - prop.h * 0.5, 4, rgba(110, 240, 255, 0.4 * lit * set.runeStrength)));
    });
    for (const [index, sprites] of runes) {
      frame.layers.push({ id: `runes-${index}`, material: { kind: "silhouette", texture: assets.props[index].texture }, blend: "additive", sprites });
    }
  }
  if (bloom.length > 0) frame.bloomLayers.push({ sprites: bloom, intensity: 1.2 });
}
