// 그리기 입력 타입(스프라이트·레이어·frame)과 도우미다.
// 좌표는 월드(480x270) 기준이고, 렌더러가 Camera2d 식으로 화면 좌표로 바꾼다.

import type * as THREE from "three";

export type Rgba = [number, number, number, number]; // 0..255
export type Uv = [number, number, number, number]; // u0, v0, u1, v1

export type Shape = { kind: "quad" } | { kind: "ellipse"; segments: number };

export interface Sprite {
  cx: number;
  cy: number;
  w: number;
  h: number;
  rotation: number;
  shape: Shape;
  uv: Uv;
  color: Rgba;
  order: number;
}

export type BlendMode = "alpha" | "additive" | "multiply";

/// 조명 머티리얼은 색 시트와 노멀 시트를 함께 쓴다. silhouette는 texture 알파 모양을 정점 색으로 칠한다.
export type Material =
  | { kind: "solid" }
  | { kind: "texture"; texture: THREE.Texture }
  | { kind: "silhouette"; texture: THREE.Texture }
  /** 물속 일렁임으로 밀어 읽는 배경 층(amplitude는 흔들림 폭, 텍셀)이다. */
  | { kind: "wavy"; texture: THREE.Texture; amplitude: number }
  | { kind: "lit"; texture: THREE.Texture; normal: THREE.Texture; variant?: number };

export interface Layer {
  id: string;
  material: Material;
  blend: BlendMode;
  sprites: Sprite[];
}

/// HDR bloom source에만 그리는 단색 layer(`Sprite2dBloomLayer`).
export interface BloomLayer {
  sprites: Sprite[];
  intensity: number;
}

/// texture alpha 모양으로 bloom source에 그리는 layer(`Sprite2dAlphaMaskBloomLayer`).
export interface AlphaMaskBloomLayer {
  texture: THREE.Texture;
  sprites: Sprite[];
  intensity: number;
}

export interface BloomSettings {
  intensity: number;
  threshold: number;
  softKnee: number;
  radius: number;
}

/// 화면 효과 uniform(`ScreenPostEffect`)이다.
export interface ScreenPost {
  kind: "pulse" | "underwater";
  centerUv: [number, number];
  direction: [number, number];
  progress: number;
  radiusUv: number;
  aspect: number;
  intensity: number;
  bandWidth: number;
  offsetStrength: number;
  edgeOpacity: number;
  desaturation: number;
}

export type PostEffect = { kind: "bloom-hdr"; settings: BloomSettings } | { kind: "bloom-frame"; settings: BloomSettings } | { kind: "screen"; effect: ScreenPost };

export interface TextItem {
  /// 창 논리 좌표의 상자다.
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  fontSize: number;
  bold: boolean;
  color: Rgba;
  shadow: { color: Rgba; dx: number; dy: number } | null;
  align: "left" | "center";
}

export interface Camera {
  cx: number;
  cy: number;
  viewportW: number;
  viewportH: number;
  zoom: number;
}

export function worldToScreen(camera: Camera, x: number, y: number): [number, number] {
  return [(x - camera.cx) * camera.zoom + camera.viewportW * 0.5, (y - camera.cy) * camera.zoom + camera.viewportH * 0.5];
}

export function screenToWorld(camera: Camera, x: number, y: number): [number, number] {
  return [(x - camera.viewportW * 0.5) / camera.zoom + camera.cx, (y - camera.viewportH * 0.5) / camera.zoom + camera.cy];
}

export interface Frame {
  camera: Camera;
  layers: Layer[];
  bloomLayers: BloomLayer[];
  alphaMaskBloomLayers: AlphaMaskBloomLayer[];
  post: PostEffect[];
  texts: TextItem[];
  /// 조명 셰이더의 `dir_light`(해 방향 xy, 햇빛 세기 z)다.
  dirLight: [number, number, number];
  time: number;
}

// ---------------------------------------------------------------------------
// 장면 도우미

/// f32 연산으로 해시를 내 기준 기록과 같은 값을 만든다.
const f = Math.fround;
const HASH_MUL = f(12.9898);
const HASH_SCALE = f(43758.547);

export function hash(seed: number): number {
  const s = f(Math.sin(f(f(seed) * HASH_MUL)));
  const v = f(s * HASH_SCALE);
  return Math.abs(f(v - Math.trunc(v)));
}

export function cellUv(index: number, count: number, flip: boolean): Uv {
  const u0 = index / count;
  const u1 = (index + 1) / count;
  return flip ? [u1, 1, u0, 0] : [u0, 1, u1, 0];
}

export function fullUv(): Uv {
  return cellUv(0, 1, false);
}

/// 0.5는 0에서 먼 쪽으로 반올림한다(JS `Math.round`는 음수에서 다르다).
export function roundHalfAway(v: number): number {
  return v < 0 ? -Math.round(-v) : Math.round(v);
}

/// 왼쪽 위 모서리와 크기를 정수 픽셀에 맞춰 스프라이트를 만든다.
export function pixelRect(left: number, top: number, w: number, h: number, uv: Uv, color: Rgba, order: number): Sprite {
  const l = roundHalfAway(left);
  const t = roundHalfAway(top);
  return { cx: l + w * 0.5, cy: t + h * 0.5, w, h, rotation: 0, shape: { kind: "quad" }, uv, color, order };
}

/// 중심 좌표를 받아 픽셀 격자에 맞춘다.
export function pixelSprite(x: number, y: number, w: number, h: number, uv: Uv, color: Rgba, order: number): Sprite {
  return pixelRect(x - w * 0.5, y - h * 0.5, w, h, uv, color, order);
}

export function textured(id: string, texture: THREE.Texture, blend: BlendMode, sprites: Sprite[]): Layer {
  return { id, material: { kind: "texture", texture }, blend, sprites };
}

export function solids(id: string, blend: BlendMode, sprites: Sprite[]): Layer {
  return { id, material: { kind: "solid" }, blend, sprites };
}

/// `(a.clamp(0,1) * 255) as u8` 처럼 알파를 잘라 정수로 만든다.
export function rgba(r: number, g: number, b: number, a: number): Rgba {
  return [r, g, b, Math.trunc(clamp01(a) * 255)];
}

export function rgb(color: [number, number, number], a: number): Rgba {
  return rgba(toU8(color[0]), toU8(color[1]), toU8(color[2]), a);
}

/// 0 쪽으로 자르고 0..255로 포화한 바이트다.
export function toU8(v: number): number {
  if (!(v > 0)) return 0;
  return Math.min(255, Math.trunc(v));
}

export function clamp01(v: number): number {
  return Math.min(1, Math.max(0, Number.isNaN(v) ? 0 : v));
}

export function mix(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export const WHITE: Rgba = [255, 255, 255, 255];

/// 늘 0 이상인 나머지다.
export function remEuclid(a: number, b: number): number {
  const r = a % b;
  return r < 0 ? r + Math.abs(b) : r;
}

/// 소수부(0 쪽으로 자른 나머지)다.
export function fract(v: number): number {
  return v - Math.trunc(v);
}
