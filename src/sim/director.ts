// 이벤트 감독. 시간대·날씨·등장 생물 조건과 쿨다운, 희귀도로 사건을 하나씩 고르고, 사건마다
// 생물에게 짧은 스크립트(가기·돌기·따라가기)를 붙이거나 물건·광원을 등장시킨다.
// Aquarium을 다루는 사건 로직은 `game`을 받는 함수로 둔다.

import type { Aquarium } from "./aquarium";
import { bigBody, faceTravel, glowPoint as lightOf, grounded, type Species } from "./catalog";
import { FLOOR_Y, HEIGHT, TAU, TURN_SECONDS, WIDTH, offstage, visible } from "./constants";
import { Particle, type ParticleKind, Tentacle } from "./life";
import { f32, pickIndex, retain, signum } from "./num";
import { EXTRA_INFO, EXTRA_KINDS, extraPool, extraRarity, extraSceneOk, extraWhen, finishExtra, isExtra, startExtra, stepExtra } from "./vignettes";

/** 생물에 붙는 짧은 연출 동작이다. 붙어 있는 동안 평소 헤엄 규칙 대신 이 동작을 따른다. */
export type Script =
  /** 지정한 점으로 헤엄쳐 가서 머문다. */
  | { kind: "Goto"; x: number; y: number; speed: number }
  /** 중심 둘레를 타원으로 돈다. */
  | { kind: "Orbit"; cx: number; cy: number; rx: number; ry: number; angle: number; rate: number }
  /** 다른 생물(`leader` id)의 옆을 일정 간격으로 따라간다. */
  | { kind: "Follow"; leader: number; dx: number; dy: number };

/** 사건 이동 스크립트다. 무대 밖 목표(퇴장 자리)는 휴대폰 여백 바깥까지 민다. */
export function goto(x: number, y: number, speed: number): Script {
  return { kind: "Goto", x: offstage(x), y, speed };
}

export const EVENT_KINDS = [
  "SharkPatrol",
  "BubbleNet",
  "AnglerLantern",
  "InkEscape",
  "ClownHome",
  "CrabStandoff",
  "SeahorseDance",
  "JellyBloom",
  "MantaRoll",
  "WhaleShark",
  "Sunfish",
  "TurtleHatch",
  "Oarfish",
  "GiantSquid",
  "WhaleSong",
  "CoralSpawn",
  "GlowWave",
  "Current",
  "VentBurst",
  "GoldenDawn",
  "MeteorShower",
  "SunkenAnchor",
  "TreasureChest",
  "MessageBottle",
  "TreatBasket",
  "Diver",
  "Submarine",
  "FeedingFrenzy",
  "PelagicRush",
  "SharkNap",
  "RaySquadron",
  "WhalePass",
  "SurfaceBreath",
  "FloorMarch",
  "DeepVisitors",
  "EelPeek",
  "HideAndSeek",
  "PufferPanic",
  "CleaningStation",
  // 사건 2부(짧은 장면)는 vignettes.ts에 있다.
  ...EXTRA_KINDS,
] as const;

export type EventKind = (typeof EVENT_KINDS)[number];

export type Rarity = "Common" | "Rare" | "Legendary";

/** 언제 일어날 수 있는지다. */
type When = "Any" | "Day" | "Night" | "Dawn";

const EVENT_INFO: Record<EventKind, { id: string; title: string; duration: number }> = {
  ...EXTRA_INFO,
  SharkPatrol: { id: "shark-patrol", title: "상어의 순찰", duration: 16 },
  BubbleNet: { id: "bubble-net", title: "돌고래의 기포 그물", duration: 16 },
  AnglerLantern: { id: "angler-lantern", title: "초롱아귀의 등불", duration: 22 },
  InkEscape: { id: "ink-escape", title: "문어의 먹물 탈출", duration: 14 },
  ClownHome: { id: "clown-home", title: "흰동가리의 귀가", duration: 26 },
  CrabStandoff: { id: "crab-standoff", title: "홍게의 대치", duration: 22 },
  SeahorseDance: { id: "seahorse-dance", title: "해마 커플의 춤", duration: 14 },
  JellyBloom: { id: "jelly-bloom", title: "해파리 대발생", duration: 20 },
  MantaRoll: { id: "manta-roll", title: "쥐가오리의 공중제비", duration: 8 },
  WhaleShark: { id: "whale-shark", title: "고래상어가 나타났다", duration: 55 },
  Sunfish: { id: "sunfish", title: "개복치가 떠내려온다", duration: 45 },
  TurtleHatch: { id: "turtle-hatch", title: "새끼 거북들의 여행", duration: 20 },
  Oarfish: { id: "oarfish", title: "전설의 산갈치", duration: 50 },
  GiantSquid: { id: "giant-squid", title: "심해의 대왕오징어", duration: 40 },
  WhaleSong: { id: "whale-song", title: "혹등고래의 노래", duration: 30 },
  CoralSpawn: { id: "coral-spawn", title: "산호가 알을 낳는 밤", duration: 18 },
  GlowWave: { id: "glow-wave", title: "빛나는 물결", duration: 8 },
  Current: { id: "current", title: "강한 해류", duration: 18 },
  VentBurst: { id: "vent-burst", title: "해저 열수 분출", duration: 6 },
  GoldenDawn: { id: "golden-dawn", title: "황금빛 아침", duration: 20 },
  MeteorShower: { id: "meteor-shower", title: "수면 위 유성우", duration: 14 },
  SunkenAnchor: { id: "sunken-anchor", title: "가라앉는 닻", duration: 20 },
  TreasureChest: { id: "treasure-chest", title: "보물상자가 떨어졌다", duration: 26 },
  MessageBottle: { id: "message-bottle", title: "병 속의 편지", duration: 20 },
  TreatBasket: { id: "treat-basket", title: "간식 바구니가 내려온다", duration: 30 },
  Diver: { id: "diver", title: "잠수부의 탐사", duration: 45 },
  Submarine: { id: "submarine", title: "탐사 잠수정", duration: 40 },
  FeedingFrenzy: { id: "feeding-frenzy", title: "산호초 물고기 먹이 시간", duration: 24 },
  PelagicRush: { id: "pelagic-rush", title: "대형 회유어의 질주", duration: 12 },
  SharkNap: { id: "shark-nap", title: "모래 위 상어의 낮잠", duration: 40 },
  RaySquadron: { id: "ray-squadron", title: "가오리 편대 비행", duration: 45 },
  WhalePass: { id: "whale-pass", title: "고래가 지나간다", duration: 60 },
  SurfaceBreath: { id: "surface-breath", title: "숨 쉬러 수면으로", duration: 32 },
  FloorMarch: { id: "floor-march", title: "바닥 대행진", duration: 48 },
  DeepVisitors: { id: "deep-visitors", title: "심해에서 온 손님", duration: 34 },
  EelPeek: { id: "eel-peek", title: "곰치가 빼꼼", duration: 26 },
  HideAndSeek: { id: "hide-and-seek", title: "모래 속 숨바꼭질", duration: 28 },
  PufferPanic: { id: "puffer-panic", title: "복어 소동", duration: 20 },
  CleaningStation: { id: "cleaning-station", title: "청소 정거장", duration: 32 },
};

/** 명령행과 도감에서 쓰는 영문 id다. */
export function eventId(kind: EventKind): string {
  return EVENT_INFO[kind].id;
}

export function eventFromId(id: string): EventKind | null {
  return EVENT_KINDS.find((kind) => eventId(kind) === id) ?? null;
}

/** 화면 위 자막과 도감에 쓰는 이름이다. */
export function eventTitle(kind: EventKind): string {
  return EVENT_INFO[kind].title;
}

export function eventRarity(kind: EventKind): Rarity {
  if (isExtra(kind)) return extraRarity(kind);
  switch (kind) {
    case "WhaleShark":
    case "Oarfish":
    case "WhalePass":
      return "Legendary";
    case "RaySquadron":
    case "DeepVisitors":
    case "CleaningStation":
    case "BubbleNet":
    case "SeahorseDance":
    case "JellyBloom":
    case "Sunfish":
    case "TurtleHatch":
    case "GiantSquid":
    case "CoralSpawn":
    case "MeteorShower":
    case "TreasureChest":
    case "Diver":
    case "Submarine":
      return "Rare";
    default:
      return "Common";
  }
}

