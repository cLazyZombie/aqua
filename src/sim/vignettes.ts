// 사건 2부: 짧은 장면 31종(야간 만타 캠프파이어, 흰고래 거품 고리, 배경 컨셉 전용 장면, 해녀·다이버·인어공주 장면 등).
// 사건 감독(director.ts)이 조건·쿨다운·자막을 맡고, 여기서는 정의·등장 생물·진행만 다룬다.
// 생물을 없애거나 해치지 않는다. 숨는 장면은 굴·모래 속으로 들어갔다 다시 나온다.

import type { Aquarium } from "./aquarium";
import { FLOOR_Y, TAU, WIDTH, offstage, visible } from "./constants";
import {
  type Active,
  actorById,
  cast,
  castIndex,
  Debris,
  edgeFacing,
  floorY,
  gather,
  goto,
  groupPool,
  pick,
  setScript,
} from "./director";
import { Particle } from "./life";
import { startMood } from "./mood";
import { f32, retain } from "./num";

/** 사건이 잠깐 무대에 올리는 것들이다. 시뮬레이션이 값을 바꾸고 그리는 쪽이 읽는다. */
export class SetPiece {
  /** 잠수부가 모래에 세운 빛기둥(만타 캠프파이어)이다. */
  beam: { x: number; strength: number } | null = null;
  /** 돌고래가 주고받는 해초 잎이다. holder가 null이면 떠 있다. */
  toy: { x: number; y: number; holder: number | null; last: number } | null = null;
  /** 진주가 빛나는 밤의 세기(0..1)다. 바닥 조개가 모두 열린다. */
  pearls = 0;
  /** 문어가 옮기는 조개껍데기다. */
  trinkets: { x: number; y: number; carrier: number | null; seed: number }[] = [];
  /** 망둑·딱총새우 굴 자리다. */
  burrow: { x: number } | null = null;
  /** 켈프 숲 햇살 커튼 세기다. */
  sunflecks = 0;
  /** 난파선 선체 속 금빛 세기다. */
  wreckGlow = 0;
  /** 해저 유적 룬 진행도(0..1)와 세기다. */
  runes = 0;
  runeStrength = 0;
  /** 빙하 바다 오로라 세기다. */
  aurora = 0;
  /** 수면을 떠가는 고무 오리들이다. */
  floaters: { x: number; facing: number; speed: number; phase: number }[] = [];
  /** 흰동가리 알 무더기(부화 진행도 0..1)다. */
  nest: { x: number; y: number; hatch: number } | null = null;
  /** 소라게들이 차례로 들어가는 빈 소라 껍데기와 크기 배율이다. */
  shell: { x: number; y: number; scale: number } | null = null;
  /** 다이버가 심은 산호(자라는 정도 0..1)다. 이번 실행 동안 남는다. */
  planted: { x: number; grow: number }[] = [];
}

export const EXTRA_KINDS = [
  "MantaCampfire",
  "BelugaRings",
  "SeahorseBirth",
  "CuttleShow",
  "FlyingFishLeap",
  "DolphinKelp",
  "OtterRaft",
  "PearlNight",
  "OctopusGarden",
  "GobyShrimp",
  "SilverMigration",
  "SunFlecks",
  "UrchinMarch",
  "WreckGold",
  "RuneGlow",
  "Aurora",
  "IceDrop",
  "ShellSwap",
  "PenguinDive",
  "ClownEggs",
  "Fireworks",
  "DuckFlotilla",
  "HaenyeoDive",
  "SumbiChorus",
  "HaenyeoDolphins",
  "CoralPlanting",
  "TurtleBuddy",
  "DiverRings",
  "MermaidSong",
  "MermaidRing",
  "MermaidPearl",
] as const;

export type ExtraKind = (typeof EXTRA_KINDS)[number];

type Rarity = "Common" | "Rare" | "Legendary";
type When = "Any" | "Day" | "Night" | "Dawn";

interface Info {
  id: string;
  title: string;
  duration: number;
  rarity: Rarity;
  when: When;
  /** 이 배경 컨셉에서만 일어난다(없으면 어디서나). */
  scenes?: string[];
}

const INFO: Record<ExtraKind, Info> = {
  MantaCampfire: { id: "manta-campfire", title: "만타 캠프파이어", duration: 40, rarity: "Rare", when: "Night" },
  BelugaRings: { id: "beluga-rings", title: "흰고래의 거품 고리", duration: 34, rarity: "Rare", when: "Any" },
  SeahorseBirth: { id: "seahorse-birth", title: "해마 아빠의 출산", duration: 28, rarity: "Rare", when: "Any" },
  CuttleShow: { id: "cuttle-show", title: "갑오징어 색 쇼", duration: 22, rarity: "Common", when: "Any" },
  FlyingFishLeap: { id: "flying-fish-leap", title: "날치 떼 도약", duration: 16, rarity: "Common", when: "Day" },
  DolphinKelp: { id: "dolphin-kelp", title: "돌고래의 해초 놀이", duration: 32, rarity: "Rare", when: "Day" },
  OtterRaft: { id: "otter-raft", title: "해달 손잡고 낮잠", duration: 30, rarity: "Rare", when: "Day" },
  PearlNight: { id: "pearl-night", title: "진주가 빛나는 밤", duration: 22, rarity: "Rare", when: "Night" },
  OctopusGarden: { id: "octopus-garden", title: "문어의 정원", duration: 36, rarity: "Common", when: "Any" },
  GobyShrimp: { id: "goby-shrimp", title: "망둑과 딱총새우의 동거", duration: 30, rarity: "Common", when: "Day" },
  SilverMigration: { id: "silver-migration", title: "은빛 무리의 대이동", duration: 30, rarity: "Rare", when: "Day" },
  SunFlecks: { id: "sun-flecks", title: "켈프 숲의 햇살 커튼", duration: 22, rarity: "Common", when: "Day", scenes: ["kelp"] },
  UrchinMarch: { id: "urchin-march", title: "성게 행진", duration: 40, rarity: "Common", when: "Any", scenes: ["kelp"] },
  WreckGold: { id: "wreck-gold", title: "난파선 속 금화", duration: 30, rarity: "Rare", when: "Any", scenes: ["wreck"] },
  RuneGlow: { id: "rune-glow", title: "룬이 빛나는 밤", duration: 26, rarity: "Rare", when: "Night", scenes: ["ruins"] },
  Aurora: { id: "aurora", title: "얼음 너머 오로라", duration: 30, rarity: "Rare", when: "Night", scenes: ["ice"] },
  IceDrop: { id: "ice-drop", title: "얼음 조각이 떨어진다", duration: 20, rarity: "Common", when: "Any", scenes: ["ice"] },
  ShellSwap: { id: "shell-swap", title: "소라게 집 바꾸기", duration: 50, rarity: "Rare", when: "Any" },
  PenguinDive: { id: "penguin-dive", title: "펭귄 떼 다이빙", duration: 20, rarity: "Rare", when: "Day", scenes: ["ice", "kelp"] },
  ClownEggs: { id: "clown-eggs", title: "흰동가리 알 지키기", duration: 40, rarity: "Rare", when: "Any" },
  Fireworks: { id: "fireworks", title: "수면 위 불꽃놀이", duration: 16, rarity: "Rare", when: "Night" },
  DuckFlotilla: { id: "duck-flotilla", title: "고무 오리 선단", duration: 36, rarity: "Rare", when: "Day" },
  HaenyeoDive: { id: "haenyeo-dive", title: "해녀의 물질", duration: 40, rarity: "Rare", when: "Day" },
  SumbiChorus: { id: "sumbi-chorus", title: "숨비소리", duration: 30, rarity: "Rare", when: "Day" },
  HaenyeoDolphins: { id: "haenyeo-dolphins", title: "해녀와 제주 돌고래", duration: 34, rarity: "Legendary", when: "Day" },
  CoralPlanting: { id: "coral-planting", title: "산호 심는 다이버", duration: 36, rarity: "Rare", when: "Any" },
  TurtleBuddy: { id: "turtle-buddy", title: "거북과 헤엄치는 다이버", duration: 34, rarity: "Rare", when: "Day" },
  DiverRings: { id: "diver-rings", title: "다이버의 기포 고리 묘기", duration: 26, rarity: "Common", when: "Any" },
  MermaidSong: { id: "mermaid-song", title: "인어공주의 노래", duration: 30, rarity: "Legendary", when: "Any" },
  MermaidRing: { id: "mermaid-ring", title: "인어와 물고기의 원무", duration: 26, rarity: "Rare", when: "Any" },
  MermaidPearl: { id: "mermaid-pearl", title: "인어공주의 진주 선물", duration: 30, rarity: "Rare", when: "Any" },
};

