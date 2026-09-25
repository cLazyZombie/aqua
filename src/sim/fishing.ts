// 낚시: 낚시 모드에서 던지고(힘 게이지), 입질을 기다려 챈 뒤(찌가 푹 잠길 때), 장력을 조절하며 끌어올린다.
// - 던지기: 누르고 있으면 힘 게이지가 오르내리고, 떼는 순간 좋은 칸에 가까울수록 겨눈 곳에 떨어진다.
// - 입질: 근처 물고기가 성향(식성·경계심)대로 다가와 몇 번 툭툭 건드리다 문다. 너무 일찍 채면 달아나고, 늦으면 미끼만 떼인다.
// - 싸움: 누르면 감고 떼면 풀어 준다. 물고기가 치고 나갈 때 계속 감으면 장력이 넘쳐 줄이 끊어지고, 너무 느슨하면 바늘이 빠진다.
// - 잡으면 수면에서 잠깐 보여 주고 놓아 준다(잡아먹지 않는다).
// 종마다 난이도(힘·체력·돌진·입질 시간·경계심)가 다르다. 시뮬레이션 난수와 섞이지 않게 전용 난수를 쓴다.

import type { Actor, Aquarium } from "./aquarium";
import { faceTravel, type Species } from "./catalog";
import { FLOOR_Y, WIDTH } from "./constants";
import { Particle, SURFACE_Y } from "./life";
import { mixSeed, Rng } from "./rng";
import type { FoodKind, Traits } from "./traits";

export type FishingPhase = "off" | "aim" | "charge" | "fly" | "sink" | "wait" | "reel" | "fight" | "landed";

/** 낚싯대 끝(수면 위, 화면 위쪽 가운데 조금 오른쪽)이다. 줄이 여기서 내려온다. */
export const ROD_TIP: [number, number] = [WIDTH / 2 + 30, -6];
/** 힘 게이지가 한 번 오르내리는 시간(초)과 가장 좋은 자리, 좋음·완벽 폭이다. */
export const METER_PERIOD = 1.3;
export const SWEET = 0.8;
export const GOOD_BAND = 0.13;
export const PERFECT_BAND = 0.045;
/** 장력이 이 위(빨간 칸)에 머물면 줄이 끊어지기 시작한다. */
export const TENSION_RED = 0.85;
/** 줄이 끊어지는 데 걸리는 과부하 누적(초)과 바늘이 빠지는 느슨함 누적(초)이다. */
const SNAP_AFTER = 0.9;
const SLACK_AFTER = 1.6;
/** 감는 빠르기(px/초)다. */
const REEL_SPEED = 26;

/** 한 종의 낚시 성향이다. difficulty 0..1, stars 1..5. */
export interface FishProfile {
  difficulty: number;
  stars: number;
  /** 당기는 힘(장력에 곱해진다). */
  strength: number;
  /** 체력이 닳는 느림(클수록 오래 버틴다). */
  stamina: number;
  /** 쉬는 동안 초당 치고 나갈 확률과 그 힘이다. */
  runRate: number;
  runPower: number;
  /** 진짜 입질 때 챌 수 있는 시간(초)이다. */
  window: number;
  /** 물기 전에 건드리는 횟수 범위다. */
  nibbles: [number, number];
  /** 미끼에 끌리는 정도(식성)다. */
  appeal: number;
  /** 다가오다가 마음을 바꿀 확률이다. */
  wary: number;
}

const CATCH_MOTIONS = new Set(["fish", "giant", "eel", "squid", "flap", "puff"]);
/** 낚지 않는 무리: 고래·돌고래·물범·거북·펭귄·해파리·해마·무리 물고기·붙어 사는 생물·게·갯민숭이·사람·인어. */
const NO_CATCH = new Set(["whale", "dolphin", "pinniped", "turtle", "penguin", "jelly", "seahorse", "school", "sessile", "crust", "nudi", "haenyeo", "mermaid", "none"]);
const GROUP_BONUS: Record<string, number> = {
  shark: 0.35,
  bottomshark: 0.2,
  pelagic: 0.3,
  ray: 0.2,
  bigreef: 0.15,
  eel: 0.12,
  cold: 0.1,
  deep: 0.05,
  camo: 0.05,
  ceph: 0.05,
  reef: 0,
  clown: -0.05,
  puffer: -0.05,
};
const DIET_APPEAL: Record<FoodKind, number> = { Cookie: 1, Food: 0.75, Pellet: 0.7, Glimmer: 0.25, Leaf: 0.12 };