function eventWhen(kind: EventKind): When {
  if (isExtra(kind)) return extraWhen(kind);
  switch (kind) {
    case "SharkPatrol":
    case "BubbleNet":
    case "ClownHome":
    case "TurtleHatch":
    case "TreatBasket":
      return "Day";
    case "AnglerLantern":
    case "InkEscape":
    case "JellyBloom":
    case "GiantSquid":
    case "CoralSpawn":
    case "GlowWave":
    case "MeteorShower":
    case "Submarine":
      return "Night";
    case "GoldenDawn":
      return "Dawn";
    case "FeedingFrenzy":
    case "PufferPanic":
    case "CleaningStation":
      return "Day";
    case "DeepVisitors":
      return "Night";
    default:
      return "Any";
  }
}

/** 사건이 이어지는 시간(초)이다. 물건처럼 남는 흔적은 사건이 끝나도 따로 남는다. */
export function eventDuration(kind: EventKind): number {
  return EVENT_INFO[kind].duration;
}

/** 진행 중인 사건이다. 등장시킨 생물은 id로 기억한다(목록 순서는 매 frame 바뀐다). */
export class Active {
  kind: EventKind;
  age = 0;
  stage = 0;
  cast: number[] = [];
  timer = 0;

  constructor(kind: EventKind) {
    this.kind = kind;
  }

  /** 사건이 등장시킨 생물 id다. */
  castIds(): number[] {
    return this.cast.slice();
  }
}

/** 사건 시작 때 화면 위에 잠깐 뜨는 자막이다. */
export class Banner {
  static readonly SECONDS = 4.5;
  text: string;
  rarity: Rarity;
  age: number;

  constructor(text: string, rarity: Rarity, age = 0) {
    this.text = text;
    this.rarity = rarity;
    this.age = age;
  }

  /** 0에서 1로 떠올랐다가 사라지는 불투명도다. */
  alpha(): number {
    const value = Math.min(Math.min(this.age / 0.4, 1), (Banner.SECONDS - this.age) / 0.8);
    return Math.min(Math.max(value, 0), 1);
  }
}

export class Director {
  active: Active | null = null;
  banner: Banner | null = null;
  /** 지금까지 시작된 사건이다. 도감이 읽는다. */
  started: EventKind[] = [];
  nextAt = 20;
  cooldown = new Map<EventKind, number>();
  lastLegendary = -600;
}

/** 가라앉는 물건이다. */
export type DebrisKind = "Anchor" | "Chest" | "Bottle" | "Ice";

export class Debris {
  kind: DebrisKind;
  x: number;
  y: number;
  h: number;
  age = 0;
  /** 바닥에 닿은 뒤 지난 시간이다. */
  landed: number | null = null;
  open = false;

  constructor(kind: DebrisKind, x: number, y: number, h: number) {
    this.kind = kind;
    this.x = x;
    this.y = y;
    this.h = h;
  }

  alpha(): number {
    if (this.landed === null) return 1;
    return Math.min(Math.max(1 - (this.landed - 70) / 4, 0), 1);
  }
}

/** 줄에 매달려 내려와 물고기 과자를 흩뿌리고 다시 올라가는 간식 바구니다. */
export interface Hook {
  x: number;
  y: number;
  rising: boolean;
  /** 과자를 뿌린 시간이다. 다 뿌리면 올라간다. */
  poured: number;
}

/** 먼 층을 가로지르는 큰 실루엣이다. */
export type FarKind = "Whale" | "Squid" | "Submarine";

export class FarThing {
  kind: FarKind;
  x: number;
  y: number;
  facing: number;
  anim = 0;
  age = 0;

  constructor(kind: FarKind, facing: number, y: number) {
    // 고래는 멀리서 천천히 들어오고, 사건으로 부른 오징어·잠수정은 곧바로 보이게 가까이서 출발한다.
    const margin = kind === "Whale" ? 130 : 70;
    this.kind = kind;
    this.x = offstage(facing > 0 ? -margin : WIDTH + margin);
    this.y = y;
    this.facing = facing;
  }

  speed(): number {
    switch (this.kind) {
      case "Whale":
        return 9;
      case "Squid":
        return 15;
      case "Submarine":
        return 11;
    }
  }

  /** 한 걸음 움직이고, 화면을 완전히 벗어나면 false다. */
  step(dt: number): boolean {
    this.age = f32(this.age + dt);
    this.x = f32(this.x + f32(this.facing * this.speed() * dt));
    this.anim = f32(this.anim + f32(dt * 4));
    return this.x >= visible.left - 150 && this.x < visible.right + 150;
  }
}

/** 사건 사이 쉬는 시간(초) 범위다. */
const REST: [number, number] = [22, 40];
/** 전설 사건 사이 최소 간격이다. */
export const LEGENDARY_GAP = 1200;

function weight(kind: EventKind): number {
  switch (eventRarity(kind)) {
    case "Common":
      return 10;
    case "Rare":
      return 4;
    case "Legendary":
      return 1.5;
  }
}

/** 희귀도 가중치로 후보 하나를 고른다. 합과 뺄셈을 f32로 맞춰 기준 기록과 같은 경계를 쓴다. */
function weightedPick(game: Aquarium, candidates: EventKind[]): EventKind {
  const total = candidates.reduce((sum, kind) => Math.fround(sum + weight(kind)), 0);
  let roll = Math.fround(game.random() * total);
  for (const kind of candidates) {
    roll = Math.fround(roll - weight(kind));
    if (roll <= 0) {
      return kind;
    }
  }
  return candidates[candidates.length - 1];
}

/** 사건 하나를 바로 시작한다. 이미 진행 중인 사건은 끝낸다. */
export function triggerEvent(game: Aquarium, kind: EventKind): void {
  const previous = game.director.active;
  game.director.active = null;
  if (previous !== null) {
    finishEvent(game, previous);
  }
  game.director.banner = new Banner(eventTitle(kind), eventRarity(kind));
  if (!game.director.started.includes(kind)) {
    game.director.started.push(kind);
  }
  if (eventRarity(kind) === "Legendary") {
    game.director.lastLegendary = game.time;
  }
  const active = new Active(kind);
  startEvent(game, active);
  game.director.active = active;
}

/** 조건이 맞는 사건 가운데 희귀도 가중치로 하나를 골라 바로 시작한다. 없으면 false다. */
export function triggerRandomEvent(game: Aquarium): boolean {
  const candidates = EVENT_KINDS.filter((kind) => eventAllowed(game, kind, true));
  if (candidates.length === 0) {
    return false;
  }
  // 굴림이 남으면 마지막 후보를 고른다(weightedPick의 끝 처리).
  triggerEvent(game, weightedPick(game, candidates));
  return true;
}

function eventAllowed(game: Aquarium, kind: EventKind, ignoreCooldown: boolean): boolean {
  const daylight = game.daylight();
  let timeOk: boolean;
  switch (eventWhen(kind)) {
    case "Any":
      timeOk = true;
      break;
    case "Day":
      timeOk = daylight > 0.5;
      break;
    case "Night":
      timeOk = daylight < 0.3;
      break;
    case "Dawn":
      timeOk = daylight >= 0.3 && daylight < 0.7 && brightening(game);
      break;
  }
  const until = game.director.cooldown.get(kind);
  const cooled = ignoreCooldown || until === undefined || game.time >= until;
  const legendaryOk =
    eventRarity(kind) !== "Legendary" ||
    ignoreCooldown ||
    game.time - game.director.lastLegendary >= LEGENDARY_GAP;
  // 컨셉 전용 사건(오로라·룬 등)은 그 배경일 때만 일어난다.
  let needs = !isExtra(kind) || extraSceneOk(game, kind);
  if (kind === "SharkPatrol" || kind === "BubbleNet") {
    needs = game.schools.length > 0;
  } else if (kind === "WhaleSong") {
    needs = !game.farThings.some((thing) => thing.kind === "Whale");
  }
  return timeOk && cooled && legendaryOk && needs && !game.weather.active();
}

/** 해가 떠오르는 중인지(새벽인지) 알려 준다. */
function brightening(game: Aquarium): boolean {
  return Math.sin((TAU * game.time) / 240) > 0;
}