export function isExtra(kind: string): kind is ExtraKind {
  return (EXTRA_KINDS as readonly string[]).includes(kind);
}

/** 감독의 사건 정보 표에 합칠 (id, 이름, 길이)다. */
export const EXTRA_INFO = Object.fromEntries(
  EXTRA_KINDS.map((kind) => [kind, { id: INFO[kind].id, title: INFO[kind].title, duration: INFO[kind].duration }]),
) as Record<ExtraKind, { id: string; title: string; duration: number }>;

export function extraRarity(kind: ExtraKind): Rarity {
  return INFO[kind].rarity;
}

export function extraWhen(kind: ExtraKind): When {
  return INFO[kind].when;
}

/** 지금 배경 컨셉에서 일어날 수 있는지다. */
export function extraSceneOk(game: Aquarium, kind: ExtraKind): boolean {
  const scenes = INFO[kind].scenes;
  return scenes === undefined || scenes.includes(game.scene);
}

const named = (game: Aquarium, ids: string[]): number[] =>
  ids.map((id) => game.indexOf(id)).filter((index): index is number => index !== null);

const any = (): boolean => true;

/** 사건이 등장시키거나 반응시키는 종 목록이다. */
export function extraPool(game: Aquarium, kind: ExtraKind): number[] {
  switch (kind) {
    case "MantaCampfire":
      return named(game, ["manta-ray", "reef-manta-ray", "diver"]);
    case "BelugaRings":
      return named(game, ["beluga-whale"]);
    case "SeahorseBirth":
      return groupPool(game, ["seahorse"], ["hover"], false).filter((index) => game.species[index].id.includes("seahorse"));
    case "CuttleShow":
      return groupPool(game, ["ceph"], ["squid"], false);
    case "FlyingFishLeap":
      return named(game, ["flying-fish"]);
    case "DolphinKelp":
      return groupPool(game, ["dolphin"], [], false);
    case "OtterRaft":
      return named(game, ["sea-otter"]);
    case "PearlNight":
      return named(game, ["giant-clam"]);
    case "OctopusGarden":
      return groupPool(game, ["ceph"], ["octopus"], false);
    case "GobyShrimp":
      return named(game, ["yellow-watchman-goby", "pistol-shrimp", "barracuda"]);
    case "SilverMigration":
      return named(game, ["sardine", "anchovy", "atlantic-herring", "pacific-mackerel"]);
    case "UrchinMarch":
      return named(game, ["purple-sea-urchin"]);
    case "WreckGold":
      return groupPool(game, ["reef", "bigreef"], ["fish"], false);
    case "ShellSwap":
      return named(game, ["hermit-crab"]);
    case "PenguinDive":
      return named(game, ["adelie-penguin"]);
    case "ClownEggs":
      return groupPool(game, ["clown"], [], false);
    case "HaenyeoDive":
    case "SumbiChorus":
      return named(game, ["haenyeo"]);
    case "HaenyeoDolphins":
      // 제주 바다의 남방큰돌고래와 가장 닮은 큰돌고래만 부른다.
      return named(game, ["haenyeo", "dolphin"]);
    case "CoralPlanting":
      return named(game, ["diver"]);
    case "TurtleBuddy":
      return named(game, ["diver"]).concat(groupPool(game, ["turtle"], [], false));
    case "DiverRings":
      return named(game, ["diver"]);
    case "MermaidSong":
    case "MermaidRing":
      return named(game, ["mermaid"]);
    case "MermaidPearl":
      return named(game, ["mermaid", "giant-clam"]);
    default:
      return [];
  }
}

/** 등장시킨 생물의 슬롯(아직 있으면)이다. */
function slotOf(game: Aquarium, active: Active, index: number): number | null {
  const id = active.cast[index];
  return id === undefined ? null : actorById(game, id);
}

/** 한 마리를 등장시키고 사건 등장 목록에 넣는다. */
function add(active: Active, id: number | null): number | null {
  if (id !== null) active.cast.push(id);
  return id;
}

function arrived(game: Aquarium, slot: number | null, x: number, y: number, reach = 4): boolean {
  if (slot === null) return false;
  const actor = game.actors[slot];
  return Math.hypot(actor.x - x, actor.y - y) < reach;
}

