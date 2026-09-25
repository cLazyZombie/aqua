// SceneAssets: 장면이 쓰는 모든 텍스처를 미리 읽는다.

import * as THREE from "three";

import propsJson from "../data/props.json";
import eventsJson from "../data/events.json";
import type { Species } from "../sim/catalog";
import { type Placement, type SceneStyle, SCENE_STYLES, makeLayout } from "./scenes";

interface SheetJson {
  texture: string;
  w: number;
  h: number;
  frames: number;
  kind?: string;
  scenes?: string[];
}

export interface Sheet {
  texture: THREE.Texture;
  w: number;
  h: number;
  frames: number;
}

export interface Prop {
  texture: THREE.Texture;
  w: number;
  h: number;
  frames: number;
  /// tall(키 큰 풀), prop(산호·바위 등), clam(여닫는 조개)이다.
  kind: string;
  /// 어울리는 배경 컨셉이다.
  scenes: string[];
  /// 파일 이름(확장자 없음)이다. 진주조개처럼 따로 연출하는 소품을 알아본다.
  name: string;
}

/// 지금 배경 컨셉의 층 텍스처와 색, 소품 배치다.
export interface SceneLayers {
  style: SceneStyle;
  far: THREE.Texture;
  deep: THREE.Texture;
  back: THREE.Texture;
  mid: THREE.Texture;
  floor: THREE.Texture;
  /// 그 바닥 모양으로 가린 물결 빛(8프레임)이다.
  caustics: THREE.Texture;
  layout: Placement[];
}

/// 조명 머티리얼(색·노멀), 먼 층용 색 시트, 발광 마스크, 대체 모습을 함께 든 한 종의 그림이다.
export interface SpeciesArt {
  texture: THREE.Texture;
  normal: THREE.Texture;
  glow: THREE.Texture | null;
  alt: { texture: THREE.Texture; normal: THREE.Texture; w: number; h: number } | null;
}

export interface SceneAssets {
  scene: SceneLayers;
  rays: THREE.Texture;
  surface: THREE.Texture;
  bubbles: THREE.Texture;
  vignette: THREE.Texture;
  haze: THREE.Texture;
  skylight: THREE.Texture;
  shadow: THREE.Texture;
  cone: THREE.Texture;
  spot: THREE.Texture;
  whale: Sheet;
  squid: Sheet;
  submarine: Sheet;
  anchor: Sheet;
  chestClosed: Sheet;
  chestOpen: Sheet;
  bottle: Sheet;
  basket: Sheet;
  shell: Sheet;
  duck: Sheet;
  props: Prop[];
  species: SpeciesArt[];
}

/// 픽셀 아트 텍스처: 원본 바이트 그대로(색공간 변환·premultiply 없이), 첫 행이 v=0, 최근접 샘플링이다.
async function loadTexture(path: string): Promise<THREE.Texture> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`failed to load ${path}: ${response.status}`);
  const bitmap = await createImageBitmap(await response.blob(), {
    premultiplyAlpha: "none",
    colorSpaceConversion: "none",
    imageOrientation: "none",
  });
  const texture = new THREE.Texture(bitmap);
  texture.flipY = false;
  texture.premultiplyAlpha = false;
  texture.generateMipmaps = false;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/// 같은 경로를 한 번만 읽는다.
class TextureCache {
  private readonly entries = new Map<string, Promise<THREE.Texture>>();
  constructor(private readonly root: string) {}

  get(path: string): Promise<THREE.Texture> {
    let entry = this.entries.get(path);
    if (!entry) {
      entry = loadTexture(this.root + path);
      this.entries.set(path, entry);
    }
    return entry;
  }
}

/// `assets/species/x.png`의 노멀 시트 경로(`x-normal.png`)다.
function normalPath(texture: string): string {
  return texture.replace(/\.png$/, "-normal.png");
}

const shared = new Map<string, TextureCache>();