/** 낚을 수 있는 종이면 그 성향을, 아니면 null이다. 크기·무리·식성으로 정한다. */
export function fishProfile(species: Species, traits: Traits): FishProfile | null {
  if (species.visitor || !CATCH_MOTIONS.has(species.motion) || NO_CATCH.has(species.group)) return null;
  const size = Math.min(1, Math.max(0, (species.frameW - 18) / 110));
  const difficulty = Math.min(1, Math.max(0, 0.08 + size * 0.65 + (GROUP_BONUS[species.group] ?? 0)));
  return {
    difficulty,
    stars: 1 + Math.round(difficulty * 4),
    strength: 0.55 + difficulty * 0.8,
    stamina: 0.6 + difficulty * 1.6,
    runRate: 0.25 + difficulty * 0.45,
    runPower: 1.2 + difficulty * 0.8,
    window: 0.75 - difficulty * 0.4,
    nibbles: [Math.round(difficulty), 1 + Math.round(difficulty * 3)],
    appeal: DIET_APPEAL[traits.diet] ?? 0.5,
    wary: 0.1 + difficulty * 0.3,
  };
}

/** 힘 게이지 값(0..1, 오르내림)이다. */
export function meterAt(time: number): number {
  const t = (time / METER_PERIOD) % 1;
  return t < 0.5 ? t * 2 : 2 - t * 2;
}

export type CastQuality = "perfect" | "good" | "weak";

/** 알림(짧은 글자)이다. tone은 색(좋음·나쁨·주의·안내)이다. */
export interface FishingNote {
  text: string;
  tone: "good" | "bad" | "warn" | "info";
  timer: number;
}

export class Fishing {
  phase: FishingPhase = "off";
  /** 지금 단계에 머문 시간(초)이다. */
  timer = 0;
  aimX = WIDTH / 2;
  /** 던질 때 멈춘 힘 게이지 값과 그 판정이다. */
  power = 0;
  quality: CastQuality | null = null;
  /** 미끼 자리와 던진 곳(찌가 뜬 수면 x)이다. */
  bait: [number, number] = [ROD_TIP[0], ROD_TIP[1]];
  bobber = WIDTH / 2;
  private from: [number, number] = [ROD_TIP[0], ROD_TIP[1]];
  private landX = WIDTH / 2;
  hasBait = true;
  /** 찌가 잠긴 정도(0..1)다. 건드림은 조금, 진짜 입질은 푹. */
  dip = 0;
  /** 다가오는(입질하는) 물고기 id와 남은 건드림, 다음 건드림까지 시간, 진짜 입질의 남은 시간이다. */
  suitor: number | null = null;
  private nibblesLeft = 0;
  private nextNibble = 0;
  biteLeft = 0;
  private looking = 0;
  private approach = 0;
  private readonly wary = new Map<number, number>();
  /** 누르고 있는지(싸움에서는 감기)와 누른 시간이다. */
  holding = false;
  private held = 0;
  /** 싸움: 걸린 물고기 id, 그 성향, 장력(0..1+), 남은 줄(px), 처음 거리, 체력, 행동, 좌우 각도, 과부하·느슨함 누적이다. */
  hooked: number | null = null;
  profile: FishProfile | null = null;
  tension = 0;
  distance = 0;
  startDistance = 0;
  maxLine = 0;
  stamina = 1;
  mode: "rest" | "run" | "dash" = "rest";
  private modeTimer = 0;
  private angle = 0;
  private runDir = 1;
  overload = 0;
  slack = 0;
  /** 잡은 물고기를 놓아 주는 중인 id와 남은 시간이다. */
  private releasing: [number, number] | null = null;
  note: FishingNote | null = null;
  /** 결과 자막(잡은 종·별)이다. */
  result: { text: string; stars: number; timer: number } | null = null;
  /** 이번 실행에서 잡은 횟수(종 id별)다. 앱이 도감에 저장한다. */
  readonly catches = new Map<string, number>();
  /** 막 잡은 종 id다(앱이 한 번 읽고 비운다). */
  landedSpecies: string | null = null;
  private readonly rng: Rng;