export function stepDirector(game: Aquarium, dt: number): void {
  const banner = game.director.banner;
  if (banner !== null) {
    banner.age = f32(banner.age + dt);
    if (banner.age > Banner.SECONDS) {
      game.director.banner = null;
    }
  }
  const active = game.director.active;
  if (active !== null) {
    game.director.active = null;
    active.age = f32(active.age + dt);
    active.timer = f32(active.timer - dt);
    const alive = stepEvent(game, active, dt) && active.age < eventDuration(active.kind);
    if (alive) {
      game.director.active = active;
    } else {
      finishEvent(game, active);
      const rest = f32(REST[0] + f32(game.random() * (REST[1] - REST[0])));
      game.director.nextAt = f32(game.time + rest);
      const rarity = eventRarity(active.kind);
      const cooldown = rarity === "Common" ? 90 : rarity === "Rare" ? 240 : LEGENDARY_GAP;
      game.director.cooldown.set(active.kind, f32(game.time + cooldown));
    }
  } else if (game.started && game.time >= game.director.nextAt) {
    const candidates = EVENT_KINDS.filter((kind) => eventAllowed(game, kind, false));
    if (candidates.length === 0) {
      game.director.nextAt = f32(game.time + 10);
    } else {
      const total = candidates.reduce((sum, kind) => Math.fround(sum + weight(kind)), 0);
      let roll = Math.fround(game.random() * total);
      let chosen: EventKind = candidates[0];
      for (const kind of candidates) {
        roll = Math.fround(roll - weight(kind));
        if (roll <= 0) {
          chosen = kind;
          break;
        }
      }
      triggerEvent(game, chosen);
    }
  }
  stepProps(game, dt);
}

export function actorById(game: Aquarium, id: number): number | null {
  const index = game.actors.findIndex((actor) => actor.id === id);
  return index < 0 ? null : index;
}

/** 종 id의 생물 하나를 지정 위치에 등장시키고 id를 돌려준다. */
export function cast(game: Aquarium, species: string, x: number, y: number, facing: number): number | null {
  const index = game.indexOf(species);
  if (index === null) return null;
  const slot = game.spawn(index, false);
  const actor = game.actors[slot];
  // 무대 밖 등장 자리는 휴대폰 여백 바깥까지 민다(긴 화면 여백에서 갑자기 나타나지 않게).
  x = offstage(x);
  actor.x = x;
  actor.y = y;
  actor.targetY = y;
  actor.facing = facing;
  actor.depth = 1;
  actor.age = 0;
  actor.tentacles = actor.tentacles.map(
    (tentacle) => new Tentacle(tentacle.anchor, [x, y], tentacle.points.length - 1, 3, actor.phase),
  );
  return actor.id;
}

/** 이미 화면에 있는 종을 쓰거나 없으면 새로 부른다. */
export function recruit(game: Aquarium, species: string, x: number, y: number, facing: number): number | null {
  const index = game.indexOf(species);
  if (index === null) return null;
  const found = game.actors.find(
    (actor) => actor.species === index && actor.depth === 1 && actor.school === null && actor.script === null,
  );
  if (found !== undefined) {
    return found.id;
  }
  return cast(game, species, x, y, facing);
}

/** 사건이 등장시키거나 반응시키는 종 목록이다. 모든 종(잠수부 제외)이 적어도 한 사건의 후보에 든다. */
export function eventPool(game: Aquarium, kind: EventKind): number[] {
  if (isExtra(kind)) return extraPool(game, kind);
  const named = (ids: string[]): number[] =>
    ids.map((id) => game.indexOf(id)).filter((index): index is number => index !== null);
  let groups: string[];
  let motions: string[] = [];
  let visitors = false;
  switch (kind) {
    case "SharkPatrol":
      groups = ["shark", "school"];
      break;
    case "BubbleNet":
      groups = ["dolphin", "school"];
      break;
    case "AnglerLantern":
      return named(["anglerfish", "mandarinfish"]);
    case "InkEscape":
      groups = ["ceph"];
      break;
    case "ClownHome":
      groups = ["clown"];
      break;
    case "CrabStandoff":
      groups = ["crust"];
      motions = ["crawl"];
      break;
    case "SeahorseDance":
      groups = ["seahorse"];
      break;
    case "JellyBloom":
      groups = ["jelly"];
      break;
    case "MantaRoll":
    case "RaySquadron":
      groups = ["ray"];
      motions = ["flap"];
      break;
    case "WhaleShark":
      return named(["whale-shark", "yellow-tang"]);
    case "Sunfish":
      return named(["sunfish"]);
    case "TurtleHatch":
      return named(["baby-turtle"]);
    case "Oarfish":
      return named(["oarfish"]);
    case "Diver":
      return named(["diver"]);
    case "FeedingFrenzy":
      groups = ["reef", "clown"];
      break;
    case "PelagicRush":
      groups = ["pelagic"];
      break;
    case "SharkNap":
      groups = ["bottomshark", "ray"];
      motions = ["giant", "creep"];
      break;
    case "WhalePass":
      groups = ["whale"];
      visitors = true;
      break;
    case "SurfaceBreath":
      groups = ["pinniped", "turtle"];
      break;
    case "FloorMarch":
      groups = ["crust", "nudi"];
      break;
    case "DeepVisitors":
      groups = ["deep"];
      break;
    case "EelPeek":
      groups = ["eel"];
      break;
    case "HideAndSeek":
      groups = ["camo"];
      break;
    case "PufferPanic":
      groups = ["puffer"];
      break;
    case "CleaningStation": {
      const pool = groupPool(game, ["bigreef"], [], false);
      return pool.concat(named(["cleaner-wrasse", "cleaner-shrimp"]));
    }
    case "Current":
      groups = ["cold"];
      break;
    case "GlowWave":
      // 빛나는 물결을 따라 밤 무리(샛비늘치·은도끼고기·반딧불오징어)가 함께 헤엄친다.
      return groupPool(game, ["school"], [], false).filter((index) => game.species[index].activity === "night");
    case "CoralSpawn":
      groups = ["sessile"];
      break;
    default:
      return [];
  }
  return groupPool(game, groups, motions, visitors);
}

export function groupPool(game: Aquarium, groups: string[], motions: string[], visitors: boolean): number[] {
  const out: number[] = [];
  game.species.forEach((entry, index) => {
    if (!groups.includes(entry.group)) return;
    if (motions.length > 0 && !motions.includes(entry.motion)) return;
    if (!visitors && entry.visitor) return;
    if (entry.id === "diver") return;
    out.push(index);
  });
  return out;
}

/** 후보 가운데 조건에 맞는 종 하나를 무작위로 고른다. 후보가 없으면 난수를 쓰지 않는다. */
export function pick(game: Aquarium, pool: number[], rule: (entry: Species) => boolean): number | null {
  const fits = pool.filter((index) => rule(game.species[index]));
  if (fits.length === 0) {
    return null;
  }
  const roll = game.random();
  return fits[pickIndex(roll, fits.length)];
}

const any = (): boolean => true;

/** 종 번호로 한 마리를 지정 위치에 등장시킨다. */
export function castIndex(game: Aquarium, index: number, x: number, y: number, facing: number): number | null {
  return cast(game, game.species[index].id, x, y, facing);
}

/** 바닥 생물이 설 높이다. */
export function floorY(game: Aquarium, index: number): number {
  return FLOOR_Y - game.species[index].frameH * 0.5 + 3;
}

export function setScript(game: Aquarium, id: number, script: Script | null): void {
  const slot = actorById(game, id);
  if (slot !== null) {
    game.actors[slot].script = script;
  }
}

/** 사건이 끝나면 스크립트를 풀어 평소대로 헤엄치게 하고, 잠깐 등장한 생물은 떠나게 한다. */
function finishEvent(game: Aquarium, active: Active): void {
  for (const id of active.cast) {
    const slot = actorById(game, id);
    if (slot !== null) {
      const actor = game.actors[slot];
      actor.script = null;
      actor.roll = 0;
      actor.targetY = actor.y;
    }
  }
  if (isExtra(active.kind)) finishExtra(game, active);
  switch (active.kind) {
    case "Current":
      game.current = 0;
      break;
    case "GlowWave":
      game.glowWave = null;
      break;
    case "GoldenDawn":
      game.golden = 0;
      break;
    case "BubbleNet":
    case "SharkPatrol":
      for (const school of game.schools) {
        school.lift = 0;
      }
      break;
    default:
      break;
  }
}

function schoolCenter(game: Aquarium): [number, number] | null {
  const members = game.actors.filter((actor) => actor.school !== null);
  if (members.length === 0) {
    return null;
  }
  const n = members.length;
  let sx = 0;
  let sy = 0;
  for (const actor of members) {
    sx += actor.x;
    sy += actor.y;
  }
  return [sx / n, sy / n];
}

export function edgeFacing(game: Aquarium): [number, number] {
  const facing = game.random() < 0.5 ? 1 : -1;
  return [facing > 0 ? -40 : WIDTH + 40, facing];
}

/** 무리가 없으면 낮 무리 하나를 부른다(상어 순찰·기포 그물). */
function ensureDaySchool(game: Aquarium): void {
  if (game.schools.length === 0) {
    const pool = groupPool(game, ["school"], [], false);
    const index = pick(game, pool, (entry) => entry.activity !== "night");
    if (index !== null) {
      game.spawnSchool(index, false);
    }
  }
}

