// 한 frame의 그리기 입력(Frame)을 만든다.

import * as ambient from "./ambient";
import type { SceneAssets } from "./assets";
import * as backdrop from "./backdrop";
import * as creatures from "./creatures";
import type { Camera, Frame } from "./draw";
import { roundHalfAway, worldToScreen } from "./draw";
import * as events from "./events";
import * as interact from "./interact";
import * as litter from "./litter";
import * as fishing from "./fishing";
import * as setpieces from "./setpieces";
import * as overlay from "./overlay";
import { type Aquarium, HEIGHT, VIEW_WIDTH, WIDTH } from "./simapi";

/// 한 frame의 카메라와 패럴랙스 기준이다.
export class View {
  constructor(
    readonly camera: Camera,
    /// 카메라가 떠돈 정수 픽셀 거리다.
    readonly offset: [number, number],
    readonly zoom: number,
    readonly viewport: [number, number],
  ) {}

  /// 패럴랙스 계수 `factor`(1이면 월드와 같이, 0이면 화면에 고정)인 층을 그릴 때 더할 월드 좌표 이동량이다.
  shift(factor: number): [number, number] {
    return [roundHalfAway(this.offset[0] * (1 - factor)), roundHalfAway(this.offset[1] * (1 - factor))];
  }

  toScreen(x: number, y: number): [number, number] {
    return worldToScreen(this.camera, x, y);
  }
}

/// 창을 보이는 월드(588x270, 휴대폰 가로 화면 비율)로 덮는 배율이다. 넘치는 쪽은 잘라 낸다(16:9 창은 양옆 여백이 잘린다).
/// `integer`면 정수배로 올린다.
export function pixelZoom(viewport: [number, number], integer: boolean): number {
  const cover = Math.max(0.1, Math.max(viewport[0] / VIEW_WIDTH, viewport[1] / HEIGHT));
  return integer ? Math.ceil(cover) : cover;
}

/// 이 창에 보이는 월드 가로 범위다(무대 가운데 기준). 16:9 창은 0..480, 휴대폰 가로 화면은 약 -54..534다.
export function visibleRange(viewport: [number, number], integer: boolean): [number, number] {
  const half = viewport[0] / (2 * pixelZoom(viewport, integer));
  return [WIDTH / 2 - half, WIDTH / 2 + half];
}

/// 창의 논리 좌표를 현재 카메라 기준 월드 좌표로 바꾼다.
export function screenToWorld(game: Aquarium, viewport: [number, number], screen: [number, number]): [number, number] {
  const [ox, oy] = game.cameraOffset();
  const zoom = pixelZoom(viewport, game.look.integer);
  const cx = WIDTH * 0.5 + ox;
  const cy = HEIGHT * 0.5 + oy;
  return [(screen[0] - viewport[0] * 0.5) / zoom + cx, (screen[1] - viewport[1] * 0.5) / zoom + cy];
}

export function buildFrame(game: Aquarium, assets: SceneAssets, viewport: [number, number]): Frame {
  const zoom = pixelZoom(viewport, game.look.integer);
  const [ox, oy] = game.cameraOffset();
  const camera: Camera = { cx: WIDTH * 0.5 + ox, cy: HEIGHT * 0.5 + oy, viewportW: viewport[0], viewportH: viewport[1], zoom };
  const view = new View(camera, [ox, oy], zoom, viewport);
  const sun = (0.25 + 0.75 * game.daylight()) * (1 - 0.6 * game.weather.strength);
  // 조명 셰이더 계약: xy 방향의 길이가 1을 넘는 만큼이 황금빛 아침 세기다.
  const len = Math.hypot(-0.35, -0.9);
  const k = (1 + game.golden) / len;
  const frame: Frame = {
    camera,
    layers: [],
    bloomLayers: [],
    alphaMaskBloomLayers: [],
    post: [],
    texts: [],
    dirLight: [-0.35 * k, -0.9 * k, sun],
    time: game.time,
  };
  backdrop.appendBack(frame, view, game, assets);
  ambient.appendClouds(frame, game);
  ambient.appendPrints(frame, game);
  ambient.appendSky(frame, view, game);
  ambient.appendReflections(frame, view, game, assets);
  events.appendFar(frame, view, game, assets);
  creatures.appendFar(frame, game, assets);
  backdrop.appendBackProps(frame, view, game, assets);
  backdrop.appendClams(frame, game, assets);
  setpieces.appendSetPieces(frame, game, assets);
  litter.appendLitter(frame, game, assets);
  backdrop.appendRays(frame, game, assets);
  events.appendObjects(frame, game, assets);
  creatures.appendNear(frame, game, assets);
  ambient.appendMarks(frame, game, assets);
  ambient.appendMarineSnow(frame, game);
  backdrop.appendFront(frame, game, assets);
  events.appendCurrent(frame, game);
  creatures.appendGlow(frame, game, assets);
  ambient.appendSilverGlints(frame, game);
  ambient.appendFloorGlow(frame, game, assets);
  events.appendLights(frame, game, assets);
  overlay.appendScreen(frame, view, game, assets);
  events.appendPhoto(frame, view, game, assets);
  interact.appendHover(frame, view, game, assets);
  fishing.appendFishing(frame, view, game);
  overlay.appendPost(frame, view, game);
  overlay.appendUi(frame, view, game);
  return frame;
}