  constructor(seed: number | bigint) {
    this.rng = new Rng(mixSeed(BigInt.asUintN(64, BigInt(seed) ^ 0x0f15b1e7n)));
  }

  get active(): boolean {
    return this.phase !== "off";
  }

  /** 낚시 모드를 켜고 끈다. 끄면 다가오던·걸린 물고기를 놓아 준다. */
  toggle(game: Aquarium): void {
    if (this.phase === "off") {
      this.phase = "aim";
      this.timer = 0;
      return;
    }
    this.letGo(game);
    this.phase = "off";
    this.note = null;
    this.result = null;
  }

  /** 누르기(마우스 왼쪽·탭·스페이스). 단계마다 뜻이 다르다. */
  press(game: Aquarium, x: number): void {
    this.holding = true;
    this.held = 0;
    switch (this.phase) {
      case "aim":
        this.aimX = Math.min(WIDTH - 20, Math.max(20, x));
        this.phase = "charge";
        this.timer = 0;
        break;
      case "sink":
        // 가라앉는 미끼를 이 깊이에 멈춘다.
        this.phase = "wait";
        this.timer = 0;
        break;
      case "wait":
        if (this.biteLeft > 0) this.hook(game);
        else if (this.suitor !== null && this.nibbling(game)) this.spook(game, "너무 일찍 챘어요!");
        break;
      case "landed":
        this.timer = Math.max(this.timer, 2.2);
        break;
      default:
        break;
    }
  }

  /** 떼기. 힘 게이지를 멈춰 던지고, 싸움에서는 감기를 멈춘다. */
  release(): void {
    this.holding = false;
    if (this.phase === "charge") this.cast();
  }

  private cast(): void {
    const power = meterAt(this.timer);
    const miss = Math.abs(power - SWEET);
    this.power = power;
    this.quality = miss <= PERFECT_BAND ? "perfect" : miss <= GOOD_BAND ? "good" : "weak";
    // 좋은 칸에서 멀수록 겨눈 곳에서 멀리 떨어진다. 힘이 모자라면 낚싯대 쪽으로 짧게 떨어진다.
    const spread = this.quality === "perfect" ? 3 : this.quality === "good" ? 14 : 30 + miss * 60;
    const short = power < SWEET ? (SWEET - power) * 80 : 0;
    let x = this.aimX + (this.rng.next() * 2 - 1) * spread;
    x += Math.sign(ROD_TIP[0] - x) * Math.min(short, Math.abs(ROD_TIP[0] - x));
    this.landX = Math.min(WIDTH - 12, Math.max(12, x));
    this.from = [ROD_TIP[0], ROD_TIP[1]];
    this.bait = [ROD_TIP[0], ROD_TIP[1]];
    this.hasBait = true;
    this.phase = "fly";
    this.timer = 0;
    this.note = { text: this.quality === "perfect" ? "PERFECT!" : this.quality === "good" ? "GOOD" : "빗나감…", tone: this.quality === "weak" ? "bad" : "good", timer: 1.2 };
  }