function startEvent(game: Aquarium, active: Active): void {
  if (isExtra(active.kind)) {
    startExtra(game, active);
    return;
  }
  switch (active.kind) {
    case "SharkPatrol": {
      // 상어의 순찰: 상어가 무리 한가운데를 지나가면 무리가 흩어졌다가 다시 모인다(잡아먹지 않는다).
      ensureDaySchool(game);
      const [cx, cy] = schoolCenter(game) ?? [WIDTH * 0.5, 120];
      const [x, facing] = edgeFacing(game);
      const pool = groupPool(game, ["shark"], ["giant"], false);
      const index = pick(game, pool, any);
      if (index !== null) {
        const id = castIndex(game, index, x, cy, facing);
        if (id !== null) {
          setScript(game, id, goto(cx, cy, 40));
          active.cast.push(id);
        }
      }
      break;
    }
    case "BubbleNet": {
      ensureDaySchool(game);
      const [cx, cy] = schoolCenter(game) ?? [WIDTH * 0.5, 130];
      const pool = groupPool(game, ["dolphin"], [], false);
      const index = pick(game, pool, any);
      if (index !== null) {
        const id = castIndex(game, index, -50, cy, 1);
        if (id !== null) {
          setScript(game, id, { kind: "Orbit", cx, cy, rx: 90, ry: 42, angle: TAU * 0.5, rate: 1 });
          active.cast.push(id);
        }
      }
      for (const school of game.schools) {
        school.lift = -35;
      }
      break;
    }
    case "AnglerLantern": {
      // 초롱아귀의 등불: 작은 물고기가 불빛에 이끌려 구경 오고, 불빛이 번쩍하면 놀라 달아난다.
      const id = recruit(game, "anglerfish", WIDTH + 30, 140, -1);
      if (id !== null) {
        setScript(game, id, goto(300, 140, 14));
        active.cast.push(id);
      }
      const visitor = cast(game, "mandarinfish", -30, 150, 1);
      if (visitor !== null) {
        setScript(game, visitor, goto(150, 150, 12));
        active.cast.push(visitor);
      }
      break;
    }
    case "InkEscape": {
      const pool = groupPool(game, ["ceph"], ["octopus", "squid"], false);
      const index = pick(game, pool, any);
      if (index !== null) {
        const id = castIndex(game, index, 230, 175, 1);
        if (id !== null) {
          setScript(game, id, goto(230, 175, 20));
          active.cast.push(id);
        }
      }
      const sharks = groupPool(game, ["shark"], ["giant"], false);
      const sharkIndex = pick(game, sharks, any);
      if (sharkIndex !== null) {
        const shark = castIndex(game, sharkIndex, -40, 168, 1);
        if (shark !== null) {
          setScript(game, shark, goto(WIDTH + 80, 168, 30));
          active.cast.push(shark);
        }
      }
      break;
    }
    case "ClownHome": {
      const pool = eventPool(game, active.kind);
      const index = pick(game, pool, any);
      if (index !== null) {
        const id = recruit(game, game.species[index].id, WIDTH + 20, 170, -1);
        if (id !== null) {
          setScript(game, id, goto(94, 238, 32));
          active.cast.push(id);
        }
      }
      break;
    }
    case "CrabStandoff": {
      const pool = eventPool(game, active.kind);
      const index = pick(game, pool, any);
      if (index !== null) {
        const floor = floorY(game, index);
        const left = castIndex(game, index, 70, floor, 1);
        const right = castIndex(game, index, WIDTH - 70, floor, -1);
        for (const [id, x] of [
          [left, 222],
          [right, 258],
        ] as [number | null, number][]) {
          if (id !== null) {
            setScript(game, id, goto(x, floor, 22));
            active.cast.push(id);
          }
        }
      }
      break;
    }
    case "SeahorseDance": {
      const pool = eventPool(game, active.kind);
      const index = pick(game, pool, any);
      if (index !== null) {
        const cx = 240;
        const cy = 160;
        for (const [slot, x] of [
          [0, -20],
          [1, WIDTH + 20],
        ] as [number, number][]) {
          const id = castIndex(game, index, x, cy, slot === 0 ? 1 : -1);
          if (id !== null) {
            setScript(game, id, { kind: "Orbit", cx, cy, rx: 12, ry: 7, angle: slot * TAU * 0.5, rate: 1.4 });
            active.cast.push(id);
          }
        }
      }
      break;
    }
    case "JellyBloom": {
      const pool = eventPool(game, active.kind);
      const index = pick(game, pool, any);
      if (index !== null) {
        const id = game.species[index].id;
        for (let slot = 0; slot < 11; slot += 1) {
          const x = 30 + slot * 40 + (game.random() - 0.5) * 20;
          const y = HEIGHT + 30 + game.random() * 60;
          const castId = cast(game, id, x, y, 1);
          if (castId !== null) {
            const target = 50 + game.random() * 120;
            const found = actorById(game, castId);
            if (found !== null) {
              game.actors[found].targetY = target;
              game.actors[found].lifespan = f32(25 + f32(game.random() * 10));
            }
          }
        }
      }
      break;
    }
    case "MantaRoll": {
      const pool = eventPool(game, active.kind);
      const index = pick(game, pool, any);
      if (index !== null) {
        const [x, facing] = edgeFacing(game);
        const id = recruit(game, game.species[index].id, x, 110, facing);
        if (id !== null) {
          active.cast.push(id);
          active.timer = 2.5;
        }
      }
      break;
    }
    case "WhaleShark": {
      const [x, facing] = edgeFacing(game);
      const id = cast(game, "whale-shark", x * 1.8 - (facing > 0 ? 0 : WIDTH * 0.8), 115, facing);
      if (id !== null) {
        active.cast.push(id);
        for (const [dx, dy] of [
          [20, 26],
          [-10, 30],
          [40, 24],
          [-35, 27],
        ] as [number, number][]) {
          const pilot = cast(game, "yellow-tang", x, 140, facing);
          if (pilot !== null) {
            setScript(game, pilot, { kind: "Follow", leader: id, dx, dy });
            active.cast.push(pilot);
          }
        }
      }
      break;
    }
    case "Sunfish": {
      const [x, facing] = edgeFacing(game);
      const id = cast(game, "sunfish", x, 110, facing);
      if (id !== null) {
        active.cast.push(id);
      }
      break;
    }
    case "TurtleHatch": {
      for (let index = 0; index < 6; index += 1) {
        const x = 190 + index * 18 + (game.random() - 0.5) * 10;
        const id = cast(game, "baby-turtle", x, FLOOR_Y - 6, index % 2 === 0 ? 1 : -1);
        if (id !== null) {
          const targetX = x + (game.random() - 0.5) * 160;
          const speed = 13 + game.random() * 7;
          setScript(game, id, goto(targetX, -40, speed));
          active.cast.push(id);
        }
      }
      break;
    }
    case "Oarfish": {
      const [x, facing] = edgeFacing(game);
      const id = cast(game, "oarfish", x * 2.2 - (facing > 0 ? 0 : WIDTH * 1.2), 150, facing);
      if (id !== null) {
        active.cast.push(id);
      }
      break;
    }
    case "GiantSquid": {
      const facing = game.random() < 0.5 ? 1 : -1;
      game.farThings.push(new FarThing("Squid", facing, 110));
      break;
    }
    case "WhaleSong": {
      const facing = game.random() < 0.5 ? 1 : -1;
      const whale = new FarThing("Whale", facing, 85);
      whale.x = facing > 0 ? 40 : WIDTH - 40;
      game.farThings.push(whale);
      break;
    }
    case "Current": {
      game.currentSign = game.random() < 0.5 ? 1 : -1;
      // 한류를 타고 찬 바다 물고기가 흘러든다.
      const pool = eventPool(game, active.kind);
      for (let rank = 0; rank < 3; rank += 1) {
        const index = pick(game, pool, any);
        if (index === null) break;
        const x = game.currentSign > 0 ? -40 - rank * 40 : WIDTH + 40 + rank * 40;
        const y = 90 + rank * 40;
        const id = castIndex(game, index, x, y, game.currentSign);
        if (id !== null) {
          active.cast.push(id);
        }
      }
      const turtle = recruit(game, "green-turtle", 240, 120, -game.currentSign);
      if (turtle !== null) {
        active.cast.push(turtle);
      }
      break;
    }
    case "GlowWave": {
      game.glowWave = 0;
      const pool = eventPool(game, active.kind);
      if (game.schools.length === 0) {
        const index = pick(game, pool, any);
        if (index !== null) {
          game.spawnSchool(index, false);
        }
      }
      break;
    }
    case "VentBurst":
      game.shake = 1.4;
      startle(game, 240, FLOOR_Y, 150);
      break;
    case "GoldenDawn":
      game.golden = 0;
      break;
    case "SunkenAnchor":
    case "TreasureChest":
    case "MessageBottle": {
      const kind: DebrisKind =
        active.kind === "SunkenAnchor" ? "Anchor" : active.kind === "TreasureChest" ? "Chest" : "Bottle";
      const x = 120 + game.random() * 240;
      const h = kind === "Anchor" ? 40 : kind === "Chest" ? 26 : 16;
      retain(game.debris, (item) => item.kind !== kind);
      game.debris.push(new Debris(kind, x, -30, h));
      break;
    }
    case "TreatBasket": {
      const x = 150 + game.random() * 180;
      game.hook = { x, y: -10, rising: false, poured: 0 };
      break;
    }
    case "Diver": {
      const [x, facing] = edgeFacing(game);
      const id = cast(game, "diver", x, 105, facing);
      if (id !== null) {
        active.cast.push(id);
      }
      break;
    }
    case "Submarine": {
      const facing = game.random() < 0.5 ? 1 : -1;
      game.farThings.push(new FarThing("Submarine", facing, 95));
      break;
    }
    case "FeedingFrenzy": {
      // 물고기 과자를 뿌리면 산호초 물고기들이 몰려와 먹는다.
      const pool = eventPool(game, active.kind);
      for (let slot = 0; slot < 7; slot += 1) {
        const index = pick(game, pool, (entry) => entry.motion === "fish");
        if (index === null) break;
        const facing = slot % 2 === 0 ? 1 : -1;
        const x = facing > 0 ? -30 : WIDTH + 30;
        const y = 90 + game.random() * 100;
        const id = castIndex(game, index, x, y, facing);
        if (id !== null) {
          active.cast.push(id);
        }
      }
      break;
    }
    case "PelagicRush": {
      const pool = eventPool(game, active.kind);
      const index = pick(game, pool, any);
      if (index !== null) {
        const [x, facing] = edgeFacing(game);
        const width = game.species[index].frameW;
        const count = width < 70 ? 3 : 1;
        for (let rank = 0; rank < count; rank += 1) {
          const start = x - facing * (width * 0.6 + rank * 30);
          const y = 95 + rank * 26 + game.random() * 20;
          const id = castIndex(game, index, start, y, facing);
          if (id !== null) {
            const end = facing > 0 ? WIDTH + width : -width;
            setScript(game, id, goto(end, y, 78));
            active.cast.push(id);
          }
        }
      }
      break;
    }
    case "SharkNap": {
      const pool = eventPool(game, active.kind);
      const index = pick(game, pool, any);
      if (index !== null) {
        const [x, facing] = edgeFacing(game);
        const spot = 170 + game.random() * 140;
        const floor = floorY(game, index);
        const id = castIndex(game, index, x, floor - 40, facing);
        if (id !== null) {
          setScript(game, id, goto(spot, floor, 20));
          active.cast.push(id);
        }
      }
      break;
    }
    case "RaySquadron": {
      const pool = eventPool(game, active.kind);
      const index = pick(game, pool, any);
      if (index !== null) {
        const [x, facing] = edgeFacing(game);
        const width = game.species[index].frameW;
        const leader = castIndex(game, index, x - facing * width * 0.5, 95, facing);
        if (leader !== null) {
          const end = facing > 0 ? WIDTH + width * 2 : -width * 2;
          setScript(game, leader, goto(end, 95, 16));
          active.cast.push(leader);
          for (const [dx, dy] of [
            [-width * 0.7, -26],
            [-width * 0.7, 26],
            [-width * 1.4, 0],
          ] as [number, number][]) {
            const id = castIndex(game, index, x - facing * width, 95 + dy, facing);
            if (id !== null) {
              setScript(game, id, { kind: "Follow", leader, dx, dy });
              active.cast.push(id);
            }
          }
        }
      }
      break;
    }
    case "WhalePass": {
      const pool = eventPool(game, active.kind);
      const index = pick(game, pool, any);
      if (index !== null) {
        const facing = game.random() < 0.5 ? 1 : -1;
        const width = game.species[index].frameW;
        const x = facing > 0 ? -width * 0.55 : WIDTH + width * 0.55;
        const y = 70 + game.random() * 30;
        const id = castIndex(game, index, x, y, facing);
        if (id !== null) {
          const end = facing > 0 ? WIDTH + width * 0.6 : -width * 0.6;
          setScript(game, id, goto(end, y, 11));
          active.cast.push(id);
        }
      }
      break;
    }
    case "SurfaceBreath": {
      const pool = eventPool(game, active.kind);
      const index = pick(game, pool, any);
      if (index !== null) {
        const [x, facing] = edgeFacing(game);
        const spot = 190 + game.random() * 100;
        const id = castIndex(game, index, x, 180, facing);
        if (id !== null) {
          setScript(game, id, goto(spot, 32, 24));
          active.cast.push(id);
        }
      }
      break;
    }
    case "FloorMarch": {
      const pool = eventPool(game, active.kind);
      const first = pick(game, pool, any);
      const second = pick(game, pool, any);
      const facing = game.random() < 0.5 ? 1 : -1;
      const edge = facing > 0 ? -24 : WIDTH + 24;
      for (let rank = 0; rank < 5; rank += 1) {
        const index = rank % 2 === 0 ? first : second;
        if (index === null) continue;
        const y = grounded(game.species[index]) ? floorY(game, index) : 226;
        const x = edge - facing * rank * 30;
        const id = castIndex(game, index, x, y, facing);
        if (id !== null) {
          const end = facing > 0 ? WIDTH + 60 : -60;
          setScript(game, id, goto(end, y, 11));
          active.cast.push(id);
        }
      }
      break;
    }
    case "DeepVisitors": {
      const pool = eventPool(game, active.kind);
      for (let slot = 0; slot < 3; slot += 1) {
        const index = pick(game, pool, any);
        if (index === null) break;
        const x = 110 + slot * 130 + (game.random() - 0.5) * 40;
        if (grounded(game.species[index])) {
          const floor = floorY(game, index);
          const id = castIndex(game, index, x, floor, 1);
          if (id !== null) {
            active.cast.push(id);
          }
        } else {
          const id = castIndex(game, index, x, HEIGHT + 30, slot % 2 === 0 ? 1 : -1);
          if (id !== null) {
            const target = 120 + game.random() * 60;
            setScript(game, id, goto(x, target, 12));
            active.cast.push(id);
          }
        }
      }
      break;
    }
    case "EelPeek": {
      const pool = eventPool(game, active.kind);
      const spots: [number, number][] = [
        [0, 70],
        [1, 410],
      ];
      for (const [slot, x] of spots) {
        const index = pick(game, pool, (entry) => entry.motion === "eel");
        if (index === null) break;
        const facing = slot === 0 ? 1 : -1;
        const id = castIndex(game, index, x, HEIGHT + 14, facing);
        if (id !== null) {
          setScript(game, id, goto(x + facing * 16, 226, 9));
          active.cast.push(id);
        }
      }
      const garden = pick(game, pool, (entry) => entry.motion === "sessile");
      if (garden !== null) {
        for (let rank = 0; rank < 4; rank += 1) {
          const x = 200 + rank * 22;
          const floor = floorY(game, garden);
          const id = castIndex(game, garden, x, floor, 1);
          if (id !== null) {
            active.cast.push(id);
          }
        }
      }
      break;
    }
    case "HideAndSeek": {
      // 모래 속 숨바꼭질: 모래색 물고기가 숨어 있다가 지나가는 물고기를 깜짝 놀래 준다.
      const pool = eventPool(game, active.kind);
      const index = pick(game, pool, any);
      if (index !== null) {
        const [x, facing] = edgeFacing(game);
        const floor = Math.min(floorY(game, index), FLOOR_Y - 12);
        const id = castIndex(game, index, x, floor, facing);
        if (id !== null) {
          setScript(game, id, goto(240, floor, 20));
          active.cast.push(id);
        }
      }
      break;
    }
    case "PufferPanic": {
      const pool = eventPool(game, active.kind);
      for (let slot = 0; slot < 3; slot += 1) {
        const index = pick(game, pool, any);
        if (index === null) break;
        const [x, facing] = edgeFacing(game);
        const spot: [number, number] = [170 + slot * 60, 120 + slot * 22];
        const id = castIndex(game, index, x, spot[1], facing);
        if (id !== null) {
          setScript(game, id, goto(spot[0], spot[1], 18));
          active.cast.push(id);
        }
      }
      break;
    }
    case "CleaningStation": {
      const pool = groupPool(game, ["bigreef"], [], false);
      const index = pick(game, pool, any);
      if (index !== null) {
        const [x, facing] = edgeFacing(game);
        const id = castIndex(game, index, x, 140, facing);
        if (id !== null) {
          setScript(game, id, goto(240, 140, 16));
          active.cast.push(id);
        }
      }
      break;
    }
    case "CoralSpawn": {
      // 바닥 생물 서너 종이 모습을 드러내고 함께 알을 뿜는다.
      const pool = eventPool(game, active.kind);
      for (const x of [150, 205, 280, 330]) {
        const index = pick(game, pool, any);
        if (index === null) break;
        const floor = floorY(game, index);
        const id = castIndex(game, index, x, floor, 1);
        if (id !== null) {
          active.cast.push(id);
        }
      }
      break;
    }
    case "MeteorShower":
      break;
  }
}

