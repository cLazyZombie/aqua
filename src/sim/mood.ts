// 교감(오른쪽 클릭) 반응. 생물마다 정해진 반응을 몇 초 동안 연출하고 끝나면 원래 행동으로 돌아간다.
// 반응은 생물을 없애거나 해치지 않는다. 움직임을 바꾸는 반응은 사건이 조종 중인 생물에게는 쓰지 않는다.

import type { Actor, Aquarium } from "./aquarium";
import { faceTravel, grounded, type Species } from "./catalog";
import { FLOOR_Y, SWIM_TOP, TAU, WIDTH } from "./constants";
import type { Script } from "./director";
import { Particle } from "./life";
import { clamp, f32 } from "./num";
import type { Reaction } from "./traits";

export interface Mood {
  kind: Reaction;
  age: number;
  duration: number;
  /** 교감이 붙인 이동 스크립트다. 끝날 때 아직 이것이면 지운다(사건이 새로 붙인 스크립트는 그대로 둔다). */
  script: Script | null;
  /** 시작 위치다. 하트 대형에서는 하트 중심이다. */
  x0: number;
  y0: number;
  /** 하트 대형에서 맡은 자리(중심 기준)다. */
  slot: [number, number] | null;
  /** 한 번만 내는 연출을 이미 냈는지 비트로 적는다. */
  fired: number;
}

/** 반응마다 이어지는 시간(초)이다. */
const SECONDS: Record<Reaction, number> = {
  puff: 4,
  claws: 3.2,
  snap: 1.8,
  prism: 3.5,
  dance: 3.5,
  shift: 3.5,
  ink: 3.5,
  glow: 4,
  roll: 2.6,
  loop: 2.6,
  leap: 5,
  belly: 4.5,
  song: 4.5,
  dash: 2.5,
  follow: 6,
  clean: 6,
  heart: 5.5,
  hide: 3.8,
  retract: 3.4,
  pearl: 4.5,
  clap: 2.6,
  spin: 3,
  bristle: 2.6,
  wave: 2.4,
  nod: 3,
  bloom: 3.5,
  sway: 3.2,
  sneeze: 2.2,
  flip: 3.4,
  curl: 3,
  squish: 2.6,
  fan: 3,
  kiss: 2.8,
  bob: 2.6,
  bubble: 2.8,
  zap: 2.4,
  photo: 2.4,
  dream: 10,
  nap: 26,
  serenade: 5,
  sumbi: 3.2,
};

/** 몸을 움직이는(스크립트를 쓰는) 반응이다. 사건이 조종 중인 생물은 대신 인사만 한다. */
const MOVES = new Set<Reaction>(["follow", "clean", "heart", "leap"]);

/** 반응하는 동안 제자리에 가깝게 천천히 움직이는 반응이다. */
const STILL = new Set<Reaction>([
  "puff",
  "claws",
  "snap",
  "prism",
  "dance",
  "shift",
  "ink",
  "glow",
  "belly",
  "song",
  "hide",
  "retract",
  "pearl",
  "clap",
  "spin",
  "bristle",
  "wave",
  "nod",
  "sway",
  "sneeze",
  "flip",
  "curl",
  "squish",
  "fan",
  "kiss",
  "bob",
  "bubble",
  "zap",
  "photo",
  "dream",
  "nap",
  "serenade",
  "sumbi",
]);

export function moodSeconds(kind: Reaction): number {
  return SECONDS[kind];
}

/** 교감 중이라 헤엄 속도를 줄여야 하는지 알려 준다. */
export function moodStill(actor: Actor): boolean {
  return actor.mood !== null && STILL.has(actor.mood.kind);
}

function mood(kind: Reaction, x0: number, y0: number): Mood {
  return { kind, age: 0, duration: SECONDS[kind], script: null, x0, y0, slot: null, fired: 0 };
}