/** 수면을 뚫고 들어오는 물보라(반짝임·기포·고리)다. */
function splash(game: Aquarium, x: number): void {
  for (let n = 0; n < 8; n += 1) {
    const angle = Math.PI + (n / 7) * Math.PI;
    game.particles.push(new Particle("Spark", x, 24, Math.cos(angle) * 28, Math.sin(angle) * 24, 0.8, 0));
    game.particles.push(new Particle("Bubble", x + (n - 3.5) * 3, 30, (n - 3.5) * 2, -10 - n, 2, n * 0.1));
  }
  game.particles.push(new Particle("Ring", x, 24, 0, 0, 1, 0));
}

/** 해녀가 수면에서 내는 휘파람 같은 숨소리(숨비소리): 고리 둘과 음표가 번진다. */
function sumbi(game: Aquarium, x: number, y: number): void {
  game.particles.push(new Particle("Ring", x, y, 0, 0, 1.4, 0));
  game.particles.push(new Particle("Ring", x, y, 0, 0, 3, 0));
  for (let n = 0; n < 3; n += 1) {
    game.particles.push(new Particle("Note", x + (n - 1) * 6, y - 4, (n - 1) * 5, -12 - n * 3, 1.8, n * 0.3));
  }
}

function hearts(game: Aquarium, x: number, y: number, count: number): void {
  for (let n = 0; n < count; n += 1) {
    game.particles.push(new Particle("Heart", x + (n - (count - 1) / 2) * 6, y, 0, -10, 1.6, 0));
  }
}

function bubbles(game: Aquarium, x: number, y: number, count: number): void {
  for (let n = 0; n < count; n += 1) {
    const seed = game.random();
    game.particles.push(new Particle("Bubble", x + (seed - 0.5) * 6, y - n * 3, (seed - 0.5) * 4, -14 - seed * 8, 4, seed));
  }
}