/** 등장 생물 가운데 하나라도 화면에 남아 있는지다. */
function anyAlive(game: Aquarium, active: Active): boolean {
  return active.cast.some((id) => actorById(game, id) !== null);
}

/** 사건 한 frame을 진행한다. false면 끝났다. */
function stepEvent(game: Aquarium, active: Active, dt: number): boolean {
  if (isExtra(active.kind)) return stepExtra(game, active, dt);
  switch (active.kind) {
    case "SharkPatrol": {
      if (active.cast.length === 0) return false;
      const slot = actorById(game, active.cast[0]);
      if (slot === null) return false;
      const sx = game.actors[slot].x;
      const facing = game.actors[slot].facing;
      const center = schoolCenter(game);
      if (center !== null && (center[0] - sx) * facing > -20) {
        // 무리를 지나칠 때까지 무리 한가운데를 겨누고 쫓는다.
        game.actors[slot].script = goto(center[0] + facing * 120, center[1], 46);
      }
      if (active.stage === 0) {
        active.stage = 1;
      }
      return true;
    }
    case "BubbleNet": {
      if (active.cast.length > 0) {
        const slot = actorById(game, active.cast[0]);
        if (slot !== null) {
          const actor = game.actors[slot];
          const x = actor.x;
          const y = actor.y;
          const center = schoolCenter(game);
          if (center !== null && actor.script !== null && actor.script.kind === "Orbit") {
            actor.script.cx += (center[0] - actor.script.cx) * dt * 0.5;
            actor.script.cy += (center[1] - actor.script.cy) * dt * 0.5;
          }
          if (active.timer <= 0) {
            active.timer = f32(0.06);
            const seed = game.random();
            game.particles.push(new Particle("Bubble", x, y + 6, (seed - 0.5) * 4, -18 - seed * 10, 5, seed));
          }
          if (active.age > 13) {
            actor.script = null;
            actor.lifespan = 0;
          }
        }
      }
      return true;
    }
    case "AnglerLantern": {
      if (active.cast.length < 2) return false;
      const a = actorById(game, active.cast[0]);
      const p = actorById(game, active.cast[1]);
      if (a === null || p === null) {
        return active.age < 16;
      }
      const lure = glowPoint(game, a);
      if (active.age > 3 && active.stage === 0) {
        game.actors[p].script = goto(lure[0] - 6 * signum(game.actors[a].facing), lure[1] + 2, 7);
      }
      const px = game.actors[p].x;
      const py = game.actors[p].y;
      if (active.stage === 0 && Math.hypot(px - lure[0], py - lure[1]) < 9) {
        // 등불이 번쩍하면 구경하던 물고기가 깜짝 놀라 달아난다.
        active.stage = 1;
        flashAt(game, lure[0], lure[1], "Spark", 10);
        const prey = game.actors[p];
        prey.script = null;
        prey.facing = px < lure[0] ? -1 : 1;
        prey.turn = f32(TURN_SECONDS);
        prey.burst = f32(1.8);
      }
      return true;
    }
    case "InkEscape": {
      if (active.cast.length < 2) return false;
      const o = actorById(game, active.cast[0]);
      const s = actorById(game, active.cast[1]);
      if (o === null || s === null) {
        return true;
      }
      const distance = Math.abs(game.actors[s].x - game.actors[o].x);
      if (active.stage === 0 && distance < 90) {
        active.stage = 1;
        const ox = game.actors[o].x;
        const oy = game.actors[o].y;
        for (let index = 0; index < 28; index += 1) {
          const angle = index * 0.9;
          const speed = 6 + game.random() * 18;
          const seed = game.random();
          game.particles.push(
            new Particle("Ink", ox, oy, Math.cos(angle) * speed, Math.sin(angle) * speed, 5 + seed * 2, seed),
          );
        }
        const away = game.actors[s].x < ox ? 1 : -1;
        game.actors[o].script = goto(ox + away * 160, oy + 30, 70);
      }
      return true;
    }
    case "ClownHome": {
      if (active.cast.length === 0) return false;
      const slot = actorById(game, active.cast[0]);
      if (slot === null) return false;
      const home = Math.abs(game.actors[slot].x - 94) < 3 && Math.abs(game.actors[slot].y - 238) < 3;
      if (active.stage === 0 && home) {
        active.stage = 1;
        active.timer = 5;
      } else if (active.stage === 1 && active.timer <= 0) {
        active.stage = 2;
        game.actors[slot].script = goto(150, 200, 16);
      }
      return true;
    }
    case "CrabStandoff": {
      const slots = active.cast.map((id) => actorById(game, id)).filter((slot): slot is number => slot !== null);
      if (slots.length < 2) {
        return false;
      }
      const close = Math.abs(game.actors[slots[0]].x - game.actors[slots[1]].x) < 40;
      if (active.stage === 0 && close) {
        active.stage = 1;
        active.timer = 3.5;
        for (const [slot, facing] of [
          [slots[0], 1],
          [slots[1], -1],
        ] as [number, number][]) {
          game.actors[slot].facing = facing;
          const x = game.actors[slot].x;
          const y = game.actors[slot].y;
          game.particles.push(new Particle("Exclaim", x, y - 18, 0, -2, 1.4, 0));
        }
      } else if (active.stage === 1 && active.timer <= 0) {
        active.stage = 2;
        const loser = game.random() < 0.5 ? slots[0] : slots[1];
        const away = loser === slots[0] ? -60 : WIDTH + 60;
        const y = game.actors[loser].y;
        game.actors[loser].script = goto(away, y, 28);
        game.actors[loser].lifespan = 0;
      }
      return true;
    }
    case "SeahorseDance": {
      if (active.timer <= 0) {
        active.timer = f32(0.7);
        const seed = game.random();
        game.particles.push(new Particle("Heart", 240 + (seed - 0.5) * 20, 150, 0, -9, 2.2, seed));
      }
      return true;
    }
    case "MantaRoll": {
      if (active.cast.length > 0) {
        const slot = actorById(game, active.cast[0]);
        if (slot !== null && active.timer <= 0 && active.stage === 0) {
          active.stage = 1;
          game.actors[slot].roll = f32(2.2);
        }
      }
      return true;
    }
    case "WhaleShark":
    case "Sunfish":
    case "Oarfish":
    case "Diver": {
      const alive = active.cast.length > 0 && actorById(game, active.cast[0]) !== null;
      if (active.kind === "Diver" && active.cast.length > 0) {
        const slot = actorById(game, active.cast[0]);
        if (slot !== null) {
          if (active.timer <= 0) {
            active.timer = f32(1.3);
            const x = game.actors[slot].x + game.actors[slot].facing * 10;
            const y = game.actors[slot].y - 8;
            for (let bead = 0; bead < 3; bead += 1) {
              const seed = game.random();
              game.particles.push(
                new Particle("Bubble", x, y - bead * 3, (seed - 0.5) * 3, -16 - seed * 6, 6, seed),
              );
            }
          }
          if (f32(active.age % 7) < dt) {
            game.photo = 1;
          }
        }
      }
      return alive || active.age < 3;
    }
    case "TurtleHatch":
      return anyAlive(game, active);
    case "CoralSpawn": {
      if (active.age < 12) {
        const sources = [24, 62, 94, 128, 160, 324, 352, 392, 428, 462];
        for (let n = 0; n < 4; n += 1) {
          const source = sources[pickIndex(game.random(), sources.length)];
          const x = source + (game.random() - 0.5) * 18;
          const y = FLOOR_Y - 10 - game.random() * 25;
          const seed = game.random();
          game.particles.push(new Particle("Spawn", x, y, (seed - 0.5) * 3, -6 - seed * 8, 9 + seed * 4, seed));
        }
      }
      return true;
    }
    case "GlowWave": {
      game.glowWave = f32(active.age / eventDuration(active.kind));
      return true;
    }
    case "Current": {
      const duration = eventDuration(active.kind);
      const ramp = Math.max(Math.min(Math.min(active.age / 3, 1), (duration - active.age) / 3), 0);
      game.current = game.currentSign * 26 * ramp;
      if (active.cast.length > 0) {
        const slot = actorById(game, active.cast[0]);
        if (slot !== null) {
          const actor = game.actors[slot];
          actor.facing = -game.currentSign;
          actor.script = goto(actor.x, actor.y, 0);
        }
      }
      return true;
    }
    case "VentBurst": {
      if (active.age < 3) {
        for (let n = 0; n < 3; n += 1) {
          const seed = game.random();
          const x = 240 + (seed - 0.5) * 14;
          game.particles.push(new Particle("Bubble", x, FLOOR_Y - 4, (seed - 0.5) * 16, -40 - seed * 30, 7, seed));
          const sand = game.random();
          game.particles.push(new Particle("Dust", x, FLOOR_Y - 2, (sand - 0.5) * 50, -25 - sand * 20, 1.6, sand));
        }
      }
      return true;
    }
    case "GoldenDawn": {
      const duration = eventDuration(active.kind);
      game.golden = Math.max(Math.min(Math.min(active.age / 4, 1), (duration - active.age) / 5), 0);
      return true;
    }
    case "MeteorShower": {
      if (active.timer <= 0 && active.age < 12) {
        active.timer = f32(0.25 + f32(game.random() * 0.5));
        const seed = game.random();
        const x = game.random() * WIDTH;
        const direction = seed < 0.5 ? 1 : -1;
        game.particles.push(
          new Particle("Meteor", x, 3 + seed * 8, direction * (110 + seed * 60), 14 + seed * 10, 0.55, seed),
        );
      }
      return true;
    }
    case "GiantSquid":
    case "Submarine":
    case "WhaleSong": {
      const kind: FarKind = active.kind === "GiantSquid" ? "Squid" : active.kind === "Submarine" ? "Submarine" : "Whale";
      if (active.kind === "WhaleSong" && active.timer <= 0) {
        const whale = game.farThings.find((thing) => thing.kind === "Whale");
        if (whale !== undefined) {
          active.timer = f32(2.2);
          game.particles.push(new Particle("Ring", whale.x + whale.facing * 70, whale.y, 0, 0, 2.6, 0));
        }
      }
      return game.farThings.some((thing) => thing.kind === kind) || active.age < 2;
    }
    case "SunkenAnchor":
    case "TreasureChest":
    case "MessageBottle":
    case "TreatBasket":
      return true;
    case "FeedingFrenzy": {
      if (active.age < 6 && active.timer <= 0) {
        active.timer = f32(0.12);
        const x = 180 + game.random() * 120;
        const seed = game.random();
        game.particles.push(new Particle("Food", x, 26, 0, 0, 30, seed));
      }
      return true;
    }
    case "PelagicRush":
    case "WhalePass": {
      // 큰 생물이 지나가는 길목의 작은 물고기는 놀라 비켜난다.
      if (active.timer <= 0) {
        active.timer = f32(0.3);
        const spots = active.cast
          .map((id) => actorById(game, id))
          .filter((slot): slot is number => slot !== null)
          .map((slot) => [game.actors[slot].x, game.actors[slot].y] as [number, number]);
        for (const [x, y] of spots) {
          nudgeAway(game, x, y, 55, active.cast);
        }
      }
      return anyAlive(game, active) || active.age < 2;
    }
    case "SharkNap": {
      if (active.cast.length === 0) return false;
      const slot = actorById(game, active.cast[0]);
      if (slot === null) return false;
      const actor = game.actors[slot];
      const script = actor.script;
      const resting =
        script !== null &&
        script.kind === "Goto" &&
        Math.abs(actor.x - script.x) < 1 &&
        Math.abs(actor.y - script.y) < 1;
      if (active.stage === 0 && resting) {
        active.stage = 1;
        active.timer = 10;
      } else if (active.stage === 1 && active.timer <= 0) {
        active.stage = 2;
        const end = actor.facing > 0 ? WIDTH + 120 : -120;
        actor.script = goto(end, actor.y - 30, 18);
      }
      return true;
    }
    case "RaySquadron":
      return anyAlive(game, active);
    case "SurfaceBreath": {
      if (active.cast.length === 0) return false;
      const slot = actorById(game, active.cast[0]);
      if (slot === null) return false;
      if (active.stage === 0 && game.actors[slot].y < 34) {
        active.stage = 1;
        active.timer = f32(2.2);
        const x = game.actors[slot].x;
        for (let bead = 0; bead < 12; bead += 1) {
          const seed = game.random();
          game.particles.push(
            new Particle("Bubble", x + (seed - 0.5) * 24, 30 + bead, (seed - 0.5) * 10, -20 - seed * 12, 1.5, seed),
          );
        }
      } else if (active.stage === 1 && active.timer <= 0) {
        active.stage = 2;
        const end = game.actors[slot].facing > 0 ? WIDTH + 80 : -80;
        game.actors[slot].script = goto(end, 170, 24);
      }
      return true;
    }
    case "FloorMarch":
      return anyAlive(game, active);
    case "DeepVisitors": {
      if (active.stage === 0 && active.age > 20) {
        active.stage = 1;
        for (const id of active.cast.slice()) {
          const slot = actorById(game, id);
          if (slot !== null && !grounded(game.species[game.actors[slot].species])) {
            const actor = game.actors[slot];
            actor.script = goto(actor.x, HEIGHT + 50, 10);
            actor.lifespan = actor.age;
          }
        }
      }
      return true;
    }
    case "EelPeek": {
      if (active.stage === 0 && active.age > 13) {
        active.stage = 1;
        for (const id of active.cast.slice()) {
          const slot = actorById(game, id);
          if (slot !== null && game.species[game.actors[slot].species].motion === "eel") {
            const actor = game.actors[slot];
            actor.script = goto(actor.x, HEIGHT + 30, 9);
            actor.lifespan = actor.age;
          }
        }
      }
      return true;
    }
    case "HideAndSeek": {
      if (active.cast.length === 0) return false;
      const h = actorById(game, active.cast[0]);
      if (h === null) return false;
      const hx = game.actors[h].x;
      const hy = game.actors[h].y;
      if (active.stage === 0 && Math.abs(hx - 240) < 1) {
        // 숨은 뒤 작은 물고기 한 마리를 지나가게 한다.
        active.stage = 1;
        const pool = groupPool(game, ["reef"], ["fish"], false);
        const index = pick(game, pool, (entry) => entry.frameW <= 32);
        if (index !== null) {
          const [x, facing] = edgeFacing(game);
          const id = castIndex(game, index, x, hy - 18, facing);
          if (id !== null) {
            const end = facing > 0 ? WIDTH + 40 : -40;
            setScript(game, id, goto(end, hy - 18, 15));
            active.cast.push(id);
          }
        }
      } else if (active.stage === 1 && active.cast.length > 1) {
        const p = actorById(game, active.cast[1]);
        if (p !== null && Math.abs(game.actors[p].x - hx) < 34) {
          // 모래에서 불쑥 솟아 깜짝 놀래 주고, 지나가던 물고기는 허둥지둥 달아난다.
          active.stage = 2;
          active.timer = f32(1.2);
          game.actors[h].script = goto(hx, hy - 14, 60);
          game.actors[h].burst = 1;
          game.actors[p].script = null;
          const px = game.actors[p].x;
          const py = game.actors[p].y;
          startle(game, px + signum(px - hx) * 20, py, 45);
          for (let index = 0; index < 6; index += 1) {
            const angle = index;
            game.particles.push(
              new Particle(
                "Dust",
                hx + Math.cos(angle) * 6,
                hy + 4,
                Math.cos(angle) * 18,
                -8 - Math.abs(Math.sin(angle)) * 10,
                1,
                0.3,
              ),
            );
          }
        }
      } else if (active.stage === 2 && active.timer <= 0) {
        active.stage = 3;
        game.actors[h].script = goto(hx, hy + 14, 12);
      }
      return true;
    }
    case "PufferPanic": {
      if (active.stage === 0 && active.age > 5) {
        active.stage = 1;
        const pool = groupPool(game, ["shark"], ["giant"], false);
        const index = pick(game, pool, any);
        if (index !== null) {
          const [x, facing] = edgeFacing(game);
          const id = castIndex(game, index, x, 150, facing);
          if (id !== null) {
            const end = facing > 0 ? WIDTH + 140 : -140;
            setScript(game, id, goto(end, 150, 26));
            active.cast.push(id);
          }
        }
      }
      if (active.stage === 1 && active.cast.length > 0) {
        const shark = active.cast[active.cast.length - 1];
        const s = actorById(game, shark);
        if (s !== null) {
          const sx = game.actors[s].x;
          for (const id of active.cast.slice()) {
            if (id === shark) {
              continue;
            }
            const slot = actorById(game, id);
            if (slot !== null && Math.abs(game.actors[slot].x - sx) < 80 && game.actors[slot].puffed <= 0) {
              // 복어류는 부풀고, 부풀지 못하는 쥐치류는 몸을 숨기듯 달아난다.
              game.actors[slot].puffed = 4;
              game.actors[slot].script = null;
              game.actors[slot].burst = f32(1.2);
            }
          }
        }
      }
      return true;
    }
    case "CleaningStation": {
      if (active.cast.length === 0) return false;
      const b = actorById(game, active.cast[0]);
      if (b === null) return false;
      const bx = game.actors[b].x;
      const by = game.actors[b].y;
      const arrived = Math.abs(bx - 240) < 1 && Math.abs(by - 140) < 1;
      if (active.stage === 0 && arrived) {
        active.stage = 1;
        active.timer = 11;
        const species = game.species[game.actors[b].species];
        const size: [number, number] = [species.frameW, species.frameH];
        const cleaner = game.random() < 0.7 ? "cleaner-wrasse" : "cleaner-shrimp";
        const id = cast(game, cleaner, bx + 80, by, -1);
        if (id !== null) {
          setScript(game, id, {
            kind: "Orbit",
            cx: bx,
            cy: by,
            rx: size[0] * 0.42,
            ry: size[1] * 0.42,
            angle: 0,
            rate: 1.5,
          });
          active.cast.push(id);
        }
      } else if (active.stage === 1 && active.timer <= 0) {
        active.stage = 2;
        for (const id of active.cast.slice()) {
          const slot = actorById(game, id);
          if (slot !== null) {
            game.actors[slot].script = null;
          }
        }
      }
      return true;
    }
    case "JellyBloom":
      return true;
  }
}