  step(game: Aquarium, dt: number, spawned: Particle[]): void {
    this.timer += dt;
    if (this.note) {
      this.note.timer -= dt;
      if (this.note.timer <= 0) this.note = null;
    }
    if (this.result) {
      this.result.timer -= dt;
      if (this.result.timer <= 0) this.result = null;
    }
    for (const [id, until] of this.wary) if (game.time > until) this.wary.delete(id);
    this.stepRelease(game, dt);
    if (this.holding) this.held += dt;
    this.dip = Math.max(0, this.dip - dt * 3);
    switch (this.phase) {
      case "fly": {
        // 낚싯대 끝에서 포물선을 그리며 날아가 수면에 떨어진다.
        const t = Math.min(1, this.timer / 0.55);
        const x = this.from[0] + (this.landX - this.from[0]) * t;
        const y = this.from[1] + (SURFACE_Y - this.from[1]) * t - Math.sin(t * Math.PI) * 26;
        this.bait = [x, y];
        if (t >= 1) {
          this.bobber = this.landX;
          this.bait = [this.landX, SURFACE_Y + 2];
          this.phase = "sink";
          this.timer = 0;
          splash(spawned, this.landX, 6);
        }
        break;
      }
      case "sink":
        this.bait[1] += 24 * dt;
        this.bait[0] = this.bobber + Math.sin(this.timer * 2) * 1.5;
        if (this.bait[1] >= FLOOR_Y - 14) {
          this.bait[1] = FLOOR_Y - 14;
          this.phase = "wait";
          this.timer = 0;
        }
        // 가라앉는 미끼를 쫓아오는 물고기도 있다. 다가오면 미끼가 그 깊이에 멈춘다.
        this.stepBite(game, dt, spawned);
        if (this.suitor !== null && this.phase === "sink") {
          this.phase = "wait";
          this.timer = 0;
        }
        break;
      case "wait":
        this.bait[0] = this.bobber + Math.sin(this.timer * 1.3) * 1.5;
        if (this.holding && this.held > 0.55 && this.biteLeft <= 0) {
          // 길게 누르면 미끼를 거둬 다시 던진다.
          this.reelIn(game);
          break;
        }
        this.stepBite(game, dt, spawned);
        break;
      case "reel": {
        const t = Math.min(1, this.timer / 0.9);
        this.bait = [this.bait[0] + (ROD_TIP[0] - this.bait[0]) * t * 0.2, this.bait[1] + (ROD_TIP[1] - this.bait[1]) * t * 0.2];
        if (t >= 1) {
          this.phase = "aim";
          this.timer = 0;
          this.hasBait = true;
        }
        break;
      }
      case "fight":
        this.stepFight(game, dt, spawned);
        break;
      case "landed": {
        const actor = this.hookedActor(game);
        if (actor) {
          actor.script = { kind: "Goto", x: this.bobber, y: SURFACE_Y + 10, speed: 60 };
          if (this.timer < 0.1) splash(spawned, this.bobber, 10);
        }
        if (this.timer >= 2.6) {
          if (actor) {
            // 놓아 준다: 하트를 띄우며 물속으로 돌아간다.
            spawned.push(new Particle("Heart", actor.x, actor.y - 10, 0, -10, 1.6, 0));
            actor.script = { kind: "Goto", x: actor.x + actor.facing * 70, y: 120 + this.rng.next() * 60, speed: 45 };
            this.releasing = [actor.id, 3];
          }
          this.hooked = null;
          this.profile = null;
          this.phase = "aim";
          this.timer = 0;
          this.note = { text: "놓아 줬어요", tone: "info", timer: 1.6 };
        }
        break;
      }
      default:
        break;
    }
  }