/** 생물 하나와 교감을 시작한다. 이미 교감 중이면 하트만 하나 더 띄운다. 시작한 반응을 돌려준다. */
export function react(game: Aquarium, actor: Actor): Reaction | null {
  const species = game.species[actor.species];
  if (actor.burrow > 0) return null;
  if (actor.mood !== null) {
    game.particles.push(heart(actor, species, 0.5));
    return actor.mood.kind;
  }
  let kind = game.traits[actor.species].reaction;
  const eventOwned = actor.script !== null;
  if (eventOwned && MOVES.has(kind)) kind = "wave";
  if ((kind === "follow" || kind === "clean") && game.pointer === null) kind = "wave";
  if (kind === "heart" && actor.school === null) kind = "wave";
  if (kind === "heart") {
    startHeart(game, actor);
    return kind;
  }
  actor.mood = mood(kind, actor.x, actor.y);
  actor.lifespan = Math.max(actor.lifespan, f32(actor.age + SECONDS[kind] + 4));
  opening(game, actor, species, kind);
  return kind;
}

/** 반응을 시작할 때 한 번 내는 연출이다. */
function opening(game: Aquarium, actor: Actor, species: Species, kind: Reaction): void {
  const top = actor.y - species.frameH * 0.5;
  const out = game.particles;
  switch (kind) {
    case "puff":
      actor.puffed = SECONDS.puff;
      for (let n = 0; n < 6; n += 1) out.push(bubble(actor.x + (n - 2.5) * 3, actor.y, n));
      break;
    case "claws":
    case "sneeze":
    case "photo":
      out.push(new Particle("Exclaim", actor.x, top - 6, 0, -4, 1.1, 0));
      if (grounded(species)) actor.pause = SECONDS[kind];
      break;
    case "dash":
      actor.burst = f32(2.6);
      break;
    case "roll":
    case "loop":
      actor.roll = f32(2.2);
      break;
    case "bloom":
      actor.targetY = Math.max(SWIM_TOP + species.frameH * 0.5, actor.targetY - 24);
      break;
    case "nod":
      actor.targetY = Math.max(SWIM_TOP + species.frameH * 0.5, actor.targetY - 10);
      break;
    case "glow":
      out.push(new Particle("Ring", actor.x, actor.y, 0, 0, 0.9, 0));
      break;
    case "song":
      out.push(new Particle("Ring", actor.x, actor.y, 0, 0, 3, 0));
      break;
    case "hide":
    case "retract":
      for (const side of [-1, 1]) {
        out.push(new Particle("Dust", actor.x + side * species.frameW * 0.3, actor.y + species.frameH * 0.4, side * 8, -6, 0.9, 0.5));
      }
      break;
    default:
      break;
  }
  if (grounded(species) && STILL.has(kind)) actor.pause = Math.max(actor.pause, SECONDS[kind]);
}

/** 사건이 생물에게 반응 하나를 바로 붙인다(스크립트가 있어도 모습만 바꾸는 반응이면 된다). */
export function startMood(game: Aquarium, actor: Actor, kind: Reaction): void {
  const species = game.species[actor.species];
  actor.mood = mood(kind, actor.x, actor.y);
  actor.lifespan = Math.max(actor.lifespan, f32(actor.age + SECONDS[kind] + 4));
  opening(game, actor, species, kind);
}

/** 활동이 끝난 두족류가 바닥 가까이 내려앉아 잠들고, 꿈을 꾸듯 몸빛이 천천히 바뀐다. 끝나면 떠난다. */
export function dream(actor: Actor, species: Species): void {
  actor.mood = mood("dream", actor.x, actor.y);
  actor.lifespan = Math.max(actor.lifespan, f32(actor.age + SECONDS.dream + 2));
  actor.targetY = FLOOR_Y - species.frameH * 0.5 - 4;
}

/** 무리 전체가 하트 모양 대형을 이룬다. 누른 물고기가 속한 무리만 움직인다. */
function startHeart(game: Aquarium, clicked: Actor): void {
  const members = game.actors.filter((actor) => actor.school === clicked.school && actor.script === null && actor.mood === null);
  if (members.length === 0) return;
  const cx = clamp(members.reduce((sum, actor) => sum + actor.x, 0) / members.length, 80, WIDTH - 80);
  const cy = clamp(members.reduce((sum, actor) => sum + actor.y, 0) / members.length, 80, 180);
  const scale = clamp(1.4 + members.length * 0.05, 1.8, 2.8);
  // 지금 둘레 각도 순서대로 자리를 나눠 서로 엇갈리지 않게 한다.
  members.sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  members.forEach((actor, index) => {
    const t = (index / members.length) * TAU;
    const x = 16 * Math.pow(Math.sin(t), 3) * scale;
    const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * scale;
    const entry = mood("heart", cx, cy);
    entry.slot = [x, y];
    // 누른 물고기가 대형의 박자를 맡아 가운데 하트를 띄운다.
    entry.fired = actor === clicked ? 0 : 1;
    actor.mood = entry;
  });
}