/** 물건·간식 바구니·빛나는 물결처럼 사건이 끝나도 이어지는 것들을 움직인다. */
function stepProps(game: Aquarium, dt: number): void {
  game.shake = Math.max(f32(game.shake - dt), 0);
  game.photo = Math.max(f32(game.photo - f32(dt * 4)), 0);
  const time = game.time;
  const landed: [number, number][] = [];
  for (const item of game.debris) {
    item.age = f32(item.age + dt);
    if (item.landed !== null) {
      item.landed = f32(item.landed + dt);
    } else {
      item.y = f32(item.y + f32(20 * dt));
      item.x += Math.sin(time * 1.3 + item.h) * 6 * dt;
      const floor = FLOOR_Y - item.h * 0.5 + 4;
      if (item.y >= floor) {
        item.y = floor;
        item.landed = 0;
        landed.push([item.x, floor + item.h * 0.5]);
      }
    }
    if (item.kind === "Chest" && item.landed !== null && item.landed > 3) {
      item.open = true;
    }
  }
  for (const [x, y] of landed) {
    // 물건이 떨어진 자리에 모래가 파인 자국이 남는다.
    game.particles.push(new Particle("Print", x, y - 1, 0, 0, 40, 2));
    for (let index = 0; index < 14; index += 1) {
      const seed = game.random();
      const side = index % 2 === 0 ? 1 : -1;
      game.particles.push(
        new Particle("Dust", x + side * seed * 10, y - 2, side * (10 + seed * 25), -10 - seed * 14, 1.4, seed),
      );
    }
    gather(game, x, y - 20, 160);
  }
  const chests = game.debris.filter((item) => item.open && item.alpha() > 0.2).map((item) => [item.x, item.y]);
  for (const [x, y] of chests) {
    if (game.random() < f32(dt * 8)) {
      const seed = game.random();
      game.particles.push(
        new Particle("Gold", x + (seed - 0.5) * 20, y - 6, (seed - 0.5) * 6, -10 - seed * 8, 1.8, seed),
      );
    }
  }
  retain(game.debris, (item) => item.alpha() > 0);
  stepHook(game, dt);
  if (game.glowWave !== null && game.glowWave >= 1) {
    game.glowWave = null;
  }
  retain(game.farThings, (thing) => thing.step(dt));
}

