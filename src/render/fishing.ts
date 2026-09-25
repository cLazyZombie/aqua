// 낚시 화면: 낚싯줄(장력에 따라 흰색→노랑→빨강, 느슨하면 처짐), 찌(입질에 까딱·푹), 미끼, 겨눈 자리,
// 힘 게이지(좋은 칸·완벽 칸), 장력 게이지(빨간 칸)와 남은 줄, 알림·안내 글자, 결과 자막.
// 화면 가운데를 가리지 않게 게이지와 글자는 아래쪽 가운데(낚시 버튼 위)에 둔다.

import type { Frame, Rgba, Sprite } from "./draw";
import { fullUv, mix, pixelRect, rgb, rgba, roundHalfAway, solids } from "./draw";
import { label, textWidth } from "./overlay";
import type { View } from "./scene";
import { type Aquarium, FLOOR_Y, HEIGHT, SURFACE_Y, WIDTH } from "./simapi";
import { GOOD_BAND, PERFECT_BAND, ROD_TIP, SWEET, TENSION_RED, meterAt } from "../sim/fishing";

const GAUGE_W = 120;
/// 게이지·안내 뒤 판의 폭이다.
const PANEL_W = 212;
// 낚시 버튼(아래 가운데) 위에 게이지·알림·안내를 쌓는다.
const GAUGE_Y = HEIGHT - 60;

/// 두 점 사이를 1픽셀 점으로 잇는다. `sag`만큼 가운데가 처진다(느슨한 줄).
function line(out: Sprite[], from: [number, number], to: [number, number], color: Rgba, sag: number, order: number, jitter = 0): void {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const steps = Math.max(1, Math.ceil(length));
  let last = "";
  for (let n = 0; n <= steps; n += 1) {
    const t = n / steps;
    const bend = Math.sin(t * Math.PI) * sag + (jitter > 0 ? Math.sin(t * 20 + jitter) * 0.8 : 0);
    const x = roundHalfAway(from[0] + (to[0] - from[0]) * t);
    const y = roundHalfAway(from[1] + (to[1] - from[1]) * t + bend);
    const key = `${x},${y}`;
    if (key === last) continue;
    last = key;
    // 밝은 낮 물에서도 보이게 한 픽셀 아래에 옅은 그림자를 둔다.
    out.push(pixelRect(x, y + 1, 1, 1, fullUv(), rgba(10, 30, 50, 0.35 * (color[3] / 255)), order - 0.01));
    out.push(pixelRect(x, y, 1, 1, fullUv(), color, order));
  }
}

/// 장력 색: 느슨하면 흰색, 팽팽할수록 노랑, 빨간 칸이면 빨강이다.
function tensionColor(tension: number): [number, number, number] {
  if (tension < 0.6) return mix([235, 240, 245], [255, 230, 120], tension / 0.6);
  return mix([255, 230, 120], [255, 70, 60], Math.min(1, (tension - 0.6) / (TENSION_RED - 0.6)));
}