  /** 입질: 근처 물고기가 다가와 건드리다 문다. */
  private stepBite(game: Aquarium, dt: number, spawned: Particle[]): void {
    if (!this.hasBait) {
      if (this.timer > 1.2) this.reelIn(game);
      return;
    }
    const suitor = this.suitor === null ? null : game.actors.find((actor) => actor.id === this.suitor) ?? null;
    if (this.suitor !== null && !suitor) {
      this.suitor = null;
      this.biteLeft = 0;
    }
    if (!suitor) {
      this.looking -= dt;
      if (this.looking <= 0) {
        this.looking = 0.4;
        this.findSuitor(game);
      }
      return;
    }
    const species = game.species[suitor.species];
    // 물고기가 미끼의 어느 쪽에 있는지로 자리를 정한다(바라보는 방향으로 정하면 돌아설 때마다 목표가 뒤바뀐다).
    const side = Math.abs(suitor.x - this.bait[0]) > 1 ? Math.sign(suitor.x - this.bait[0]) : -suitor.facing;
    const mouth: [number, number] = [this.bait[0] + side * species.frameW * 0.42, this.bait[1]];
    const near = Math.hypot(suitor.x - mouth[0], suitor.y - mouth[1]) < 5;
    // 닿으면 미끼를 바라본다.
    if (near && faceTravel(species) && Math.sign(this.bait[0] - suitor.x) !== suitor.facing && suitor.turn <= 0) suitor.flip();
    if (!near) {
      suitor.script = { kind: "Goto", x: mouth[0], y: mouth[1], speed: 22 };
      this.approach += dt;
      // 오래 걸려도 닿지 못하면 흥미를 잃고 떠난다.
      if (this.approach > 12) this.flee(game, suitor);
      return;
    }
    suitor.script = { kind: "Goto", x: mouth[0], y: mouth[1], speed: 22 };
    if (this.biteLeft > 0) {
      this.biteLeft -= dt;
      this.dip = 1;
      if (this.biteLeft <= 0) {
        // 늦었다: 미끼만 떼어 가고 달아난다.
        this.hasBait = false;
        this.timer = 0;
        this.flee(game, suitor);
        this.note = { text: "미끼만 떼였어요…", tone: "bad", timer: 1.6 };
      }
      return;
    }
    this.nextNibble -= dt;
    if (this.nextNibble > 0) return;
    if (this.nibblesLeft > 0) {
      // 툭툭 건드린다: 찌가 살짝 까딱인다.
      this.nibblesLeft -= 1;
      this.nextNibble = 0.5 + this.rng.next() * 0.9;
      this.dip = 0.35;
      return;
    }
    // 진짜 입질: 찌가 푹 잠기고 물보라가 인다.
    const profile = this.profileOf(game, suitor);
    this.biteLeft = profile ? profile.window : 0.5;
    this.dip = 1;
    splash(spawned, this.bobber, 3);
  }

  private findSuitor(game: Aquarium): void {
    const busy = new Set(game.director.active?.castIds() ?? []);
    let best: [Actor, number] | null = null;
    for (const actor of game.actors) {
      if (actor.depth !== 1 || actor.school !== null || actor.script !== null || actor.mood !== null) continue;
      if (actor.isLeaving() || actor.alpha() < 0.9 || busy.has(actor.id) || this.wary.has(actor.id)) continue;
      const profile = this.profileOf(game, actor);
      if (!profile) continue;
      const distance = Math.hypot(actor.x - this.bait[0], actor.y - this.bait[1]);
      if (distance > 130) continue;
      // 식성에 맞고 가까울수록, 잘 던졌을수록 잘 온다. 큰 물고기는 경계심이 많아 잘 오지 않는다.
      const bonus = this.quality === "perfect" ? 1.5 : this.quality === "good" ? 1.15 : 0.85;
      const chance = profile.appeal * (1 - distance / 130) * 0.5 * bonus * (1 - profile.wary * 0.6);
      const roll = this.rng.next();
      if (roll < chance && (!best || roll / chance < best[1])) best = [actor, roll / chance];
    }
    if (!best) return;
    const [actor] = best;
    const profile = this.profileOf(game, actor)!;
    // 다가오다 마음을 바꾸기도 한다.
    if (this.rng.next() < profile.wary * 0.5) {
      this.wary.set(actor.id, game.time + 6);
      return;
    }
    this.suitor = actor.id;
    this.approach = 0;
    const [low, high] = profile.nibbles;
    this.nibblesLeft = low + Math.floor(this.rng.next() * (high - low + 1));
    this.nextNibble = 0.6 + this.rng.next() * 0.8;
    actor.lifespan = Math.max(actor.lifespan, actor.age + 90);
  }