/** 간식 바구니: 물속 가운데까지 내려와 물고기 과자를 흩뿌리고, 다 뿌리면 올라간다. */
function stepHook(game: Aquarium, dt: number): void {
  const basket = game.hook;
  if (basket === null) return;
  game.hook = null;
  if (basket.rising) {
    basket.y = f32(basket.y - f32(30 * dt));
    if (basket.y < -40) {
      return;
    }
  } else if (basket.y < 112) {
    basket.y = Math.min(f32(basket.y + f32(24 * dt)), 112);
  } else {
    const before = basket.poured;
    basket.poured = f32(basket.poured + dt);
    // 0.2초마다 과자 한두 알을 바구니 아래로 떨어뜨린다.
    if (Math.floor(f32(basket.poured / f32(0.2))) > Math.floor(f32(before / f32(0.2)))) {
      const seed = game.random();
      const kind: ParticleKind = seed < 0.3 ? "Cookie" : "Food";
      game.particles.push(new Particle(kind, basket.x + (seed - 0.5) * 10, basket.y + 10, 0, 0, 30, seed));
    }
    if (basket.poured > 4) {
      basket.rising = true;
    }
  }
  game.hook = basket;
}

export function flashAt(game: Aquarium, x: number, y: number, kind: ParticleKind, count: number): void {
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * TAU + game.random();
    const speed = 10 + game.random() * 14;
    const seed = game.random();
    game.particles.push(new Particle(kind, x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, 0.9, seed));
  }
}