export function startExtra(game: Aquarium, active: Active): void {
  const kind = active.kind as ExtraKind;
  const set = game.setpiece;
  switch (kind) {
    case "MantaCampfire": {
      // 잠수부가 모래에 불빛을 세우면 반짝 플랑크톤이 모이고, 쥐가오리가 공중제비를 돌며 빛기둥을 지나간다.
      const diver = add(active, cast(game, "diver", -40, 170, 1));
      if (diver !== null) setScript(game, diver, goto(126, FLOOR_Y - 16, 34));
      const manta = pick(game, named(game, ["manta-ray", "reef-manta-ray"]), any);
      if (manta !== null) {
        const id = add(active, castIndex(game, manta, WIDTH + 60, 120, -1));
        if (id !== null) setScript(game, id, { kind: "Orbit", cx: 140, cy: 150, rx: 74, ry: 46, angle: 0, rate: 0.8 });
      }
      set.beam = { x: 140, strength: 0 };
      break;
    }
    case "BelugaRings": {
      const [x, facing] = edgeFacing(game);
      const id = add(active, cast(game, "beluga-whale", x, 132, facing));
      if (id !== null) setScript(game, id, goto(240 - facing * 70, 132, 24));
      break;
    }
    case "SeahorseBirth": {
      const index = pick(game, extraPool(game, kind), any);
      if (index !== null) {
        const id = add(active, castIndex(game, index, -20, 162, 1));
        if (id !== null) setScript(game, id, goto(196, 164, 14));
      }
      break;
    }
    case "CuttleShow": {
      const pool = extraPool(game, kind);
      [150, 240, 330].forEach((x, slot) => {
        const index = pick(game, pool, any);
        if (index === null) return;
        const facing = slot === 2 ? -1 : 1;
        const id = add(active, castIndex(game, index, facing > 0 ? -30 - slot * 30 : WIDTH + 30, 138 + slot * 4, facing));
        if (id !== null) setScript(game, id, goto(x, 138 + slot * 4, 30));
      });
      active.timer = 6;
      break;
    }
    case "FlyingFishLeap": {
      const [x, facing] = edgeFacing(game);
      for (let rank = 0; rank < 5; rank += 1) {
        add(active, cast(game, "flying-fish", x - facing * rank * 30, 58 + rank * 5, facing));
      }
      active.timer = 1.2;
      break;
    }
    case "DolphinKelp": {
      const index = pick(game, extraPool(game, kind), any);
      if (index !== null) {
        const a = add(active, castIndex(game, index, -60, 120, 1));
        const b = add(active, castIndex(game, index, WIDTH + 60, 140, -1));
        // 넓고 납작한 궤도라 돌아서는 순간은 화면 양끝에서만 온다.
        if (a !== null) setScript(game, a, { kind: "Orbit", cx: 240, cy: 126, rx: 170, ry: 26, angle: Math.PI, rate: 0.45 });
        if (b !== null) setScript(game, b, { kind: "Orbit", cx: 240, cy: 126, rx: 170, ry: 26, angle: 0, rate: 0.45 });
        if (a !== null) set.toy = { x: -60, y: 126, holder: a, last: a };
        active.timer = 4;
      }
      break;
    }
    case "OtterRaft": {
      const a = add(active, cast(game, "sea-otter", -40, 30, 1));
      const b = add(active, cast(game, "sea-otter", -80, 32, 1));
      for (const [id, x] of [
        [a, 246],
        [b, 274],
      ] as [number | null, number][]) {
        if (id === null) continue;
        setScript(game, id, goto(x, 30, 12));
        const slot = actorById(game, id);
        if (slot !== null) startMood(game, game.actors[slot], "nap");
      }
      break;
    }
    case "PearlNight": {
      if (!game.actors.some((actor) => game.species[actor.species].id === "giant-clam")) {
        const index = game.indexOf("giant-clam");
        if (index !== null) add(active, castIndex(game, index, 330, floorY(game, index), 1));
      }
      set.pearls = 0;
      break;
    }
    case "OctopusGarden": {
      const index = pick(game, extraPool(game, kind), any);
      if (index !== null) {
        const id = add(active, castIndex(game, index, 80, FLOOR_Y - 22, 1));
        if (id !== null) setScript(game, id, goto(80, FLOOR_Y - 16, 20));
      }
      set.trinkets = [0, 1, 2].map((n) => ({ x: 150 + n * 34 + game.random() * 16, y: FLOOR_Y - 1, carrier: null, seed: game.random() }));
      break;
    }
    case "GobyShrimp": {
      const x = game.random() < 0.5 ? 150 : 330;
      set.burrow = { x };
      const goby = add(active, cast(game, "yellow-watchman-goby", x + 40, FLOOR_Y - 30, -1));
      if (goby !== null) setScript(game, goby, goto(x + 7, FLOOR_Y - 8, 18));
      const shrimp = game.indexOf("pistol-shrimp");
      if (shrimp !== null) {
        const id = add(active, castIndex(game, shrimp, x, floorY(game, shrimp), -1));
        const slot = id === null ? null : actorById(game, id);
        if (slot !== null) {
          game.actors[slot].sink = 1;
          game.actors[slot].sinkTo = 1;
        }
      }
      active.timer = 2;
      break;
    }
    case "SilverMigration": {
      const pool = extraPool(game, kind);
      const heading = game.random() < 0.5 ? 1 : -1;
      for (const y of [95, 165]) {
        const index = pick(game, pool, any);
        if (index === null) break;
        game.spawnSchool(index, false);
        const school = game.schools[game.schools.length - 1];
        const shift = offstage(heading > 0 ? -40 : WIDTH + 40) - school.x;
        school.heading = heading;
        school.x += shift;
        school.y = y;
        for (const actor of game.actors) {
          if (actor.school !== school.id) continue;
          actor.x += shift;
          actor.y += y - 140;
          actor.facing = heading;
          actor.vx = heading * 20;
        }
      }
      break;
    }
    case "SunFlecks":
      set.sunflecks = 0;
      break;
    case "UrchinMarch": {
      const index = game.indexOf("purple-sea-urchin");
      if (index !== null) {
        for (let rank = 0; rank < 5; rank += 1) {
          const id = add(active, castIndex(game, index, -20 - rank * 20, floorY(game, index), 1));
          if (id !== null) setScript(game, id, goto(70 + rank * 26, floorY(game, index), 6));
        }
      }
      break;
    }
    case "WreckGold":
      set.wreckGlow = 0;
      gather(game, 96, 190, 140);
      break;
    case "RuneGlow":
      set.runes = 0;
      set.runeStrength = 0;
      break;
    case "Aurora":
      set.aurora = 0;
      break;
    case "IceDrop": {
      const x = 120 + game.random() * 240;
      retain(game.debris, (item) => item.kind !== "Ice");
      game.debris.push(new Debris("Ice", x, -30, 36));
      break;
    }
    case "ShellSwap": {
      // 빈 소라 껍데기가 나타나면 소라게들이 크기순으로 줄을 서서 차례로 한 칸씩 큰 집으로 옮긴다.
      set.shell = { x: 236, y: FLOOR_Y - 1, scale: 1.3 };
      const index = game.indexOf("hermit-crab");
      if (index !== null) {
        [1.18, 1, 0.82].forEach((scale, rank) => {
          const id = add(active, castIndex(game, index, WIDTH + 20 + rank * 30, floorY(game, index), -1));
          const slot = id === null ? null : actorById(game, id);
          if (slot === null || id === null) return;
          game.actors[slot].scale = scale;
          setScript(game, id, goto(262 + rank * 24, floorY(game, index), 12));
        });
      }
      break;
    }
    case "PenguinDive": {
      const facing = game.random() < 0.5 ? 1 : -1;
      for (let rank = 0; rank < 5; rank += 1) {
        const x = 110 + rank * 56;
        const id = add(active, cast(game, "adelie-penguin", x, 12, facing));
        if (id !== null) setScript(game, id, goto(x + facing * 60, 110 + rank * 16, 62));
        splash(game, x);
      }
      break;
    }
    case "ClownEggs": {
      const x = game.random() < 0.5 ? 106 : 374;
      set.nest = { x, y: FLOOR_Y - 3, hatch: 0 };
      const index = pick(game, extraPool(game, kind), any);
      if (index !== null) {
        for (const [slot, angle] of [
          [0, 0],
          [1, Math.PI],
        ] as [number, number][]) {
          const id = add(active, castIndex(game, index, slot === 0 ? -30 : WIDTH + 30, 200, slot === 0 ? 1 : -1));
          if (id !== null) setScript(game, id, { kind: "Orbit", cx: x, cy: FLOOR_Y - 26, rx: 20, ry: 6, angle, rate: slot === 0 ? 1.1 : -1.1 });
        }
      }
      break;
    }
    case "Fireworks":
      active.timer = 0.5;
      break;
    case "DuckFlotilla": {
      const facing = game.random() < 0.5 ? 1 : -1;
      set.floaters = [0, 1, 2, 3, 4].map((rank) => ({
        x: offstage(facing > 0 ? -20 : WIDTH + 20) - facing * rank * 26,
        facing,
        speed: 10,
        phase: game.random() * TAU,
      }));
      break;
    }
    case "HaenyeoDive": {
      // 해녀가 테왁을 두고 바닥까지 내려가 미역을 따 담고, 수면으로 올라 숨비소리를 낸다.
      const id = add(active, cast(game, "haenyeo", 160, 26, 1));
      if (id !== null) setScript(game, id, goto(200, FLOOR_Y - 24, 26));
      break;
    }
    case "SumbiChorus": {
      [120, 240, 360].forEach((x, rank) => {
        const id = add(active, cast(game, "haenyeo", x, 150 + rank * 10, rank === 1 ? -1 : 1));
        if (id !== null) setScript(game, id, goto(x, 150 + rank * 10, 20));
      });
      active.timer = 3;
      break;
    }
    case "HaenyeoDolphins": {
      const haenyeo = add(active, cast(game, "haenyeo", -40, 110, 1));
      if (haenyeo !== null) setScript(game, haenyeo, goto(WIDTH + 60, 118, 22));
      const index = game.indexOf("dolphin");
      if (index !== null && haenyeo !== null) {
        for (const [dx, dy] of [
          [-60, -26],
          [-90, 28],
        ] as [number, number][]) {
          const id = add(active, castIndex(game, index, -120, 110 + dy, 1));
          if (id !== null) setScript(game, id, { kind: "Follow", leader: haenyeo, dx, dy });
        }
      }
      break;
    }
    case "CoralPlanting": {
      const id = add(active, cast(game, "diver", -40, 150, 1));
      // 심을 자리는 가운데를 비워 두려고 양옆 바닥에서 고른다. 싹은 다이버가 닿으면 자라기 시작한다.
      const x = game.random() < 0.5 ? 150 : 330;
      set.planted.push({ x, grow: 0 });
      if (id !== null) setScript(game, id, goto(x - 22, FLOOR_Y - 18, 30));
      break;
    }
    case "TurtleBuddy": {
      const turtle = pick(game, groupPool(game, ["turtle"], [], false), any);
      const [x, facing] = edgeFacing(game);
      if (turtle !== null) {
        const lead = add(active, castIndex(game, turtle, x, 120, facing));
        if (lead !== null) {
          setScript(game, lead, goto(x + facing * (WIDTH + 160), 110, 13));
          const diver = add(active, cast(game, "diver", x - facing * 70, 134, facing));
          if (diver !== null) setScript(game, diver, { kind: "Follow", leader: lead, dx: -46, dy: 16 });
        }
      }
      break;
    }
    case "DiverRings": {
      const [x, facing] = edgeFacing(game);
      const id = add(active, cast(game, "diver", x, 150, facing));
      if (id !== null) setScript(game, id, goto(240 - facing * 60, 150, 26));
      active.timer = 6;
      break;
    }
    case "MermaidSong": {
      const id = add(active, cast(game, "mermaid", WIDTH + 40, 160, -1));
      if (id !== null) setScript(game, id, goto(330, FLOOR_Y - 26, 30));
      break;
    }
    case "MermaidRing": {
      const id = add(active, cast(game, "mermaid", -40, 130, 1));
      if (id !== null) setScript(game, id, goto(240, 130, 36));
      if (game.schools.length === 0) {
        const index = pick(game, groupPool(game, ["school"], [], false), (entry) => entry.activity !== "night");
        if (index !== null) game.spawnSchool(index, false);
      }
      break;
    }
    case "MermaidPearl": {
      const clam = game.indexOf("giant-clam");
      if (clam !== null) add(active, castIndex(game, clam, 300, floorY(game, clam), 1));
      const id = add(active, cast(game, "mermaid", -40, 120, 1));
      if (id !== null) setScript(game, id, goto(276, FLOOR_Y - 34, 34));
      break;
    }
  }
}

