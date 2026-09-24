// 게임에 등장하는 종의 스프라이트 시트와 행동 규칙이다.
// 시트는 오른쪽을 바라보는 `frames`개의 프레임을 가로로 이어 붙인 것이다.

// scripts/build_sprites.py가 굽는 목록이다. 그림은 public/assets/species에 있다.
import catalogJson from "../data/catalog.json";
import visitorsJson from "../data/visitors.json";

/** 같은 프레임 수를 가진 대체 시트다. puff는 부푼 복어, pose는 교감 자세(집게 들기·진주 보이기)다. */
export interface AltSheet {
  texture: string;
  frameW: number;
  frameH: number;
  kind: "puff" | "pose";
}

export interface Species {
  id: string;
  nameEn: string;
  nameKo: string;
  motion: string;
  activity: string;
  frameW: number;
  frameH: number;
  frames: number;
  texture: string;
  /** 조명 셰이더가 읽는 노멀 시트다. */
  normal: string;
  glow: boolean;
  glowTexture: string | null;
  glowCenter: [number, number] | null;
  /** 상황에 따라 바꿔 그리는 다른 모습(부푼 복어)이다. */
  alt: AltSheet | null;
  /** 사건 때만 등장하는 방문자(고래상어·잠수부 등)다. 평소 등장 순환에서 뺀다. */
  visitor: boolean;
  /** 이벤트가 등장시킬 생물을 고를 때 쓰는 무리 이름이다. */
  group: string;
}

interface RawAlt {
  texture?: string;
  frame_w: number;
  frame_h: number;
  kind?: string;
}

interface RawSpecies {
  id: string;
  name_en: string;
  name_ko: string;
  motion: string;
  activity: string;
  frame_w: number;
  frame_h: number;
  frames: number;
  texture: string;
  normal?: string;
  glow: boolean;
  glow_texture?: string | null;
  glow_center?: [number, number] | null;
  alt?: RawAlt | null;
  visitor?: boolean;
  group?: string;
}

function convert(raw: RawSpecies): Species {
  return {
    id: raw.id,
    nameEn: raw.name_en,
    nameKo: raw.name_ko,
    motion: raw.motion,
    activity: raw.activity,
    frameW: raw.frame_w,
    frameH: raw.frame_h,
    frames: raw.frames,
    texture: raw.texture,
    normal: raw.normal ?? "",
    glow: raw.glow,
    glowTexture: raw.glow_texture ?? null,
    glowCenter: raw.glow_center ? [raw.glow_center[0], raw.glow_center[1]] : null,
    alt: raw.alt
      ? {
          texture: raw.alt.texture ?? "",
          frameW: raw.alt.frame_w,
          frameH: raw.alt.frame_h,
          kind: raw.alt.kind === "pose" ? "pose" : "puff",
        }
      : null,
    visitor: raw.visitor ?? false,
    group: raw.group ?? "",
  };
}

/** 좌우로 헤엄치며 진행 방향을 바라보는 종인지 알려 준다. */
export function faceTravel(species: Species): boolean {
  return !["jelly", "octopus", "crawl", "sessile"].includes(species.motion);
}

/** `faceTravel`의 별칭이다. */
export const facesTravel = faceTravel;

/** 중간에 휙 돌아서면 어색한 큰 생물인지 알려 준다. 사건 연출이 아니면 가던 방향을 끝까지 유지한다. */
export function bigBody(species: Species): boolean {
  return faceTravel(species) && (["giant", "flap", "glide"].includes(species.motion) || species.frameW >= 50);
}

/** 바닥에서 걷거나 붙어 지내는 종인지 알려 준다. */
export function grounded(species: Species): boolean {
  return ["crawl", "creep", "sessile"].includes(species.motion);
}

/** 도감 종 목록이다. 중복 id, 애니메이션 없는 종, 발광 텍스처 불일치는 에러다. */
export function loadCatalog(): Species[] {
  const species = (catalogJson as unknown as RawSpecies[]).map(convert);
  if (species.length < 20) {
    throw new Error("catalog must hold at least the 20 starter species");
  }
  const ids = new Set<string>();
  for (const entry of species) {
    if (ids.has(entry.id)) throw new Error(`duplicate species id: ${entry.id}`);
    ids.add(entry.id);
    if (entry.frames < 2) throw new Error(`species needs animation: ${entry.id}`);
    if (entry.glow !== (entry.glowTexture !== null)) {
      throw new Error(`glow texture mismatch: ${entry.id}`);
    }
  }
  return species;
}

/** 도감 종 뒤에 사건 전용 방문자(`visitors.json`)를 붙인 전체 목록이다. */
export function loadAll(): Species[] {
  const species = loadCatalog();
  const visitors = (visitorsJson as unknown as RawSpecies[]).map(convert);
  if (!visitors.every((entry) => entry.visitor)) {
    throw new Error("visitors.json entries must be marked as visitors");
  }
  return species.concat(visitors);
}