/** 발광 생물의 빛나는 점(루어) 월드 좌표다. */
function glowPoint(game: Aquarium, slot: number): [number, number] {
  const actor = game.actors[slot];
  return lightOf(game.species[actor.species], actor.x, actor.y, actor.facing);
}

/** 지나가는 큰 생물 둘레의 작은 물고기만 옆으로 비켜나게 한다(화면 일렁임 없이). */
function nudgeAway(game: Aquarium, x: number, y: number, radius: number, skip: number[]): void {
  for (const actor of game.actors) {
    const species = game.species[actor.species];
    if (skip.includes(actor.id) || actor.script !== null || !faceTravel(species) || species.frameW > 60) {
      continue;
    }
    const dx = actor.x - x;
    const dy = actor.y - y;
    if (Math.hypot(dx, dy) < radius) {
      actor.targetY = actor.y + signum(dy) * 30;
      actor.burst = Math.max(actor.burst, 1);
    }
  }
}

/** 근처 물고기를 놀라게 해 반대로 튀어 나가게 한다(유리 두드리기·열수 분출). */
export function startle(game: Aquarium, x: number, y: number, radius: number): void {
  for (const actor of game.actors) {
    const species = game.species[actor.species];
    if (actor.script !== null || !faceTravel(species) || species.visitor) {
      continue;
    }
    const dx = actor.x - x;
    const dy = actor.y - y;
    if (Math.hypot(dx, dy) < radius) {
      const away = dx >= 0 ? 1 : -1;
      // 큰 생물은 놀라도 돌아서지 않고 가던 방향으로 빨라지기만 한다.
      if (actor.facing !== away && actor.school === null && !bigBody(species)) {
        actor.facing = away;
        actor.turn = f32(TURN_SECONDS);
      }
      actor.burst = f32(1.8);
      actor.vx += away * 60;
      actor.vy += signum(dy) * 20;
      if (species.motion === "puff") {
        actor.puffed = 3;
      }
    }
  }
  game.taps.push([x, y, 0, 1]);
}

/** 떨어진 물건 둘레로 호기심 많은 물고기가 잠깐 모여든다. */
export function gather(game: Aquarium, x: number, y: number, radius: number): void {
  let count = 0;
  for (const actor of game.actors) {
    const species = game.species[actor.species];
    if (count >= 4 || actor.script !== null || actor.school !== null || species.motion !== "fish" || actor.depth === 0) {
      continue;
    }
    if (Math.abs(actor.x - x) < radius * 1.6) {
      const side = count % 2 === 0 ? -1 : 1;
      actor.targetY = y - 6 * count;
      actor.facing = actor.x < x ? 1 : -1;
      actor.retarget = 8;
      actor.pause = 0;
      const stop = x + side * (22 + count * 6);
      actor.script = goto(stop, y - 4 * count, 16);
      actor.lifespan = Math.max(actor.lifespan, f32(actor.age + 14));
      count += 1;
    }
  }
}