  private nibbling(game: Aquarium): boolean {
    const suitor = game.actors.find((actor) => actor.id === this.suitor);
    if (!suitor) return false;
    return Math.hypot(suitor.x - this.bait[0], suitor.y - this.bait[1]) < game.species[suitor.species].frameW;
  }

  /** 너무 일찍 챘다: 물고기가 놀라 달아나고 한동안 오지 않는다. */
  private spook(game: Aquarium, text: string): void {
    const suitor = game.actors.find((actor) => actor.id === this.suitor);
    if (suitor) this.flee(game, suitor);
    this.suitor = null;
    this.biteLeft = 0;
    this.note = { text, tone: "bad", timer: 1.4 };
  }

  private flee(game: Aquarium, actor: Actor): void {
    const away = actor.x < this.bait[0] ? -1 : 1;
    actor.script = { kind: "Goto", x: actor.x + away * 90, y: actor.y + (this.rng.next() - 0.5) * 40, speed: 70 };
    this.releasing = [actor.id, 1.4];
    this.wary.set(actor.id, game.time + 10);
    if (this.suitor === actor.id) this.suitor = null;
    this.biteLeft = 0;
  }

  private reelIn(game: Aquarium): void {
    const suitor = game.actors.find((actor) => actor.id === this.suitor);
    if (suitor) suitor.script = null;
    this.suitor = null;
    this.biteLeft = 0;
    this.phase = "reel";
    this.timer = 0;
  }

  /** 챘다: 싸움이 시작된다. */
  private hook(game: Aquarium): void {
    const actor = game.actors.find((entry) => entry.id === this.suitor);
    const profile = actor ? this.profileOf(game, actor) : null;
    if (!actor || !profile) {
      this.spook(game, "놓쳤어요");
      return;
    }
    this.hooked = actor.id;
    this.profile = profile;
    this.suitor = null;
    this.biteLeft = 0;
    this.phase = "fight";
    this.timer = 0;
    this.tension = 0.35;
    this.stamina = 1;
    this.mode = "run";
    this.modeTimer = 0.8;
    this.runDir = this.rng.next() < 0.5 ? -1 : 1;
    this.angle = Math.atan2(actor.x - this.bobber, Math.max(8, actor.y - SURFACE_Y));
    this.distance = Math.hypot(actor.x - this.bobber, actor.y - SURFACE_Y) + 20;
    this.startDistance = this.distance;
    this.maxLine = Math.max(260, this.distance + 150);
    this.overload = 0;
    this.slack = 0;
    actor.lifespan = Math.max(actor.lifespan, actor.age + 180);
    // 복어는 걸리면 부푼다.
    if (game.species[actor.species].motion === "puff") actor.puffed = 999;
    this.note = { text: "걸렸다!", tone: "good", timer: 1.2 };
  }

