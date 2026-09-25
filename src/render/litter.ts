// 바다 쓰레기 그리기: 가라앉는 동안은 나풀거리고, 바닥에 닿으면 모래 위(뒷줄 소품·깊이 안개 앞, 생물 뒤)에 쌓인다.

import type { SceneAssets } from "./assets";
import type { Frame, Sprite } from "./draw";
import { cellUv, fullUv, rgba, roundHalfAway, solids, textured } from "./draw";
import type { Aquarium } from "./simapi";
import type { Trash } from "../sim/trash";

/// 쓰레기 하나의 스프라이트다. 좌우는 개체마다 해시로 뒤집는다.
export function trashSprite(item: Trash, assets: SceneAssets, order: number, alpha = 1): Sprite {
  const sheet = assets.trash[item.kind];
  const flip = item.seed > 0.5;
  return {
    cx: roundHalfAway(item.x - sheet.w * 0.5) + sheet.w * 0.5,
    cy: roundHalfAway(item.y - sheet.h * 0.5) + sheet.h * 0.5,
    w: sheet.w,
    h: sheet.h,
    rotation: item.tilt(),
    shape: { kind: "quad" },
    uv: cellUv(0, 1, flip),
    // 조명을 받지 않는 그림이라 물빛으로 살짝 가라앉혀 주변과 어울리게 한다.
    color: rgba(226, 234, 238, alpha),
    order,
  };
}

export function appendLitter(frame: Frame, game: Aquarium, assets: SceneAssets): void {
  const batches: Sprite[][] = assets.trash.map(() => []);
  const shadows: Sprite[] = [];
  for (const item of game.litter.items) {
    // 바닥에 놓인 쓰레기는 모래에 옅은 그림자를 남긴다(떠 보이지 않게).
    if (item.landed) {
      const sheet = assets.trash[item.kind];
      shadows.push({ cx: roundHalfAway(item.x), cy: roundHalfAway(item.y + sheet.h * 0.5), w: roundHalfAway(sheet.w * 0.9), h: 3, rotation: 0, shape: { kind: "ellipse", segments: 12 }, uv: fullUv(), color: rgba(16, 28, 40, 0.3), order: -53.6 });
    }
    // 바닥에 쌓인 쓰레기는 뒷줄 소품 앞, 가라앉는 쓰레기는 생물 사이를 지난다.
    batches[item.kind].push(trashSprite(item, assets, item.landed ? -53.5 : -12));
  }
  if (shadows.length > 0) frame.layers.push(solids("trash-shadow", "alpha", shadows));
  batches.forEach((sprites, kind) => {
    if (sprites.length > 0) frame.layers.push(textured(`trash-${kind}`, assets.trash[kind].texture, "alpha", sprites));
  });
}
