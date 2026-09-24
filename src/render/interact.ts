// 사용자 교감 화면: 마우스가 가리키는 생물 찾기(픽셀 단위), 연노랑 테두리, 그림자 넣은 이름표.

import type { SceneAssets } from "./assets";
import { bodyOf } from "./creatures";
import type { Frame } from "./draw";
import { WHITE, rgba, roundHalfAway, textured } from "./draw";
import { label, textWidth } from "./overlay";
import { outlineOf, pixelsOf, solidAt } from "./pixels";
import type { View } from "./scene";
import { type Actor, type Aquarium, INDIVIDUAL_NAMES, VARIANT_NAMES, WIDTH } from "./simapi";

/// 월드 좌표 (x, y)에 보이는 가까운 층 생물을 찾는다. 몸 픽셀(작은 생물은 둘레 2px까지)을 눌러야 잡힌다.
export function pick(game: Aquarium, assets: SceneAssets, x: number, y: number): Actor | null {
  for (let index = game.actors.length - 1; index >= 0; index--) {
    const actor = game.actors[index];
    if (actor.depth !== 1 || actor.burrow > 0 || actor.alpha() < 0.35) continue;
    const species = game.species[actor.species];
    const body = bodyOf(game, assets, actor, WHITE, 0);
    const { sprite } = body;
    if (body.look.alpha < 0.3) continue;
    // 렌더러와 같은 식(로컬 y 위가 +)으로 돌린 좌표를 되돌린다.
    const dx = x - sprite.cx;
    const dy = y - sprite.cy;
    const cos = Math.cos(sprite.rotation);
    const sin = Math.sin(sprite.rotation);
    const lx = dx * cos - dy * sin;
    const ly = -dx * sin - dy * cos;
    const slack = species.frameW < 30 ? 2 : 1;
    if (Math.abs(lx) > sprite.w * 0.5 + slack || Math.abs(ly) > sprite.h * 0.5 + slack) continue;
    const art = assets.species[actor.species];
    const texture = body.alt && art.alt ? art.alt.texture : art.texture;
    const pixels = pixelsOf(texture);
    if (!pixels) return actor;
    const [u0, v0, u1, v1] = sprite.uv;
    const rx = lx / sprite.w + 0.5;
    const ry = ly / sprite.h + 0.5;
    const tx = Math.floor((u0 + (u1 - u0) * rx) * pixels.w);
    const ty = Math.floor((v0 + (v1 - v0) * ry) * pixels.h);
    for (let oy = -slack; oy <= slack; oy++) {
      for (let ox = -slack; ox <= slack; ox++) {
        if (solidAt(pixels, tx + ox, ty + oy)) return actor;
      }
    }
  }
  return null;
}

/// 호버 이름이다. 희귀 색 변이는 앞에 색 이름을, 방문자 단골 개체는 뒤에 별명을 붙인다.
export function displayName(game: Aquarium, actor: Actor): string {
  const rare = actor.variant > 0 ? `${VARIANT_NAMES[actor.variant as 1 | 2 | 3]} ` : "";
  const nickname = actor.individual >= 0 ? ` · ${INDIVIDUAL_NAMES[actor.individual]}` : "";
  return `${rare}${game.species[actor.species].nameKo}${nickname}`;
}

/// 가리킨 생물에 연노랑 테두리를 두르고 머리 위에 이름을 띄운다.
export function appendHover(frame: Frame, view: View, game: Aquarium, assets: SceneAssets): void {
  if (game.hover === null || !game.started || game.dex.open) return;
  const actor = game.actors.find((entry) => entry.id === game.hover);
  if (!actor) return;
  const species = game.species[actor.species];
  const art = assets.species[actor.species];
  const pulse = 0.7 + 0.3 * Math.sin(game.time * 5);
  const fade = Math.min(1, actor.alpha() * 1.5);
  const body = bodyOf(game, assets, actor, rgba(255, 240, 150, 0.85 * pulse * fade), 37);
  const sheet = body.alt && art.alt ? art.alt : art;
  const cellW = body.alt && art.alt ? art.alt.w : species.frameW;
  const outline = outlineOf(sheet.texture, cellW);
  if (outline) frame.layers.push(textured("hover-outline", outline, "alpha", [body.sprite]));
  const { sprite } = body;
  const text = displayName(game, actor);
  const width = textWidth(text) + 8;
  const top = sprite.cy - Math.abs(sprite.h) * 0.5;
  // 머리 위가 화면 밖이면 몸 아래에 띄운다.
  const above = top - 15 >= 4;
  const labelY = above ? top - 15 : sprite.cy + Math.abs(sprite.h) * 0.5 + 3;
  const left = Math.min(Math.max(4, roundHalfAway(sprite.cx - width * 0.5)), WIDTH - 4 - width);
  label(frame, view, [left, labelY, width, 12], text, 10, [255, 246, 196, Math.trunc(255 * fade)], "center");
}
