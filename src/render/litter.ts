// 바다 쓰레기 그리기: 가라앉는 동안은 나풀거리고, 바닥에 닿으면 모래 위(뒷줄 소품·깊이 안개 앞, 생물 뒤)에 쌓인다.

import type { SceneAssets } from "./assets";
import type { Frame, Sprite } from "./draw";
import { cellUv, rgba, roundHalfAway, textured } from "./draw";
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
    color: rgba(255, 255, 255, alpha),
    order,
  };
}

export function appendLitter(frame: Frame, game: Aquarium, assets: SceneAssets): void {
  const batches: Sprite[][] = assets.trash.map(() => []);
  for (const item of game.litter.items) {
    // 바닥에 쌓인 쓰레기는 뒷줄 소품 앞, 가라앉는 쓰레기는 생물 사이를 지난다.
    batches[item.kind].push(trashSprite(item, assets, item.landed ? -53.5 : -12));
  }
  batches.forEach((sprites, kind) => {
    if (sprites.length > 0) frame.layers.push(textured(`trash-${kind}`, assets.trash[kind].texture, "alpha", sprites));
  });
}
