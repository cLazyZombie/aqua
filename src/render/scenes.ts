// 배경 컨셉(산호초·켈프 숲·난파선·해저 유적·빙하 바다)과 소품 무작위 배치.
// 실행할 때마다 컨셉 하나를 고르고, 배치 시드로 산호·해초·조개 자리를 정한다. 화면 가운데는 비워 둔다.

import scenesJson from "../data/scenes.json";
import type { Rgba } from "./draw";

/// 컨셉마다 먼 층을 물빛에 맞춰 가라앉히는 색이다.
export interface SceneStyle {
  id: string;
  name: string;
  /// 먼 산맥 층 색이다.
  deep: Rgba;
  /// 먼 숲·기둥 층 색이다.
  back: Rgba;
  /// 중간 바위 층 색이다.
  mid: Rgba;
  /// 뒷줄 소품 색이다.
  backProps: Rgba;
  /// 바닥 조개 색이다(뒷줄보다 조금 또렷하다).
  floorProps: Rgba;
  /// 뒷줄·앞줄에 세울 키 큰 풀(다시마·해초) 수다.
  tall: [number, number];
}

export const SCENE_STYLES: Record<string, SceneStyle> = {
  reef: { id: "reef", name: "산호초", deep: [118, 166, 206, 178], back: [96, 146, 176, 158], mid: [190, 215, 235, 255], backProps: [140, 180, 210, 255], floorProps: [200, 222, 238, 255], tall: [2, 2] },
  kelp: { id: "kelp", name: "켈프 숲", deep: [112, 160, 150, 178], back: [84, 134, 116, 158], mid: [205, 222, 205, 255], backProps: [140, 178, 168, 255], floorProps: [200, 222, 212, 255], tall: [4, 3] },
  wreck: { id: "wreck", name: "난파선", deep: [100, 140, 192, 178], back: [72, 112, 152, 158], mid: [178, 202, 228, 255], backProps: [130, 164, 202, 255], floorProps: [192, 212, 232, 255], tall: [2, 2] },
  ruins: { id: "ruins", name: "해저 유적", deep: [110, 170, 170, 178], back: [90, 150, 150, 158], mid: [196, 226, 222, 255], backProps: [140, 186, 186, 255], floorProps: [200, 228, 226, 255], tall: [2, 2] },
  ice: { id: "ice", name: "빙하 바다", deep: [152, 186, 216, 178], back: [130, 170, 200, 158], mid: [212, 230, 245, 255], backProps: [172, 200, 226, 255], floorProps: [214, 230, 244, 255], tall: [1, 2] },
};

/// 굽혀 있는 배경 컨셉 id 목록이다(원본이 모자란 컨셉은 빠진다).
export function availableScenes(): string[] {
  const built = scenesJson as string[];
  return built.filter((id) => SCENE_STYLES[id] !== undefined);
}

/// 요청한 컨셉이 있으면 그것을, 없으면 무작위로 고른다.
export function pickScene(requested: string | null, random: () => number): string {
  const scenes = availableScenes();
  if (requested && scenes.includes(requested)) return requested;
  return scenes[Math.floor(random() * scenes.length) % scenes.length] ?? "reef";
}

/// 배치에 필요한 소품 정보다.
export interface PropInfo {
  w: number;
  h: number;
  frames: number;
  kind: string;
  scenes: string[];
}

/// 소품 하나의 자리다. back은 뒷줄(물빛으로 가라앉힘), front는 앞줄(선명), floor는 바닥에 놓인 조개다.
export interface Placement {
  prop: number;
  x: number;
  row: "back" | "front" | "floor";
  flip: boolean;
  /// 흔들림·여닫힘 박자를 개체마다 어긋나게 하는 값(0..1)이다.
  phase: number;
}

/// 배치 전용 난수(mulberry32)다. 시뮬레이션 난수와 섞이지 않는다.
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/// 구간들 안에서 서로 `gap` 이상 떨어진 x를 `count`개 고른다.
function spots(random: () => number, count: number, zones: [number, number][], gap: number): number[] {
  const total = zones.reduce((sum, [a, b]) => sum + (b - a), 0);
  const out: number[] = [];
  for (let attempt = 0; attempt < 400 && out.length < count; attempt++) {
    let roll = random() * total;
    let x = zones[0][0];
    for (const [a, b] of zones) {
      if (roll <= b - a) {
        x = a + roll;
        break;
      }
      roll -= b - a;
    }
    if (out.every((other) => Math.abs(other - x) >= gap)) out.push(Math.round(x));
  }
  return out;
}

/// Fisher–Yates로 섞은 사본이다. 비교 함수 정렬로 섞으면 JS 엔진마다 결과가 달라 배치 시드가 어긋난다.
function shuffled(random: () => number, items: number[]): number[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/// 목록에서 되도록 겹치지 않게 차례로 뽑는다(다 쓰면 다시 섞는다).
function drawer(random: () => number, items: number[]): () => number {
  let bag: number[] = [];
  return () => {
    if (bag.length === 0) bag = shuffled(random, items);
    return bag.pop() ?? items[0];
  };
}

/// 컨셉에 맞는 소품을 뒷줄·앞줄·바닥에 흩어 놓는다. 키 큰 풀은 바깥쪽에, 가운데(175~305)는 비운다.
export function makeLayout(props: PropInfo[], scene: string, seed: number): Placement[] {
  const random = seededRandom(seed);
  const style = SCENE_STYLES[scene] ?? SCENE_STYLES.reef;
  const pool = props.map((prop, index) => ({ prop, index })).filter(({ prop }) => prop.scenes.includes(scene));
  const tall = pool.filter(({ prop }) => prop.kind === "tall").map(({ index }) => index);
  const small = pool.filter(({ prop }) => prop.kind === "prop").map(({ index }) => index);
  const clams = pool.filter(({ prop }) => prop.kind === "clam").map(({ index }) => index);
  const placements: Placement[] = [];
  const row = (kind: "back" | "front", zones: [number, number][], count: number, tallCount: number, gap: number) => {
    const xs = spots(random, count, zones, gap);
    // 가운데에서 먼 자리부터 키 큰 풀을 세운다.
    xs.sort((a, b) => Math.abs(b - 240) - Math.abs(a - 240));
    const nextTall = drawer(random, tall);
    const nextSmall = drawer(random, small);
    xs.forEach((x, slot) => {
      const useTall = slot < tallCount && tall.length > 0;
      const prop = useTall ? nextTall() : small.length > 0 ? nextSmall() : nextTall();
      placements.push({ prop, x, row: kind, flip: random() < 0.5, phase: random() });
    });
  };
  row("back", [
    [12, 172],
    [308, 468],
  ], 8, style.tall[0], 20);
  row("front", [
    [0, 116],
    [364, 480],
  ], 7, style.tall[1], 22);
  if (clams.length > 0) {
    const nextClam = drawer(random, clams);
    const count = 2 + Math.floor(random() * 3);
    for (const x of spots(random, count, [
      [34, 178],
      [302, 446],
    ], 30)) {
      placements.push({ prop: nextClam(), x, row: "floor", flip: random() < 0.5, phase: random() });
    }
  }
  return placements;
}