/// 배경 컨셉 하나의 층 텍스처를 읽고 소품 배치를 만든다. 실행 중에 컨셉을 바꿀 때도 쓴다.
export async function loadScene(id: string, props: Prop[], layoutSeed: number, root = "./"): Promise<SceneLayers> {
  let cache = shared.get(root);
  if (!cache) {
    cache = new TextureCache(root);
    shared.set(root, cache);
  }
  const layer = (name: string) => cache.get(`assets/fx/scene-${id}-${name}.png`);
  const [far, deep, back, mid, floor, caustics] = await Promise.all(["far", "deep", "back", "mid", "floor", "caustics"].map(layer));
  return { style: SCENE_STYLES[id] ?? SCENE_STYLES.reef, far, deep, back, mid, floor, caustics, layout: makeLayout(props, id, layoutSeed) };
}

export async function loadSceneAssets(catalog: Species[], sceneId: string, layoutSeed: number, root = "./"): Promise<SceneAssets> {
  let cache = shared.get(root);
  if (!cache) {
    cache = new TextureCache(root);
    shared.set(root, cache);
  }
  const fx = (name: string) => cache.get(`assets/fx/${name}.png`);
  const sheets = eventsJson as Record<string, SheetJson>;
  const sheet = async (name: string, fallback: SheetJson): Promise<Sheet> => {
    const entry = sheets[name] ?? fallback;
    return { texture: await cache.get(entry.texture), w: entry.w, h: entry.h, frames: Math.max(1, entry.frames) };
  };
  const props = Promise.all(
    (propsJson as SheetJson[]).map(async (entry) => ({
      texture: await cache.get(entry.texture),
      w: entry.w,
      h: entry.h,
      frames: Math.max(1, entry.frames),
      kind: entry.kind ?? "prop",
      scenes: entry.scenes ?? [],
      name: entry.texture.split("/").pop()?.replace(/\.png$/, "") ?? "",
    })),
  );
  const species = Promise.all(
    catalog.map(async (entry): Promise<SpeciesArt> => {
      const alt = entry.alt
        ? {
            texture: await cache.get(entry.alt.texture),
            normal: await cache.get(normalPath(entry.alt.texture)),
            w: entry.alt.frameW,
            h: entry.alt.frameH,
          }
        : null;
      return {
        texture: await cache.get(entry.texture),
        normal: await cache.get(entry.normal ?? normalPath(entry.texture)),
        glow: entry.glowTexture ? await cache.get(entry.glowTexture) : null,
        alt,
      };
    }),
  );
  const [rays, surface, bubbles, vignette, haze, skylight, shadow, cone, spot] = await Promise.all(
    ["rays", "surface", "bubbles", "vignette", "haze", "skylight", "shadow", "cone", "spot"].map(fx),
  );
  const loadedProps = await props;
  return {
    scene: await loadScene(sceneId, loadedProps, layoutSeed, root),
    rays,
    surface,
    bubbles,
    vignette,
    haze,
    skylight,
    shadow,
    cone,
    spot,
    whale: { texture: await fx("whale"), w: 196, h: 81, frames: 8 },
    squid: await sheet("giant-squid", { texture: "assets/fx/giant-squid.png", w: 156, h: 53, frames: 6 }),
    submarine: await sheet("submarine", { texture: "assets/fx/submarine.png", w: 76, h: 51, frames: 2 }),
    anchor: await sheet("anchor", { texture: "assets/fx/anchor.png", w: 36, h: 43, frames: 1 }),
    chestClosed: await sheet("chest-closed", { texture: "assets/fx/chest-closed.png", w: 36, h: 29, frames: 1 }),
    chestOpen: await sheet("chest-open", { texture: "assets/fx/chest-open.png", w: 36, h: 36, frames: 1 }),
    bottle: await sheet("bottle", { texture: "assets/fx/bottle.png", w: 30, h: 21, frames: 1 }),
    basket: await sheet("basket", { texture: "assets/fx/basket.png", w: 20, h: 24, frames: 1 }),
    shell: await sheet("shell", { texture: "assets/fx/shell.png", w: 18, h: 14, frames: 1 }),
    duck: await sheet("duck", { texture: "assets/fx/duck.png", w: 16, h: 14, frames: 1 }),
    props: loadedProps,
    species: await species,
  };
}
