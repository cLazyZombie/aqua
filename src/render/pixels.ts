// 스프라이트 시트 픽셀을 CPU에서 읽는다: 마우스 판정용 알파, 호버 테두리 texture, 발광 대표색.
// 처음 쓸 때 한 번만 읽고 texture마다 기억한다.

import * as THREE from "three";

interface Pixels {
  w: number;
  h: number;
  rgba: Uint8ClampedArray;
}

const cache = new WeakMap<THREE.Texture, Pixels>();
const outlines = new WeakMap<THREE.Texture, THREE.Texture>();
const colors = new WeakMap<THREE.Texture, [number, number, number]>();
const areas = new WeakMap<THREE.Texture, number>();

/// texture 원본(ImageBitmap)의 RGBA 바이트다. 읽을 수 없으면 null이다.
export function pixelsOf(texture: THREE.Texture): Pixels | null {
  const known = cache.get(texture);
  if (known) return known;
  const image = texture.image as ImageBitmap | undefined;
  if (!image || !image.width || typeof OffscreenCanvas === "undefined") return null;
  const canvas = new OffscreenCanvas(image.width, image.height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(image, 0, 0);
  const data = context.getImageData(0, 0, image.width, image.height).data;
  const pixels = { w: image.width, h: image.height, rgba: data };
  cache.set(texture, pixels);
  return pixels;
}

/// 시트 (x, y) 픽셀이 몸인지(알파가 절반 이상인지) 알려 준다. 범위 밖은 빈 곳이다.
export function solidAt(pixels: Pixels, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= pixels.w || y >= pixels.h) return false;
  return pixels.rgba[(y * pixels.w + x) * 4 + 3] >= 128;
}

/// 몸 바깥 한 픽셀 둘레만 칠한 호버 테두리 texture다. 프레임 칸(`cellW`)을 넘어 이웃 프레임을 읽지 않는다.
export function outlineOf(texture: THREE.Texture, cellW: number): THREE.Texture | null {
  const known = outlines.get(texture);
  if (known) return known;
  const pixels = pixelsOf(texture);
  if (!pixels) return null;
  const { w, h } = pixels;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (solidAt(pixels, x, y)) continue;
      const cell = Math.floor(x / cellW);
      const inCell = (nx: number) => Math.floor(nx / cellW) === cell;
      const edge =
        (inCell(x - 1) && solidAt(pixels, x - 1, y)) ||
        (inCell(x + 1) && solidAt(pixels, x + 1, y)) ||
        solidAt(pixels, x, y - 1) ||
        solidAt(pixels, x, y + 1);
      if (!edge) continue;
      const at = (y * w + x) * 4;
      data[at] = 255;
      data[at + 1] = 255;
      data[at + 2] = 255;
      data[at + 3] = 255;
    }
  }
  const outline = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  outline.flipY = false;
  outline.magFilter = THREE.NearestFilter;
  outline.minFilter = THREE.NearestFilter;
  outline.generateMipmaps = false;
  outline.colorSpace = THREE.NoColorSpace;
  outline.needsUpdate = true;
  outlines.set(texture, outline);
  return outline;
}

/// 발광 시트 첫 프레임에서 빛나는 픽셀의 평균 색이다. 둥근 빛 고리 색으로 쓴다.
export function glowColorOf(texture: THREE.Texture, cellW: number, fallback: [number, number, number]): [number, number, number] {
  const known = colors.get(texture);
  if (known) return known;
  const pixels = pixelsOf(texture);
  if (!pixels) return fallback;
  let sum = [0, 0, 0];
  let weight = 0;
  for (let y = 0; y < pixels.h; y++) {
    for (let x = 0; x < Math.min(cellW, pixels.w); x++) {
      const at = (y * pixels.w + x) * 4;
      const a = pixels.rgba[at + 3] / 255;
      if (a < 0.2) continue;
      sum = [sum[0] + pixels.rgba[at] * a, sum[1] + pixels.rgba[at + 1] * a, sum[2] + pixels.rgba[at + 2] * a];
      weight += a;
    }
  }
  if (weight === 0) return fallback;
  // 평균은 탁해지기 쉬우므로 가장 밝은 채널이 255가 되도록 끌어올린다.
  const mean = sum.map((v) => v / weight);
  const peak = Math.max(1, ...mean);
  const color: [number, number, number] = [mean[0] / peak * 255, mean[1] / peak * 255, mean[2] / peak * 255];
  colors.set(texture, color);
  return color;
}

/// 발광 시트 첫 프레임에서 빛나는 픽셀 수다. 루어·발광점은 작고, 몸 전체가 빛나는 해파리는 크다.
export function glowAreaOf(texture: THREE.Texture, cellW: number): number {
  const known = areas.get(texture);
  if (known !== undefined) return known;
  const pixels = pixelsOf(texture);
  if (!pixels) return 1;
  let count = 0;
  for (let y = 0; y < pixels.h; y++) {
    for (let x = 0; x < Math.min(cellW, pixels.w); x++) {
      if (pixels.rgba[(y * pixels.w + x) * 4 + 3] >= 51) count++;
    }
  }
  const area = Math.max(1, count);
  areas.set(texture, area);
  return area;
}