/** 교감 반응을 한 frame 진행한다. 끝나면 교감이 붙인 스크립트를 떼고 원래 행동으로 돌아간다. */
export function stepMood(game: Aquarium, actor: Actor, species: Species, dt: number, spawned: Particle[]): void {
  const state = actor.mood;
  if (state === null) return;
  const before = state.age;
  state.age = f32(state.age + dt);
  const age = state.age;
  const at = (moment: number) => before < moment && age >= moment;
  const every = (period: number) => Math.floor(before / period) !== Math.floor(age / period);
  const top = actor.y - species.frameH * 0.5;
  const front = actor.x + (faceTravel(species) ? actor.facing : 1) * species.frameW * 0.42;
  const pointer = game.pointer;
  const setScript = (script: Script) => {
    state.script = script;
    actor.script = script;
  };
  switch (state.kind) {
    case "follow": {
      if (pointer === null) {
        state.age = Math.max(state.age, state.duration - 0.5);
        break;
      }
      const side = pointer[0] >= actor.x ? 1 : -1;
      const tx = pointer[0] - side * species.frameW * 0.42;
      const distance = Math.hypot(tx - actor.x, pointer[1] - actor.y);
      setScript({ kind: "Goto", x: tx, y: pointer[1], speed: 55 });
      if (distance < 5 && (state.fired & 1) === 0) {
        state.fired |= 1;
        spawned.push(new Particle("Love", actor.x, top - 4, 0, -9, 1.6, 0));
      } else if (distance < 5 && every(1.1)) {
        spawned.push(heart(actor, species, 0.3));
      }
      break;
    }
    case "clean": {
      if (pointer === null) {
        state.age = Math.max(state.age, state.duration - 0.5);
        break;
      }
      const far = Math.hypot(pointer[0] - actor.x, pointer[1] - actor.y) > 18;
      if (far && (state.fired & 1) === 0) {
        setScript({ kind: "Goto", x: pointer[0], y: pointer[1], speed: 60 });
      } else {
        state.fired |= 1;
        const angle = actor.script?.kind === "Orbit" ? actor.script.angle : Math.atan2(actor.y - pointer[1], actor.x - pointer[0]);
        setScript({ kind: "Orbit", cx: pointer[0], cy: pointer[1], rx: 12, ry: 7, angle, rate: 2.4 });
        if (every(0.35)) spawned.push(new Particle("Spark", pointer[0] + Math.sin(age * 7) * 5, pointer[1] + Math.cos(age * 5) * 3, 0, -6, 0.6, 0));
      }
      break;
    }
    case "heart": {
      const [sx, sy] = state.slot ?? [0, 0];
      setScript({ kind: "Goto", x: state.x0 + sx, y: state.y0 + sy, speed: 70 });
      if ((state.fired & 1) === 0 && age >= 1.8) {
        state.fired |= 1;
        spawned.push(new Particle("Love", state.x0, state.y0 - 4, 0, -5, 2.4, 1));
      }
      break;
    }
    case "leap": {
      const facing = faceTravel(species) ? actor.facing : 1;
      const surface = 28 - species.frameH * 0.15;
      if ((state.fired & 2) === 0) {
        // 앞쪽 비스듬히 수면까지 솟구친다. 방향은 그대로다.
        setScript({ kind: "Goto", x: state.x0 + facing * 90, y: surface, speed: 90 });
        if (Math.abs(actor.y - surface) < 4 || age > 2.2) {
          state.fired |= 2;
          state.slot = [actor.x + facing * 100, state.y0];
          actor.roll = f32(2.2);
          for (let n = 0; n < 8; n += 1) {
            const angle = Math.PI + (n / 7) * Math.PI;
            spawned.push(new Particle("Spark", actor.x, 26, Math.cos(angle) * 30, Math.sin(angle) * 26, 0.8, 0));
            spawned.push(bubble(actor.x + (n - 3.5) * 3, 30, n));
          }
          spawned.push(new Particle("Ring", actor.x, 26, 0, 0, 1, 0));
        }
      } else {
        // 한 바퀴 돌며 원래 깊이로 돌아간다.
        const [tx, ty] = state.slot ?? [actor.x, state.y0];
        setScript({ kind: "Goto", x: tx, y: ty, speed: 60 });
        if (Math.hypot(tx - actor.x, ty - actor.y) < 3) state.age = Math.max(state.age, state.duration);
      }
      break;
    }
    case "dash":
      if (every(0.08)) spawned.push(bubble(actor.x - (front - actor.x), actor.y + Math.sin(age * 20) * 2, age));
      break;
    case "roll":
    case "loop":
      if (every(0.12)) spawned.push(bubble(actor.x, actor.y, age));
      if (at(1.4)) spawned.push(heart(actor, species, 0.5));
      break;
    case "snap":
      if (at(0.35)) {
        for (let n = 0; n < 10; n += 1) {
          const angle = (n / 10) * TAU;
          spawned.push(new Particle("Spark", front, actor.y, Math.cos(angle) * 40, Math.sin(angle) * 40, 0.45, 0));
        }
        for (let n = 0; n < 5; n += 1) spawned.push(new Particle("Bubble", front, actor.y, actor.facing * (40 + n * 12), -6 - n * 3, 1.4, n * 0.2));
        game.taps.push([front, actor.y, 0, 0.35]);
      }
      break;
    case "zap":
      if (every(0.07)) {
        const angle = age * 23;
        const reach = species.frameW * 0.45;
        spawned.push(new Particle("Zap", actor.x + Math.cos(angle) * reach, actor.y + Math.sin(angle * 1.3) * species.frameH * 0.5, 0, 0, 0.18, age));
      }
      break;
    case "ink":
      if (at(0.3)) {
        const cx = actor.x - (faceTravel(species) ? actor.facing : 1) * (species.frameW * 0.5 + 14);
        for (let n = 0; n < 16; n += 1) {
          const t = (n / 16) * TAU;
          const x = cx + 16 * Math.pow(Math.sin(t), 3) * 1.05;
          const y = top - 4 - (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * 1.05;
          spawned.push(new Particle("Ink", x, y, 0, -2, 3.2, n * 0.1));
        }
      }
      if (at(1.4)) spawned.push(heart(actor, species, 0.5));
      break;
    case "glow":
      if (every(0.18)) {
        const angle = age * 9;
        spawned.push(new Particle("Spark", actor.x + Math.cos(angle) * species.frameW * 0.5, actor.y + Math.sin(angle) * species.frameH * 0.5, 0, -8, 0.9, 0));
      }
      if (at(1.2) || at(2.4)) spawned.push(new Particle("Ring", actor.x, actor.y, 0, 0, 0.9, 0));
      break;
    case "prism":
    case "fan":
    case "spin":
    case "bristle":
      if (every(0.2)) {
        const angle = age * 7;
        spawned.push(new Particle("Spark", actor.x + Math.cos(angle) * species.frameW * 0.55, actor.y + Math.sin(angle) * species.frameH * 0.55, 0, -6, 0.8, 0));
      }
      break;
    case "dance":
    case "song":
      if (every(0.55)) spawned.push(new Particle("Note", actor.x + Math.sin(age * 3) * species.frameW * 0.3, top - 3, Math.sin(age * 5) * 6, -10, 1.6, age));
      if (state.kind === "song" && (at(1.4) || at(2.8))) spawned.push(new Particle("Ring", actor.x, actor.y, 0, 0, 3, 0));
      break;
    case "retract":
      if (at(1.3)) {
        for (let n = 0; n < 8; n += 1) {
          const angle = Math.PI + (n / 7) * Math.PI;
          spawned.push(new Particle("Spark", actor.x, top, Math.cos(angle) * 18, Math.sin(angle) * 18, 0.8, 0));
        }
      }
      break;
    case "pearl":
      if (every(0.16)) {
        const angle = age * 11;
        spawned.push(new Particle("Gold", actor.x + Math.cos(angle) * 8, actor.y + Math.sin(angle) * 5, Math.cos(angle) * 10, -8, 0.9, 0));
      }
      break;
    case "clap":
      if (at(0.2) || at(0.95) || at(1.7)) {
        for (let n = 0; n < 3; n += 1) spawned.push(bubble(actor.x + (n - 1) * 4, actor.y + species.frameH * 0.3, n));
      }
      break;
    case "bubble":
    case "nod":
      if (age < 1.4 && every(0.12)) spawned.push(new Particle("Bubble", front, actor.y - 2, (Math.sin(age * 9) * 6), -18, 2.4, age));
      if (state.kind === "bubble" && at(0.6)) spawned.push(new Particle("Ring", front, actor.y - 4, 0, 0, 1, 0));
      break;
    case "sneeze":
      if (at(0.7)) {
        for (let n = 0; n < 9; n += 1) {
          const spread = (n / 8 - 0.5) * 1.2;
          const facing = faceTravel(species) ? actor.facing : 1;
          spawned.push(new Particle("Spark", front, actor.y - 2, facing * Math.cos(spread) * 45, Math.sin(spread) * 30, 0.6, 0));
        }
      }
      break;
    case "photo":
      if (at(0.5)) game.photo = 1;
      break;
    case "nap":
      if (every(2.6)) spawned.push(heart(actor, species, 0.4));
      break;
    case "serenade": {
      // 인어공주가 노래하면 음표와 반짝이 고리가 퍼지고, 둘레 물고기가 함께 춤춘다.
      if (every(0.45)) spawned.push(new Particle("Note", actor.x + Math.sin(age * 4) * 10, top - 4, Math.sin(age * 5) * 8, -12, 1.8, age));
      if (at(0.3) || at(2.3)) spawned.push(new Particle("Ring", actor.x, actor.y, 0, 0, 1.2, 0));
      if (every(0.25)) {
        const angle = age * 5;
        spawned.push(new Particle("Spark", actor.x + Math.cos(angle) * 22, actor.y + Math.sin(angle) * 14, 0, -6, 0.8, 0));
      }
      if (at(0.6)) {
        for (const other of game.actors) {
          if (other === actor || other.mood !== null || other.script !== null || other.depth !== 1) continue;
          if (Math.hypot(other.x - actor.x, other.y - actor.y) > 100) continue;
          const kind = game.species[other.species].motion === "school" ? null : "dance";
          if (kind) {
            other.mood = mood("dance", other.x, other.y);
            other.lifespan = Math.max(other.lifespan, f32(other.age + SECONDS.dance + 4));
          }
        }
      }
      break;
    }
    case "sumbi":
      // 해녀가 고개를 들어 휘파람 같은 숨소리를 낸다: 고리 둘과 음표.
      if (at(0.5)) {
        spawned.push(new Particle("Ring", actor.x, top, 0, 0, 1.4, 0));
        spawned.push(new Particle("Ring", actor.x, top, 0, 0, 3, 0));
        for (let n = 0; n < 3; n += 1) spawned.push(new Particle("Note", actor.x + (n - 1) * 6, top - 4, (n - 1) * 5, -12 - n * 3, 1.8, n * 0.3));
      }
      break;
    case "dream":
      // 잠든 숨결처럼 작은 기포가 가끔 오른다.
      if (every(1.6)) spawned.push(new Particle("Bubble", actor.x + Math.sin(age) * 3, top, 0, -6, 2.6, 0.2));
      break;
    case "kiss":
      if (at(0.4)) {
        spawned.push(new Particle("Love", front, top - 2, (faceTravel(species) ? actor.facing : 1) * 10, -8, 1.8, 0));
        for (let n = 0; n < 3; n += 1) spawned.push(heart(actor, species, n * 0.3));
      }
      break;
    case "hide":
      if (at(state.duration - 0.8)) {
        for (let n = 0; n < 10; n += 1) {
          const angle = (n / 10) * TAU;
          spawned.push(new Particle("Spark", actor.x, actor.y, Math.cos(angle) * 24, Math.sin(angle) * 18, 0.7, 0));
        }
        spawned.push(new Particle("Exclaim", actor.x, top - 6, 0, -4, 1, 0));
      }
      break;
    default:
      break;
  }
  // 대부분의 반응은 끝 무렵 하트로 인사한다.
  if (!["heart", "follow", "kiss", "hide", "dream", "nap"].includes(state.kind) && at(state.duration * 0.55)) {
    spawned.push(heart(actor, species, 0));
  }
  if (state.kind === "puff" && at(state.duration - 0.3)) {
    for (let n = 0; n < 6; n += 1) spawned.push(bubble(actor.x + (n - 2.5) * 3, actor.y, n));
  }
  if (state.age >= state.duration) {
    finish(actor, species);
  }
}

/** 반응을 끝내고 교감이 붙인 스크립트를 뗀다. */
function finish(actor: Actor, species: Species): void {
  const state = actor.mood;
  if (state === null) return;
  if (state.script !== null && actor.script === state.script) {
    actor.script = null;
    actor.targetY = actor.y;
    actor.retarget = f32(2);
  }
  if (state.kind === "heart") {
    // 대형이 풀리면 무리 속도를 원래 진행 방향으로 되살린다.
    actor.vx = actor.facing * 20;
    actor.vy = 0;
  }
  actor.mood = null;
  // 바닥 생물이 반응 뒤 위로 떠 있지 않게 한다.
  if (grounded(species)) actor.y = Math.min(actor.y, FLOOR_Y + 12 - species.frameH * 0.5);
}

/** 머리 위로 떠오르는 작은 하트다. `spread`만큼 좌우로 흩어 여러 개가 겹치지 않게 한다. */
function heart(actor: Actor, species: Species, spread: number): Particle {
  const x = actor.x + Math.sin(actor.phase + spread * 7) * (2 + spread * 8);
  return new Particle("Heart", x, actor.y - species.frameH * 0.5 - 3, 0, -10, 1.4, 0);
}

function bubble(x: number, y: number, seed: number): Particle {
  return new Particle("Bubble", x, y, Math.sin(seed * 2.3) * 5, -14 - (seed % 3) * 4, 2.2, (seed * 0.37) % 1);
}

/** 교감이 바꾸는 모습이다. 크기 배율·회전·오프셋·투명도·덧칠 색·대체 그림·발광 배율을 담는다. */
export interface Look {
  sx: number;
  sy: number;
  /** 뒤집기(배 보이기) 중이면 위아래를 바꿔 그린다. */
  flipY: boolean;
  /** 오른쪽을 볼 때 기준의 회전(라디안, 반시계 +)이다. 왼쪽을 보면 그리는 쪽이 부호를 바꾼다. */
  rot: number;
  dx: number;
  dy: number;
  alpha: number;
  /** 몸 모양대로 덧칠하는 색(0..255)과 세기(0..1)다. */
  tint: [number, number, number, number] | null;
  /** true면 더해 빛나게, false면 색을 덮는다. */
  tintAdd: boolean;
  /** 대체 그림(부푼 모습·교감 자세)을 쓴다. */
  alt: boolean;
  /** 발광 배율이다. */
  glow: number;
  /** 둘레에 퍼지는 빛 고리 세기(0..1)다. */
  halo: number;
}

export function plainLook(): Look {
  return { sx: 1, sy: 1, flipY: false, rot: 0, dx: 0, dy: 0, alpha: 1, tint: null, tintAdd: true, alt: false, glow: 1, halo: 0 };
}

function smooth(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

/** 들어갈 때 0.25초, 나올 때 0.4초 동안 부드럽게 오르내리는 세기다. */
function envelope(age: number, duration: number): number {
  return Math.min(smooth(age / 0.25), smooth((duration - age) / 0.4));
}

/** 색상환 위치(0..1)의 선명한 색이다. */
function hue(h: number): [number, number, number] {
  const k = (n: number) => (n + h * 6) % 6;
  const f = (n: number) => 1 - Math.max(0, Math.min(k(n), 4 - k(n), 1));
  return [Math.round(f(5) * 255), Math.round(f(3) * 255), Math.round(f(1) * 255)];
}

const BLUSH: [number, number, number] = [255, 120, 160];
/** 잠든 문어가 꿈꾸듯 지나가는 몸빛(노랑·흰색·자주·얼룩 갈색)이다. */
const DREAM_COLORS: [number, number, number][] = [
  [238, 196, 84],
  [236, 234, 222],
  [150, 84, 190],
  [128, 92, 60],
];
const SHIFT_COLORS: [number, number, number][] = [
  [255, 90, 70],
  [255, 236, 214],
  [150, 90, 255],
  [255, 170, 60],
];

/** 한 번 뛰어오르는 높이(0..1)다. `hops`번을 `span`초 안에 뛴다. */
function hop(age: number, hops: number, span: number): number {
  if (age >= span) return 0;
  return Math.abs(Math.sin((age / span) * Math.PI * hops));
}

/** 배를 보이며 뒤집혔다 돌아오는 진행도다: 몸 두께(0..1)와 뒤집힘 여부. */
function flipOver(age: number, duration: number): [number, boolean] {
  const into = smooth(age / 0.6);
  const back = smooth((duration - age) / 0.6);
  const progress = Math.min(into, back);
  return [Math.max(0.15, Math.abs(Math.cos(progress * Math.PI))), progress > 0.5];
}

/** 생물의 지금 모습이다. 교감이 없으면 기본 모습을 돌려준다. */
export function moodLook(actor: Actor, species: Species, time: number): Look {
  const look = plainLook();
  const state = actor.mood;
  if (state === null) return look;
  const age = state.age;
  const env = envelope(age, state.duration);
  const blush = (strength: number) => {
    look.tint = [BLUSH[0], BLUSH[1], BLUSH[2], strength * env * (0.7 + 0.3 * Math.sin(time * 6))];
    look.tintAdd = true;
  };
  const anchorBottom = () => {
    look.dy += species.frameH * (1 - look.sy) * 0.5;
  };
  switch (state.kind) {
    case "puff":
      look.alt = true;
      if (species.alt === null) {
        look.sx = 1 + 0.35 * env;
        look.sy = 1 + 0.35 * env;
      }
      break;
    case "claws":
      look.alt = true;
      look.dy = -hop(age, 3, 1.8) * 3;
      if (species.alt === null) {
        look.sy = 1 + 0.14 * env;
        anchorBottom();
      }
      break;
    case "snap":
      if (age < 0.35) {
        look.sx = 1 - 0.1 * smooth(age / 0.35);
      } else {
        const flash = Math.max(0, 1 - (age - 0.35) / 0.3);
        look.tint = [255, 255, 235, flash * 0.8];
      }
      break;
    case "prism":
      look.tint = [...hue(time * 0.9), 0.5 * env] as [number, number, number, number];
      break;
    case "dance":
      look.rot = 0.28 * Math.sin(age * 9) * env;
      look.dy = -hop(age, 6, state.duration) * 2;
      break;
    case "shift": {
      const slot = (age * 2.2) % SHIFT_COLORS.length;
      const a = SHIFT_COLORS[Math.floor(slot)];
      const b = SHIFT_COLORS[(Math.floor(slot) + 1) % SHIFT_COLORS.length];
      const t = smooth(slot - Math.floor(slot));
      look.tint = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, 0.4 * env * (0.65 + 0.35 * Math.sin(age * 7))];
      look.tintAdd = false;
      break;
    }
    case "ink":
      look.sy = 1 - 0.1 * Math.max(0, 1 - Math.abs(age - 0.3) / 0.2);
      break;
    case "glow":
      // 빛 고리가 숨 쉬듯 부풀고 발광이 두 배 남짓 밝아진다.
      look.glow = 1 + 1.2 * env * (0.85 + 0.15 * Math.sin(age * 6));
      look.halo = env;
      break;
    case "belly":
    case "flip": {
      const [thick, over] = flipOver(age, state.duration);
      look.sy = thick;
      look.flipY = over;
      if (state.kind === "belly") blush(0.2);
      break;
    }
    case "song":
      look.tint = [150, 210, 255, 0.2 * env * (0.5 + 0.5 * Math.sin(age * 4))];
      break;
    case "dash":
      look.tint = [255, 255, 255, Math.max(0, 1 - age / 0.45) * 0.6];
      break;
    case "follow":
    case "heart":
      blush(0.22);
      if (state.kind === "follow") look.dy = -Math.abs(Math.sin(age * 5)) * 1.5;
      break;
    case "clean":
      blush(0.15);
      break;
    case "hide": {
      const hidden = Math.min(smooth(age / 0.4), smooth((state.duration - 0.8 - age) / 0.3));
      look.alpha = 1 - 0.88 * hidden;
      look.tint = [196, 178, 140, 0.55 * hidden];
      look.tintAdd = false;
      break;
    }
    case "retract": {
      let height: number;
      if (age < 0.2) height = 1 - 0.8 * smooth(age / 0.2);
      else if (age < 1.2) height = 0.2;
      else if (age < 2.6) height = 0.2 + 0.92 * smooth((age - 1.2) / 1.4);
      else height = 1.12 - 0.12 * smooth((age - 2.6) / 0.6);
      look.sy = height;
      anchorBottom();
      if (age > 1.2) look.tint = [...hue(0.08 + (age - 1.2) * 0.3), 0.25 * env] as [number, number, number, number];
      break;
    }
    case "pearl":
      look.alt = true;
      look.halo = 0.5 * env;
      break;
    case "clap":
      look.dy = -hop(age, 3, 2.2) * 12;
      look.sy = 1 - 0.18 * Math.max(0, Math.sin(age * 8.5));
      break;
    case "spin":
      look.rot = TAU * smooth(age / state.duration);
      break;
    case "bristle": {
      const scale = 1 + 0.16 * Math.abs(Math.sin(age * 8)) * env;
      look.sx = scale;
      look.sy = scale;
      anchorBottom();
      break;
    }
    case "wave":
      look.dy = -hop(age, 2, 1.2) * 4;
      blush(0.18);
      break;
    case "nod":
      look.rot = 0.22 * Math.sin(Math.PI * clamp(age / state.duration, 0, 1));
      break;
    case "bloom":
      look.sx = 1 + 0.12 * Math.sin(age * 10) * env;
      look.sy = 1 - 0.1 * Math.sin(age * 10) * env;
      look.tint = [...hue(0.55 + age * 0.25), 0.3 * env] as [number, number, number, number];
      break;
    case "sway":
      look.rot = 0.2 * Math.sin(age * 4) * env;
      blush(0.2);
      break;
    case "sneeze":
      if (age < 0.7) {
        look.sy = 1 + 0.1 * (age / 0.7);
        look.rot = 0.12 * (age / 0.7);
      } else {
        look.rot = -0.15 * Math.max(0, 1 - (age - 0.7) / 0.3);
      }
      break;
    case "curl": {
      const scale = 1 - 0.25 * env;
      look.sx = scale;
      look.sy = scale;
      look.rot = -TAU * 2 * smooth(age / state.duration);
      anchorBottom();
      break;
    }
    case "squish":
      look.sx = 1 + 0.22 * Math.sin(age * 6) * env;
      look.sy = 1 - 0.18 * Math.sin(age * 6) * env;
      anchorBottom();
      break;
    case "fan":
      look.sy = 1 + 0.2 * env;
      look.sx = 1 + 0.05 * env;
      break;
    case "kiss":
      blush(0.3);
      look.dy = -hop(age, 1, 0.8) * 3;
      break;
    case "bob":
      look.dy = -Math.abs(Math.sin(age * 6)) * 5 * env;
      break;
    case "bubble":
      look.sx = 1 + 0.08 * Math.max(0, 1 - Math.abs(age - 0.5) / 0.4);
      break;
    case "zap":
      look.tint = [120, 200, 255, 0.55 * env * (Math.sin(age * 43) > 0 ? 1 : 0.3)];
      break;
    case "serenade":
      look.rot = 0.16 * Math.sin(age * 3) * env;
      look.tint = [255, 190, 230, 0.22 * env * (0.6 + 0.4 * Math.sin(age * 5))];
      look.dy = -Math.abs(Math.sin(age * 2)) * 2;
      break;
    case "sumbi":
      look.rot = 0.25 * Math.sin(Math.PI * Math.min(1, age / 1.2)) * env;
      look.dy = -hop(age, 1, 1) * 4;
      break;
    case "nap": {
      // 배를 드러내고 뒤집힌 채 물결에 살랑 흔들린다(해달 낮잠).
      const [thick, over] = flipOver(age, state.duration);
      look.sy = thick;
      look.flipY = over;
      look.dy = Math.sin(age * 1.6) * 1.5;
      look.rot = Math.sin(age * 0.9) * 0.06;
      break;
    }
    case "dream": {
      const slot = (age / 2.2) % DREAM_COLORS.length;
      const a = DREAM_COLORS[Math.floor(slot)];
      const b = DREAM_COLORS[(Math.floor(slot) + 1) % DREAM_COLORS.length];
      const t = smooth((slot - Math.floor(slot) - 0.5) * 2);
      look.tint = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, 0.5 * env];
      look.tintAdd = false;
      look.sy = 1 - 0.08 * env;
      look.sx = 1 + 0.04 * env;
      anchorBottom();
      break;
    }
    case "photo":
    case "roll":
    case "loop":
    case "leap":
      break;
  }
  return look;
}