  /** 싸움 한 걸음: 물고기의 쉬기·치고 나가기·달려들기, 장력·남은 줄·체력, 끊어짐·빠짐·낚음. */
  private stepFight(game: Aquarium, dt: number, spawned: Particle[]): void {
    const actor = this.hookedActor(game);
    const profile = this.profile;
    if (!actor || !profile) {
      this.endFight(game, "놓쳤어요", "bad");
      return;
    }
    const species = game.species[actor.species];
    const reeling = this.holding;
    // 행동 바꾸기: 쉬다가 가끔 치고 나가고(장력 급등), 드물게 낚싯대 쪽으로 달려들어 줄을 느슨하게 만든다.
    this.modeTimer -= dt;
    if (this.modeTimer <= 0) {
      if (this.mode !== "rest") {
        this.mode = "rest";
        this.modeTimer = 0.8 + this.rng.next() * 1.2;
      } else {
        const roll = this.rng.next();
        const runChance = profile.runRate * (0.35 + 0.65 * this.stamina) * 0.5;
        if (roll < runChance) {
          this.mode = "run";
          this.modeTimer = 0.6 + this.rng.next() * 0.9 + profile.difficulty * 0.4;
          this.runDir = this.rng.next() < 0.5 ? -1 : 1;
          this.note = { text: "당긴다!", tone: "warn", timer: 0.8 };
          splash(spawned, actor.x, 2);
          if (species.motion === "squid") {
            for (let n = 0; n < 5; n += 1) spawned.push(new Particle("Ink", actor.x - actor.facing * 6, actor.y, (this.rng.next() - 0.5) * 10, (this.rng.next() - 0.5) * 6, 2.4, n * 0.2));
          }
        } else if (roll < runChance + 0.04 + profile.difficulty * 0.06) {
          this.mode = "dash";
          this.modeTimer = 0.9;
        } else {
          this.modeTimer = 0.5;
        }
      }
    }
    const pull = this.mode === "run" ? profile.runPower : this.mode === "dash" ? -0.4 : 0.35 + 0.25 * this.stamina;
    const effort = pull * profile.strength * (0.45 + 0.55 * this.stamina);
    let target: number;
    if (reeling) {
      target = this.mode === "dash" ? 0.3 : 0.22 + Math.max(0, effort) * 0.62;
      const slow = Math.min(0.95, Math.max(0, effort) * 0.9);
      this.distance += (-REEL_SPEED * (1 - slow) + Math.max(0, effort - 0.9) * 30 - (this.mode === "dash" ? 12 : 0)) * dt;
    } else {
      target = this.mode === "dash" ? 0.02 : 0.08 + Math.max(0, effort) * 0.28;
      this.distance += (Math.max(0, effort) * 20 - (this.mode === "dash" ? 14 : 0)) * dt;
    }
    this.tension += (target - this.tension) * Math.min(1, dt * 7);
    // 체력: 치고 나가거나 팽팽하게 버티면 닳고, 풀어 주며 쉬면 조금 돌아온다.
    const drain = this.mode === "run" ? 0.12 : reeling ? 0.035 : -0.02;
    this.stamina = Math.min(1, Math.max(0, this.stamina - (drain / profile.stamina) * dt));
    // 과부하가 쌓이면 끊어지고, 느슨함이 쌓이면 바늘이 빠진다.
    if (this.tension >= 1) this.overload += dt * (1 + (this.tension - 1) * 1.5);
    else this.overload = Math.max(0, this.overload - dt * 1.5);
    if (this.tension < 0.1) this.slack += dt;
    else this.slack = Math.max(0, this.slack - dt * 2);
    if (this.slack > 0.6 && (!this.note || this.note.tone !== "warn")) this.note = { text: "줄이 느슨해요!", tone: "warn", timer: 0.6 };
    if (this.overload >= SNAP_AFTER) {
      this.endFight(game, "줄이 끊어졌어요!", "bad");
      return;
    }
    if (this.slack >= SLACK_AFTER) {
      this.endFight(game, "바늘이 빠졌어요…", "bad");
      return;
    }
    if (this.distance >= this.maxLine) {
      this.endFight(game, "줄이 다 풀려 끊어졌어요!", "bad");
      return;
    }
    // 물고기 자리: 찌 아래에서 남은 줄만큼, 치고 나갈 때는 옆으로 휘돈다.
    if (this.mode === "run") this.angle += this.runDir * 0.9 * dt;
    else this.angle += (0 - this.angle) * Math.min(1, dt * 0.4);
    this.angle = Math.max(-1.25, Math.min(1.25, this.angle));
    const reach = Math.max(0, this.distance);
    const x = Math.min(WIDTH - 10, Math.max(10, this.bobber + Math.sin(this.angle) * reach));
    const y = Math.min(FLOOR_Y - species.frameH * 0.5, Math.max(SURFACE_Y + 6, SURFACE_Y + 6 + Math.cos(this.angle) * reach * 0.85));
    const shake = this.tension > 0.7 ? Math.sin(game.time * 40) * 1.5 : 0;
    actor.script = { kind: "Goto", x: x + shake, y, speed: 160 };
    if (this.mode === "run" && this.rng.next() < dt * 6) spawned.push(new Particle("Bubble", actor.x, actor.y - 4, 0, -14, 2, this.rng.next()));
    if (this.distance <= 8) {
      // 낚았다!
      const name = species.nameKo;
      this.catches.set(species.id, (this.catches.get(species.id) ?? 0) + 1);
      this.landedSpecies = species.id;
      this.result = { text: `낚았다! ${name}`, stars: profile.stars, timer: 3.2 };
      this.phase = "landed";
      this.timer = 0;
      this.tension = 0;
      if (species.motion === "puff") actor.puffed = 1.5;
      for (let n = 0; n < 3; n += 1) spawned.push(new Particle("Heart", actor.x + (n - 1) * 6, actor.y - 12, 0, -12, 1.6, 0));
    }
  }