/** 사건 한 frame을 진행한다. false면 끝났다. */
export function stepExtra(game: Aquarium, active: Active, dt: number): boolean {
  const kind = active.kind as ExtraKind;
  const set = game.setpiece;
  const age = active.age;
  const duration = INFO[kind].duration;
  const fade = Math.min(1, age / 2, Math.max(0, (duration - age) / 3));
  const tick = (period: number) => Math.floor((age - dt) / period) !== Math.floor(age / period);
  switch (kind) {
    case "MantaCampfire": {
      const beam = set.beam;
      if (beam === null) return false;
      const diver = slotOf(game, active, 0);
      if (diver !== null) {
        const actor = game.actors[diver];
        if (arrived(game, diver, 126, FLOOR_Y - 16, 6)) beam.x = actor.x + actor.facing * 14;
        beam.strength = arrived(game, diver, 126, FLOOR_Y - 16, 6) ? Math.min(fade, beam.strength + dt * 0.6) : Math.min(beam.strength, fade);
      } else {
        beam.strength = Math.max(0, beam.strength - dt);
      }
      if (beam.strength > 0.3 && tick(0.22)) {
        const seed = game.random();
        game.particles.push(new Particle("Glimmer", beam.x + (seed - 0.5) * 18, FLOOR_Y - 30 - seed * 140, (seed - 0.5) * 3, -1, 8, seed));
      }
      const manta = slotOf(game, active, 1);
      if (manta !== null && beam.strength > 0.5) {
        const actor = game.actors[manta];
        if (Math.abs(actor.x - beam.x) < 16 && actor.roll <= 0 && tick(0.1)) actor.roll = f32(2.2);
      }
      return true;
    }
    case "BelugaRings": {
      const slot = slotOf(game, active, 0);
      if (slot === null) return age < 4;
      const whale = game.actors[slot];
      const species = game.species[whale.species];
      const script = whale.script;
      const holding = script !== null && script.kind === "Goto" && Math.hypot(whale.x - script.x, whale.y - script.y) < 4;
      if ((active.stage === 0 || active.stage === 2) && holding) {
        active.stage += 1;
        active.timer = 1.4;
      } else if ((active.stage === 1 || active.stage === 3) && active.timer <= 0) {
        // 도넛 기포 고리를 앞으로 불고, 떠오르는 고리를 지나 헤엄쳐 간다.
        const rx = whale.x + whale.facing * (species.frameW * 0.5 + 16);
        const ry = whale.y - 4;
        game.particles.push(new Particle("Donut", rx, ry, whale.facing * 2, -3, 7, 0));
        bubbles(game, rx - whale.facing * 6, ry, 3);
        whale.script = goto(rx + whale.facing * (species.frameW * 0.5 + 40), ry - 8, 26);
        active.stage += 1;
        if (active.stage === 4) {
          hearts(game, whale.x, whale.y - species.frameH * 0.5, 3);
        }
      } else if (active.stage === 4 && holding) {
        whale.script = goto(whale.x + whale.facing * 400, whale.y, 26);
        active.stage = 5;
      }
      return true;
    }
    case "SeahorseBirth": {
      const slot = slotOf(game, active, 0);
      if (slot === null) return false;
      const dad = game.actors[slot];
      if (active.stage === 0 && arrived(game, slot, 196, 164)) {
        active.stage = 1;
        active.timer = 5;
      }
      if (active.stage === 1) {
        if (tick(0.12)) {
          const seed = game.random();
          // 배 주머니에서 앞쪽으로 퍼져 나간다(seed 하나로 방향을 정한다).
          const angle = seed * TAU * 3;
          game.particles.push(new Particle("Fry", dad.x + dad.facing * 3, dad.y + 4, Math.cos(angle) * 12 + dad.facing * 8, Math.sin(angle) * 8 - 3, 6, seed * 0.89));
        }
        if (active.timer <= 0) {
          active.stage = 2;
          game.particles.push(new Particle("Love", dad.x, dad.y - 18, 0, -6, 1.8, 0));
        }
      }
      return true;
    }
    case "CuttleShow": {
      if (active.timer <= 0 && age < duration - 3) {
        active.timer = 1.1;
        const slot = slotOf(game, active, active.stage % Math.max(1, active.cast.length));
        if (slot !== null && game.actors[slot].mood === null) startMood(game, game.actors[slot], "shift");
        active.stage += 1;
      }
      return true;
    }
    case "FlyingFishLeap": {
      if (active.timer <= 0 && active.stage < active.cast.length) {
        active.timer = 0.9;
        const slot = slotOf(game, active, active.stage);
        if (slot !== null) startMood(game, game.actors[slot], "leap");
        active.stage += 1;
      }
      return true;
    }
    case "DolphinKelp": {
      const toy = set.toy;
      if (toy === null) return false;
      if (toy.holder !== null) {
        const slot = actorById(game, toy.holder);
        if (slot === null) {
          toy.holder = null;
        } else {
          const actor = game.actors[slot];
          const species = game.species[actor.species];
          toy.x = actor.x + actor.facing * species.frameW * 0.08;
          toy.y = actor.y + species.frameH * 0.32;
          if (active.timer <= 0) {
            // 지느러미에 걸었던 잎을 놓아 준다. 다른 돌고래가 받아 간다.
            toy.last = toy.holder;
            toy.holder = null;
          }
        }
      } else {
        toy.y = Math.min(FLOOR_Y - 8, toy.y + 5 * dt);
        toy.x += Math.sin(game.time * 1.3) * 5 * dt;
        for (const id of active.cast) {
          const slot = actorById(game, id);
          if (slot === null || id === toy.last) continue;
          const actor = game.actors[slot];
          if (Math.hypot(actor.x - toy.x, actor.y - toy.y) < 26) {
            toy.holder = id;
            active.timer = 4;
            hearts(game, actor.x, actor.y - 20, 1);
          }
        }
        if (toy.y >= FLOOR_Y - 8 && active.cast.length > 0) {
          toy.holder = active.cast[0];
          active.timer = 4;
        }
      }
      return true;
    }
    case "OtterRaft": {
      if (age > duration - 4 && active.stage === 0) {
        active.stage = 1;
        for (const id of active.cast) {
          const slot = actorById(game, id);
          if (slot !== null) game.actors[slot].script = goto(game.actors[slot].x + 360, 30, 12);
        }
      }
      if (tick(3)) {
        const a = slotOf(game, active, 0);
        const b = slotOf(game, active, 1);
        if (a !== null && b !== null) {
          game.particles.push(new Particle("Heart", (game.actors[a].x + game.actors[b].x) / 2, 16, 0, -6, 1.6, 0));
        }
      }
      return true;
    }
    case "PearlNight": {
      set.pearls = fade;
      for (const actor of game.actors) {
        if (game.species[actor.species].id === "giant-clam" && actor.depth === 1 && actor.mood === null && age < duration - 5) {
          startMood(game, actor, "pearl");
        }
      }
      return true;
    }
    case "OctopusGarden": {
      const slot = slotOf(game, active, 0);
      if (slot === null) return false;
      const octopus = game.actors[slot];
      const index = Math.floor(active.stage / 2);
      if (index >= set.trinkets.length) {
        if (active.stage === set.trinkets.length * 2) {
          active.stage += 1;
          hearts(game, octopus.x, octopus.y - 20, 3);
        }
        return true;
      }
      const trinket = set.trinkets[index];
      const den = 62 + index * 10;
      if (active.stage % 2 === 0) {
        octopus.script = goto(trinket.x, FLOOR_Y - 16, 22);
        if (arrived(game, slot, trinket.x, FLOOR_Y - 16)) {
          trinket.carrier = octopus.id;
          active.stage += 1;
        }
      } else {
        octopus.script = goto(den, FLOOR_Y - 16, 18);
        trinket.x = octopus.x;
        trinket.y = octopus.y + 8;
        if (arrived(game, slot, den, FLOOR_Y - 16)) {
          trinket.carrier = null;
          trinket.x = den;
          trinket.y = FLOOR_Y - 1;
          active.stage += 1;
        }
      }
      return true;
    }
    case "GobyShrimp": {
      const burrow = set.burrow;
      if (burrow === null) return false;
      const goby = slotOf(game, active, 0);
      const shrimp = slotOf(game, active, 1);
      const x = burrow.x;
      // 12~20초에 창꼬치가 지나가면 둘이 함께 굴로 쏙 들어갔다가 다시 나온다.
      if (age > 12 && active.cast.length === 2) {
        const index = game.indexOf("barracuda");
        const [edge, facing] = edgeFacing(game);
        if (index !== null) {
          const id = add(active, castIndex(game, index, edge, FLOOR_Y - 34, facing));
          if (id !== null) setScript(game, id, goto(edge + facing * (WIDTH + 160), FLOOR_Y - 34, 40));
        }
      }
      const danger = age > 13 && age < 20;
      if (goby !== null) {
        game.actors[goby].sinkTo = danger ? 1 : 0;
        game.actors[goby].script = goto(x + 7, danger ? FLOOR_Y - 4 : FLOOR_Y - 8, 26);
      }
      if (shrimp !== null) {
        const actor = game.actors[shrimp];
        const species = game.species[actor.species];
        const floor = FLOOR_Y - species.frameH * 0.5 + 3;
        if (danger || active.stage === 0) {
          actor.sinkTo = 1;
          actor.script = goto(x, floor, 14);
          if (!danger && active.timer <= 0) {
            active.stage = 1;
            active.timer = 3.5;
          }
        } else {
          // 굴 밖으로 나와 모래를 퍼내고 다시 들어간다.
          actor.sinkTo = 0;
          actor.script = goto(x - 26, floor, 12);
          if (tick(0.3)) game.particles.push(new Particle("Dust", actor.x - 6, floor + 6, -10, -8, 0.9, 0.3));
          if (active.timer <= 0) {
            active.stage = 0;
            active.timer = 2.5;
          }
        }
      }
      return true;
    }
    case "SilverMigration":
      return true;
    case "SunFlecks":
      set.sunflecks = fade;
      return true;
    case "UrchinMarch":
      if (tick(0.6)) {
        for (const id of active.cast) {
          const slot = actorById(game, id);
          if (slot === null) continue;
          const actor = game.actors[slot];
          game.particles.push(new Particle("Dust", actor.x - 6, actor.y + 8, -6, -5, 0.8, 0.2));
        }
      }
      return true;
    case "WreckGold":
      set.wreckGlow = fade;
      if (fade > 0.4 && tick(0.2)) {
        const seed = game.random();
        game.particles.push(new Particle("Gold", 82 + seed * 26, 196 - seed * 10, (seed - 0.5) * 6, -9 - seed * 6, 2.2, seed));
      }
      if (tick(8)) gather(game, 96, 190, 140);
      return true;
    case "RuneGlow":
      set.runes = Math.min(1, age / (duration * 0.6));
      set.runeStrength = fade;
      return true;
    case "Aurora":
      set.aurora = fade;
      return true;
    case "IceDrop": {
      for (const item of game.debris) {
        if (item.kind === "Ice" && item.landed === null && tick(0.15)) {
          game.particles.push(new Particle("Bubble", item.x + Math.sin(age * 5) * 4, item.y - 10, 0, -12, 3, 0.5));
        }
      }
      return true;
    }
    case "ShellSwap": {
      const shell = set.shell;
      if (shell === null) return false;
      const index = game.indexOf("hermit-crab");
      if (index === null) return false;
      const floor = floorY(game, index);
      if (active.stage === 0) {
        const ready = active.cast.every((id, rank) => {
          const slot = actorById(game, id);
          return slot === null || arrived(game, slot, 262 + rank * 24, floor);
        });
        if (ready || age > 16) {
          active.stage = 1;
          const first = slotOf(game, active, 0);
          if (first !== null) game.particles.push(new Particle("Exclaim", game.actors[first].x, game.actors[first].y - 16, 0, -3, 1.2, 0));
        }
        return true;
      }
      const rank = Math.floor((active.stage - 1) / 2);
      if (rank >= active.cast.length) {
        if (active.stage === active.cast.length * 2 + 1) {
          active.stage += 1;
          game.particles.push(new Particle("Love", shell.x + 20, FLOOR_Y - 30, 0, -6, 2, 0));
        }
        return true;
      }
      const slot = slotOf(game, active, rank);
      if (slot === null) {
        active.stage += 2;
        return true;
      }
      const crab = game.actors[slot];
      if (active.stage % 2 === 1) {
        crab.script = goto(shell.x + 4, floor, 12);
        if (arrived(game, slot, shell.x + 4, floor, 5)) {
          // 모래 먼지 속에서 껍데기를 바꿔 입는다: 게는 큰 집으로, 빈 집은 게가 입던 크기가 된다.
          for (let n = 0; n < 12; n += 1) {
            const angle = (n / 12) * TAU;
            game.particles.push(new Particle("Dust", shell.x + Math.cos(angle) * 6, FLOOR_Y - 4, Math.cos(angle) * 16, -8 - Math.abs(Math.sin(angle)) * 8, 1.2, 0.5));
          }
          const worn = crab.scale;
          crab.scale = shell.scale;
          shell.scale = worn;
          active.timer = 1.4;
          active.stage += 1;
        }
      } else if (active.timer <= 0) {
        crab.script = goto(shell.x - 50 - rank * 26, floor, 12);
        hearts(game, crab.x, crab.y - 16, 1);
        active.stage += 1;
      }
      return true;
    }
    case "PenguinDive": {
      if (active.stage === 0 && age > 1.6) {
        active.stage = 1;
        for (const id of active.cast) {
          const slot = actorById(game, id);
          if (slot === null) continue;
          const actor = game.actors[slot];
          actor.script = goto(actor.x + actor.facing * (WIDTH + 120), actor.y + 10, 76);
          actor.burst = 1;
        }
      }
      if (tick(0.12)) {
        for (const id of active.cast) {
          const slot = actorById(game, id);
          if (slot === null) continue;
          const actor = game.actors[slot];
          game.particles.push(new Particle("Bubble", actor.x - actor.facing * 12, actor.y, 0, -8, 1.8, 0.3));
        }
      }
      return age < 4 || active.cast.some((id) => actorById(game, id) !== null);
    }
    case "ClownEggs": {
      const nest = set.nest;
      if (nest === null) return false;
      nest.hatch = Math.min(1, Math.max(0, (age - 24) / 4));
      if (age > 26 && active.stage === 0) {
        active.stage = 1;
        // 알이 깨어 아주 작은 치어가 반짝이며 떠오른다.
        for (let n = 0; n < 22; n += 1) {
          const seed = game.random();
          game.particles.push(new Particle("Fry", nest.x + (seed - 0.5) * 12, nest.y - 3, (seed - 0.5) * 14, -8 - seed * 8, 7, 0.9 + seed * 0.1));
        }
        hearts(game, nest.x, nest.y - 26, 2);
      }
      if (age > 31) set.nest = null;
      return true;
    }
    case "Fireworks":
      if (active.timer <= 0 && age < duration - 2) {
        active.timer = 0.7 + game.random() * 0.5;
        const x = 60 + game.random() * 360;
        const y = 14 + game.random() * 16;
        const color = Math.floor(game.random() * 6);
        for (let n = 0; n < 30; n += 1) {
          const angle = (n / 30) * TAU;
          const speed = 36 + game.random() * 16;
          game.particles.push(new Particle("Firework", x, y, Math.cos(angle) * speed, Math.sin(angle) * speed * 0.7, 2.2, color / 6 + 0.01));
        }
        game.particles.push(new Particle("Spark", x, y, 0, 0, 0.4, 0));
      }
      return true;
    case "DuckFlotilla":
      for (const duck of set.floaters) {
        duck.x += duck.facing * duck.speed * dt;
      }
      if (tick(1.6)) {
        const duck = set.floaters[Math.floor(game.random() * set.floaters.length)];
        if (duck) game.particles.push(new Particle("Ring", duck.x, 20, 0, 0, 0.9, 0));
      }
      return set.floaters.some((duck) => duck.x > visible.left - 40 && duck.x < visible.right + 40) || age < 4;
    case "HaenyeoDive": {
      const slot = slotOf(game, active, 0);
      if (slot === null) return false;
      const diver = game.actors[slot];
      if (active.stage === 0 && arrived(game, slot, 200, FLOOR_Y - 24, 5)) {
        active.stage = 1;
        active.timer = 4;
      } else if (active.stage === 1) {
        // 바닥에서 미역을 따 망사리에 담는다(잎이 떠올랐다가 망사리로 들어간다).
        if (tick(0.5)) game.particles.push(new Particle("Leaf", diver.x + diver.facing * 12, diver.y + 6, 0, -4, 1.2, game.random()));
        if (active.timer <= 0) {
          active.stage = 2;
          diver.script = goto(diver.x + diver.facing * 40, 26, 30);
        }
      } else if (active.stage === 2 && diver.y < 30) {
        active.stage = 3;
        sumbi(game, diver.x, 20);
        diver.script = goto(diver.x + diver.facing * 300, 30, 20);
      }
      if (active.stage < 2 && tick(1.4)) bubbles(game, diver.x + diver.facing * 10, diver.y - 8, 2);
      return true;
    }
    case "SumbiChorus": {
      // 해녀 셋이 차례로 수면으로 올라 숨비소리를 낸다.
      if (active.timer <= 0 && active.stage < active.cast.length * 2) {
        const rank = Math.floor(active.stage / 2);
        const slot = slotOf(game, active, rank);
        if (slot !== null) {
          const diver = game.actors[slot];
          if (active.stage % 2 === 0) {
            diver.script = goto(diver.x, 24, 34);
            active.timer = 3.2;
          } else {
            sumbi(game, diver.x, 20);
            diver.script = goto(diver.x + diver.facing * 20, 120 + rank * 12, 24);
            active.timer = 1.6;
          }
        }
        active.stage += 1;
      }
      return true;
    }
    case "HaenyeoDolphins": {
      if (tick(4)) {
        const slot = slotOf(game, active, 0);
        if (slot !== null) hearts(game, game.actors[slot].x, game.actors[slot].y - 20, 1);
      }
      return age < 4 || (slotOf(game, active, 0) !== null);
    }
    case "CoralPlanting": {
      const slot = slotOf(game, active, 0);
      const coral = set.planted[set.planted.length - 1];
      if (slot === null || !coral) return false;
      const x = coral.x;
      const diver = game.actors[slot];
      if (active.stage === 0 && arrived(game, slot, x - 22, FLOOR_Y - 18, 6)) {
        active.stage = 1;
        coral.grow = 0.05;
        for (let n = 0; n < 8; n += 1) game.particles.push(new Particle("Dust", x + (n - 4) * 2, FLOOR_Y - 2, (n - 4) * 3, -6, 1, 0.4));
      }
      if (active.stage === 1) {
        coral.grow = Math.min(1, coral.grow + dt * 0.12);
        if (tick(0.8)) game.particles.push(new Particle("Spark", x + (game.random() - 0.5) * 10, FLOOR_Y - 10 - game.random() * 12, 0, -5, 0.8, 0));
        if (coral.grow > 0.6 && active.stage === 1) {
          active.stage = 2;
          hearts(game, diver.x, diver.y - 18, 2);
          game.photo = 1;
          diver.script = goto(diver.x + 300, 140, 26);
        }
      }
      return true;
    }
    case "TurtleBuddy": {
      if (tick(2.6)) {
        const diver = slotOf(game, active, 1);
        if (diver !== null) {
          const actor = game.actors[diver];
          bubbles(game, actor.x + actor.facing * 10, actor.y - 8, 2);
          if (tick(7.8)) game.photo = 0.8;
        }
      }
      return age < 4 || active.cast.some((id) => actorById(game, id) !== null);
    }
    case "DiverRings": {
      const slot = slotOf(game, active, 0);
      if (slot === null) return false;
      const diver = game.actors[slot];
      if (active.timer <= 0 && active.stage < 3) {
        // 다이버가 도넛 기포 고리를 불어 올리고, 둘레 물고기가 고리 사이로 헤엄친다.
        active.timer = 4.5;
        active.stage += 1;
        game.particles.push(new Particle("Donut", diver.x + diver.facing * 20, diver.y - 10, 0, -6, 6, 0));
        gather(game, diver.x + diver.facing * 20, diver.y - 30, 110);
      }
      if (active.stage >= 3 && active.timer <= 0 && diver.script?.kind === "Goto") {
        diver.script = goto(diver.x + diver.facing * 320, diver.y, 26);
      }
      return true;
    }
    case "MermaidSong": {
      const slot = slotOf(game, active, 0);
      if (slot === null) return false;
      const mermaid = game.actors[slot];
      if (active.stage === 0 && arrived(game, slot, 330, FLOOR_Y - 26, 6)) {
        active.stage = 1;
        startMood(game, mermaid, "serenade");
      }
      if (active.stage === 1) {
        if (tick(0.5)) game.particles.push(new Particle("Note", mermaid.x + Math.sin(age * 2) * 10, mermaid.y - 24, Math.sin(age * 3) * 5, -10, 2, age));
        if (tick(4.5) && mermaid.mood === null) startMood(game, mermaid, "serenade");
        if (tick(6)) gather(game, mermaid.x, mermaid.y - 20, 160);
      }
      return true;
    }
    case "MermaidRing": {
      const slot = slotOf(game, active, 0);
      if (slot === null) return false;
      const mermaid = game.actors[slot];
      if (active.stage === 0 && arrived(game, slot, 240, 130, 6)) {
        active.stage = 1;
        // 무리가 인어 둘레를 원을 그리며 돈다.
        for (const school of game.schools) {
          school.x = mermaid.x;
          school.y = mermaid.y;
        }
        startMood(game, mermaid, "serenade");
      }
      if (active.stage === 1) {
        for (const school of game.schools) {
          school.x += (mermaid.x - school.x) * dt;
          school.y += (mermaid.y - school.y) * dt;
        }
        if (age > duration - 5) {
          active.stage = 2;
          mermaid.script = goto(mermaid.x + 320, 110, 30);
        }
      }
      return true;
    }
    case "MermaidPearl": {
      const clam = slotOf(game, active, 0);
      const slot = slotOf(game, active, 1);
      if (slot === null) return false;
      const mermaid = game.actors[slot];
      if (active.stage === 0 && arrived(game, slot, 276, FLOOR_Y - 34, 6)) {
        active.stage = 1;
        if (clam !== null) startMood(game, game.actors[clam], "pearl");
        active.timer = 3;
      } else if (active.stage === 1 && active.timer <= 0) {
        active.stage = 2;
        startMood(game, mermaid, "serenade");
        game.particles.push(new Particle("Love", mermaid.x, mermaid.y - 24, 0, -6, 2, 0));
        mermaid.script = goto(mermaid.x - 320, 110, 30);
      }
      return true;
    }
  }
}

/** 사건이 끝나면 무대를 치운다(심은 산호는 남긴다). */
export function finishExtra(game: Aquarium, active: Active): void {
  const set = game.setpiece;
  switch (active.kind as ExtraKind) {
    case "MantaCampfire":
      set.beam = null;
      break;
    case "DolphinKelp":
      set.toy = null;
      break;
    case "PearlNight":
      set.pearls = 0;
      break;
    case "OctopusGarden":
      set.trinkets = [];
      break;
    case "GobyShrimp":
      set.burrow = null;
      for (const id of active.cast) {
        const slot = actorById(game, id);
        if (slot !== null) game.actors[slot].sinkTo = 0;
      }
      break;
    case "SunFlecks":
      set.sunflecks = 0;
      break;
    case "WreckGold":
      set.wreckGlow = 0;
      break;
    case "RuneGlow":
      set.runes = 0;
      set.runeStrength = 0;
      break;
    case "Aurora":
      set.aurora = 0;
      break;
    case "ShellSwap":
      set.shell = null;
      break;
    case "ClownEggs":
      set.nest = null;
      break;
    case "DuckFlotilla":
      set.floaters = [];
      break;
    default:
      break;
  }
}