export function appendFishing(frame: Frame, view: View, game: Aquarium): void {
  const fishing = game.fishing;
  if (!fishing.active || !game.started) return;
  const world: Sprite[] = [];
  const time = game.time;
  const phase = fishing.phase;
  // 낚싯줄: 낚싯대 끝 → (찌 → 미끼) 또는 걸린 물고기 입.
  const bob = Math.sin(time * 2.4) * 0.6;
  const bobberY = SURFACE_Y - 1 + bob + fishing.dip * 4;
  if (phase === "fly" || phase === "reel") {
    line(world, ROD_TIP, fishing.bait, rgba(235, 240, 245, 0.8), 6, 8);
  } else if (phase === "sink" || phase === "wait") {
    line(world, ROD_TIP, [fishing.bobber, bobberY], rgba(235, 240, 245, 0.75), 8, 8);
    line(world, [fishing.bobber, bobberY + 3], fishing.bait, rgba(220, 230, 235, 0.55), 0, 8);
  } else if (phase === "fight" || phase === "landed") {
    const end = fishing.lineEnd(game);
    const tension = fishing.tension;
    const color = tensionColor(tension);
    line(world, ROD_TIP, end, rgb(color, 0.9), Math.max(0, 1 - tension * 1.4) * 18, 8, tension > 0.75 ? time * 30 : 0);
  }
  // 찌: 위는 빨강, 아래는 흰색. 건드리면 살짝, 진짜 입질이면 푹 잠긴다.
  if (phase === "sink" || phase === "wait") {
    const x = roundHalfAway(fishing.bobber) - 1;
    const y = roundHalfAway(bobberY) - 3;
    world.push(pixelRect(x - 1, y - 1, 5, 7, fullUv(), rgba(20, 30, 45, 0.9), 8.9));
    world.push(pixelRect(x, y, 3, 3, fullUv(), rgba(236, 60, 54, 1), 9));
    world.push(pixelRect(x, y + 3, 3, 2, fullUv(), rgba(245, 245, 240, 1), 9));
    world.push(pixelRect(x + 1, y - 2, 1, 2, fullUv(), rgba(40, 40, 40, 1), 9));
  }
  // 미끼: 은빛 바늘과 꼬물거리는 분홍 지렁이.
  if ((phase === "fly" || phase === "sink" || phase === "wait" || phase === "reel") && fishing.hasBait) {
    const [bx, by] = [roundHalfAway(fishing.bait[0]), roundHalfAway(fishing.bait[1])];
    const wiggle = Math.sin(time * 6) > 0 ? 1 : 0;
    world.push(pixelRect(bx, by - 2, 1, 3, fullUv(), rgba(200, 210, 220, 1), 9));
    world.push(pixelRect(bx - 1, by + 1, 2, 1, fullUv(), rgba(200, 210, 220, 1), 9));
    world.push(pixelRect(bx - 1 + wiggle, by + 1, 1, 3, fullUv(), rgba(236, 120, 150, 1), 9.1));
    world.push(pixelRect(bx + 1, by + 2 + wiggle, 1, 2, fullUv(), rgba(236, 120, 150, 1), 9.1));
  }
  // 겨눈 자리: 밝은 수면에서도 보이게 어두운 테두리를 두른 ▼와, 수면에서 겨눈 깊이까지 내려가는 점선 안내선.
  if ((phase === "aim" || phase === "charge") && game.pointer) {
    const x = roundHalfAway(phase === "charge" ? fishing.aimX : Math.min(WIDTH - 20, Math.max(20, game.pointer[0])));
    const on = Math.sin(time * 8) > -0.3 ? 1 : 0.55;
    const mark = rgba(255, 236, 120, on);
    const edge = rgba(20, 30, 45, 0.85 * on);
    const top = SURFACE_Y - 11;
    world.push(pixelRect(x - 4, top - 1, 9, 1, fullUv(), edge, 8.9));
    for (let row = 0; row < 4; row += 1) {
      world.push(pixelRect(x - 4 + row, top + row, 9 - row * 2, 1, fullUv(), edge, 8.9));
      world.push(pixelRect(x - 3 + row, top + row, 7 - row * 2, 1, fullUv(), mark, 9));
    }
    world.push(pixelRect(x, top + 4, 1, 1, fullUv(), edge, 8.9));
    const depth = Math.min(FLOOR_Y - 14, Math.max(SURFACE_Y + 8, game.pointer[1]));
    for (let y = SURFACE_Y + 2; y < depth; y += 4) world.push(pixelRect(x, y, 1, 2, fullUv(), rgba(255, 236, 120, 0.45 * on), 8.5));
  }
  frame.layers.push(solids("fishing-line", "alpha", world));

  // 화면에 고정되는 게이지와 글자(아래쪽 가운데).
  const screen = view.shift(0);
  const ui: Sprite[] = [];
  const left = roundHalfAway(screen[0] + WIDTH / 2 - GAUGE_W / 2);
  const top = screen[1] + GAUGE_Y;
  // 게이지·이름·안내 뒤에 반투명 판을 깔아 모래·소품 위에서도 잘 읽히게 한다.
  const hint = hintOf(phase);
  const gauge = phase === "charge" || (phase === "fight" && fishing.profile !== null);
  if (hint || gauge) {
    const panelTop = phase === "fight" ? top - 15 : gauge ? top - 5 : top + 8;
    const panelLeft = roundHalfAway(screen[0] + WIDTH / 2 - PANEL_W / 2);
    ui.push(pixelRect(panelLeft - 1, panelTop - 1, PANEL_W + 2, top + 24 - panelTop + 2, fullUv(), rgba(150, 220, 240, 0.35), 49));
    ui.push(pixelRect(panelLeft, panelTop, PANEL_W, top + 24 - panelTop, fullUv(), rgba(4, 14, 32, 0.62), 49.5));
  }
  if (phase === "charge") {
    // 힘 게이지: 좋은 칸(노랑)과 완벽 칸(초록) 사이에서 떼면 겨눈 곳에 정확히 떨어진다.
    ui.push(pixelRect(left - 1, top - 1, GAUGE_W + 2, 8, fullUv(), rgba(4, 14, 32, 0.85), 50));
    ui.push(pixelRect(left, top, GAUGE_W, 6, fullUv(), rgba(40, 70, 100, 0.9), 51));
    ui.push(pixelRect(left + roundHalfAway((SWEET - GOOD_BAND) * GAUGE_W), top, roundHalfAway(GOOD_BAND * 2 * GAUGE_W), 6, fullUv(), rgba(230, 200, 80, 0.9), 52));
    ui.push(pixelRect(left + roundHalfAway((SWEET - PERFECT_BAND) * GAUGE_W), top, roundHalfAway(PERFECT_BAND * 2 * GAUGE_W), 6, fullUv(), rgba(110, 230, 120, 1), 53));
    const cursor = left + roundHalfAway(meterAt(fishing.timer) * GAUGE_W);
    ui.push(pixelRect(cursor - 1, top - 3, 3, 12, fullUv(), rgba(255, 255, 255, 1), 54));
  }
  if (phase === "fight" && fishing.profile) {
    // 장력 게이지: 빨간 칸에 오래 있으면 끊어진다. 과부하가 쌓이면 테두리가 깜빡인다.
    const tension = Math.min(1.1, fishing.tension);
    const danger = fishing.overload > 0.05 && Math.sin(time * 30) > 0;
    ui.push(pixelRect(left - 1, top - 1, GAUGE_W + 2, 8, fullUv(), danger ? rgba(255, 80, 70, 1) : rgba(4, 14, 32, 0.85), 50));
    ui.push(pixelRect(left, top, GAUGE_W, 6, fullUv(), rgba(40, 70, 100, 0.9), 51));
    ui.push(pixelRect(left + roundHalfAway(TENSION_RED * GAUGE_W), top, GAUGE_W - roundHalfAway(TENSION_RED * GAUGE_W), 6, fullUv(), rgba(200, 50, 50, 0.9), 52));
    const fill = Math.min(GAUGE_W, roundHalfAway((tension / 1.1) * GAUGE_W * 1.1));
    ui.push(pixelRect(left, top + 1, Math.min(GAUGE_W, fill), 4, fullUv(), rgb(tensionColor(tension), 1), 53));
    // 물고기 체력(얇은 띠)과 남은 거리 비율.
    ui.push(pixelRect(left, top + 8, roundHalfAway(GAUGE_W * fishing.stamina), 1, fullUv(), rgba(120, 220, 255, 0.9), 53));
    const actor = fishing.hookedActor(game);
    const name = actor ? game.species[actor.species].nameKo : "";
    const stars = "★".repeat(fishing.profile.stars) + "☆".repeat(5 - fishing.profile.stars);
    label(frame, view, [left - 40, top - 13, GAUGE_W + 80, 11], `${name} ${stars}  ${(Math.max(0, fishing.distance) / 8).toFixed(1)}m`, 9, [226, 246, 255, 255], "center");
  }
  frame.layers.push(solids("fishing-ui", "alpha", ui));
  // 알림(PERFECT!, 당긴다!, 줄이 끊어졌어요! 등)과 단계별 안내.
  const note = fishing.note;
  if (note) {
    const colors: Record<string, Rgba> = { good: [140, 255, 150, 255], bad: [255, 140, 130, 255], warn: [255, 220, 110, 255], info: [226, 246, 255, 255] };
    const alpha = Math.min(1, note.timer * 3);
    const color = colors[note.tone];
    label(frame, view, [screen[0] + WIDTH / 2 - 100, top - 28, 200, 13], note.text, 11, [color[0], color[1], color[2], Math.trunc(255 * alpha)], "center");
  }
  if (hint) label(frame, view, [screen[0] + WIDTH / 2 - PANEL_W / 2, top + 11, PANEL_W, 11], hint, 9, [220, 238, 246, 245], "center");
  // 결과 자막: 화면 위 가운데(사건 자막 자리).
  const result = fishing.result;
  if (result) {
    const text = `${result.text}  ${"★".repeat(result.stars)}`;
    const width = roundHalfAway(textWidth(text) + 24);
    const x = roundHalfAway(screen[0] + (WIDTH - width) / 2);
    const y = screen[1] + 12;
    const alpha = Math.min(1, result.timer * 2);
    frame.layers.push(
      solids("fishing-result", "alpha", [
        pixelRect(x - 1, y - 1, width + 2, 18, fullUv(), rgba(4, 14, 32, 0.9 * alpha), 50),
        pixelRect(x, y, width, 16, fullUv(), rgba(14, 50, 60, 0.9 * alpha), 51),
        pixelRect(x, y, width, 1, fullUv(), rgba(255, 214, 90, alpha), 52),
      ]),
    );
    label(frame, view, [x, y, width, 16], text, 11, [255, 226, 120, Math.trunc(255 * alpha)], "center");
  }
}

/// 단계마다 짧은 안내다(판 폭 안에 들어가게 짧게 쓴다).
function hintOf(phase: string): string | null {
  switch (phase) {
    case "aim":
      return "겨눈 곳을 누르고, 초록 칸에서 떼기";
    case "charge":
      return "초록 칸에서 떼기!";
    case "sink":
      return "탭하면 그 깊이에 멈춰요";
    case "wait":
      return "찌가 푹 잠기면 탭! · 길게 눌러 걷기";
    case "fight":
      return "누르면 감기 · 떼면 풀기 · 빨간 칸 조심";
    default:
      return null;
  }
}