  private endFight(game: Aquarium, text: string, tone: FishingNote["tone"]): void {
    const actor = this.hookedActor(game);
    if (actor) {
      if (game.species[actor.species].motion === "puff") actor.puffed = 1.5;
      this.flee(game, actor);
    }
    this.hooked = null;
    this.profile = null;
    this.tension = 0;
    this.note = { text, tone, timer: 1.8 };
    this.hasBait = false;
    this.phase = "reel";
    this.timer = 0;
  }

  /** 놓아 준 물고기의 스크립트를 조금 뒤 떼어 원래 행동으로 돌려보낸다. */
  private stepRelease(game: Aquarium, dt: number): void {
    if (!this.releasing) return;
    this.releasing[1] -= dt;
    if (this.releasing[1] <= 0) {
      const actor = game.actors.find((entry) => entry.id === this.releasing![0]);
      if (actor && actor.id !== this.hooked && actor.id !== this.suitor) actor.script = null;
      this.releasing = null;
    }
  }

  /** 모드를 끄거나 장면을 바꿀 때 다가오던·걸린 물고기를 놓아 준다. */
  letGo(game: Aquarium): void {
    for (const id of [this.suitor, this.hooked]) {
      const actor = id === null ? undefined : game.actors.find((entry) => entry.id === id);
      if (actor) {
        actor.script = null;
        if (game.species[actor.species].motion === "puff") actor.puffed = 1.5;
      }
    }
    if (this.releasing) {
      const actor = game.actors.find((entry) => entry.id === this.releasing![0]);
      if (actor) actor.script = null;
    }
    this.suitor = null;
    this.hooked = null;
    this.profile = null;
    this.releasing = null;
    this.biteLeft = 0;
    this.holding = false;
  }

  hookedActor(game: Aquarium): Actor | null {
    return this.hooked === null ? null : game.actors.find((actor) => actor.id === this.hooked) ?? null;
  }

  profileOf(game: Aquarium, actor: Actor): FishProfile | null {
    return fishProfile(game.species[actor.species], game.traits[actor.species]);
  }

  /** 줄이 물속으로 들어가는 끝(미끼 또는 걸린 물고기 입)이다. */
  lineEnd(game: Aquarium): [number, number] {
    const actor = this.hookedActor(game);
    if (actor && (this.phase === "fight" || this.phase === "landed")) {
      const species = game.species[actor.species];
      const facing = faceTravel(species) ? actor.facing : 1;
      return [actor.x + facing * species.frameW * 0.42, actor.y];
    }
    return this.bait;
  }
}

function splash(spawned: Particle[], x: number, count: number): void {
  for (let n = 0; n < count; n += 1) {
    const angle = Math.PI + ((n + 0.5) / count) * Math.PI;
    spawned.push(new Particle("Spark", x, SURFACE_Y, Math.cos(angle) * 20, Math.sin(angle) * 18, 0.6, 0));
  }
  spawned.push(new Particle("Ring", x, SURFACE_Y + 1, 0, 0, 0.8, 0));
}
