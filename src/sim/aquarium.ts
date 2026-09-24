// 수족관 시뮬레이션 본체. 기준 기록(tests/fixtures)과 같도록 난수 호출 순서까지 고정한다.

import { bigBody, faceTravel, grounded, type Species } from "./catalog";
import {
  BURROW_SECONDS,
  DAY_CYCLE_SECONDS,
  FLOOR_Y,
  HEIGHT,
  LINGER,
  MAX_UNITS,
  PLANKTON,
  SWIM_BOTTOM,
  SWIM_TOP,
  TAU,
  TURN_SECONDS,
  WIDTH,
} from "./constants";
import { Dex, type DexEntry, dexEntries, observe } from "./dex";
import {
  Debris,
  Director,
  type EventKind,
  eventPool,
  FarThing,
  type Hook,
  type Script,
  startle,
  stepDirector,
  triggerEvent,
  triggerRandomEvent,
} from "./director";
import { Weather } from "./events";
import { Particle, stepParticles, Tentacle, ventBubbles } from "./life";
import { dream, type Mood, moodStill, react, stepMood } from "./mood";
import { clamp, f32, fract, hash01, minBy, pickIndex, retain, round, signum, toUsize } from "./num";
import { mixSeed, Rng } from "./rng";
import { School, steer, type Threat } from "./school";
import { awakeAt, dreamer, type FoodKind, FOOD_KINDS, hourOf, hoursSinceStart, type Reaction, type Traits, traitTable, type Variant } from "./traits";

export {
  DAY_CYCLE_SECONDS,
  FLOOR_Y,
  HEIGHT,
  LINGER,
  MAX_UNITS,
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
  SWIM_BOTTOM,
  SWIM_TOP,
  TURN_SECONDS,
  WIDTH,
} from "./constants";

export class Actor {
  /** 사건이 생물을 기억하는 고유 번호다(목록 순서는 매 frame 바뀐다). */
  id = 0;
  species = 0;
  x = 0;
  y = 0;
  /** 무리 구성원만 쓰는 boids 속도다. */
  vx = 0;
  vy = 0;
  facing = 1;
  /** 0이면 먼 층(푸르게 가라앉음), 1이면 가까운 층이다. */
  depth = 1;
  phase = 0;
  /** 누적 애니메이션 프레임 수다. */
  anim = 0;
  age = 0;
  lifespan = 0;
  speed = 0;
  targetY = 0;
  retarget = 0;
  turnCooldown = 0;
  pause = 0;
  /** 방향을 막 바꾼 뒤 남은 몸 뒤집기 연출 시간(초)이다. */
  turn = 0;
  /** 포식자를 피하거나 먹이를 쫓을 때 더해지는 속도 배율이다. */
  burst = 0;
  /** 복어가 부풀어 있는 남은 시간이다. */
  puffed = 0;
  school: number | null = null;
  tentacles: Tentacle[] = [];
  /** 사건이 붙인 연출 동작이다. */
  script: Script | null = null;
  /** 공중제비가 끝날 때까지 남은 시간이다. 그리는 쪽이 몸을 한 바퀴 돌린다. */
  roll = 0;
  emit = 0;
  /** 교감(오른쪽 클릭) 반응이다. */
  mood: Mood | null = null;
  /** 활동 시간이 끝나 모래 속으로 들어가는 중이면 지난 시간(초)이다. */
  burrow = 0;
  /** 교감 반응 없이 처음 모래에서 올라오는 바닥 생물이다. */
  emerging = false;
  /** 희귀 색 변이(0 보통, 1 황금, 2 알비노, 3 흑색)다. 개체 번호의 해시로 정해 난수 순서를 건드리지 않는다. */
  variant: Variant = 0;
  /** 방문자의 단골 개체 번호(0..2)다. 방문자가 아니면 -1이다. */
  individual = -1;
  /** 새벽에 이미 한 번 잠들어 꿈을 꿨는지다. */
  dreamt = false;

  alpha(): number {
    const base = Math.min(Math.min(this.age / 1.5, 1), Math.max((this.lifespan + LINGER - this.age) / 3, 0));
    return this.burrow > 0 ? base * Math.max(0, 1 - this.burrow / BURROW_SECONDS) : base;
  }

  /** 모래에 파묻힌 깊이(px)다. 들어가는 중이거나 막 올라오는 바닥 생물만 0보다 크다. */
  sunk(species: Species): number {
    if (this.burrow > 0) return species.frameH * Math.min(1, this.burrow / BURROW_SECONDS);
    if (this.emerging && this.age < 1.5) return species.frameH * (1 - this.age / 1.5);
    return 0;
  }

  /** 헤엄 리듬에 맞춘 상하 흔들림을 더한 화면 위치다. */
  pose(time: number, species: Species): [number, number] {
    let amount: number;
    let frequency: number;
    switch (species.motion) {
      case "hover":
        amount = 2.5;
        frequency = 0.9;
        break;
      case "giant":
      case "flap":
      case "glide":
        amount = 1.5;
        frequency = 0.5;
        break;
      case "crawl":
      case "creep":
      case "sessile":
      case "jelly":
      case "octopus":
      case "school":
        amount = 0;
        frequency = 0;
        break;
      default:
        amount = 1.5;
        frequency = 1.3;
        break;
    }
    return [this.x, this.y + Math.sin(time * frequency + this.phase) * amount];
  }

  /** 방향 전환 연출 중의 (보이는 방향, 가로 폭 비율). 중간에 몸이 얇아졌다가 반대로 펴진다. */
  turning(): [number, number] {
    if (this.turn <= 0) {
      return [this.facing, 1];
    }
    const progress = 1 - this.turn / TURN_SECONDS;
    const facing = progress < 0.5 ? -this.facing : this.facing;
    return [facing, Math.max(Math.abs(Math.cos(progress * Math.PI)), 0.15)];
  }

  flip(): void {
    this.facing = -this.facing;
    this.turn = f32(TURN_SECONDS);
  }

  frame(species: Species): number {
    return toUsize(Math.max(Math.floor(this.anim), 0)) % species.frames;
  }

  isLeaving(): boolean {
    return this.age > this.lifespan;
  }

  /** 공중제비 회전각(라디안)이다. */
  rollAngle(): number {
    return this.roll <= 0 ? 0 : TAU * (1 - this.roll / 2.2);
  }
}

/** 화면 표현 토글이다. 게임 규칙과 무관하게 키로 바꾼다. */
export interface Look {
  /** 최종 화면을 게임 팔레트로 모은다. */
  palette: boolean;
  /** 월드 픽셀 행마다 CRT 스캔라인을 넣는다. */
  crt: boolean;
  /** 창 크기와 관계없이 정수배로만 확대한다. */
  integer: boolean;
}

/** 먹을 수 있는 먹이 입자: 입자 칸, x, y, 종류, 받은 생물 id. */
type Food = [number, number, number, FoodKind, number];
/** 먹힌 먹이: 입자 칸, x, y, 하트를 띄울 자리(받은 생물이 먹었을 때만). */
type Eaten = [number, number, number, [number, number] | null];
type Body = [number, number, number, number | null, number, number];
type Position = [number, number, number, number];

export class Aquarium {
  look: Look = { palette: false, crt: false, integer: false };
  species: Species[];
  actors: Actor[] = [];
  particles: Particle[] = [];
  /** 먼 층을 지나는 고래·대왕오징어·잠수정이다. */
  farThings: FarThing[] = [];
  weather = new Weather();
  director = new Director();
  dex = new Dex();
  /** 가라앉았거나 가라앉는 물건이다. */
  debris: Debris[] = [];
  hook: Hook | null = null;
  /** 가로 해류 세기(px/s, 부호가 방향)다. */
  current = 0;
  currentSign = 1;
  /** 남은 화면 흔들림 시간이다. */
  shake = 0;
  /** 잠수부 카메라 플래시 세기다. */
  photo = 0;
  /** 황금빛 아침 세기다. */
  golden = 0;
  /** 빛나는 물결 진행도(0..1)다. */
  glowWave: number | null = null;
  /** 밤에 포인터를 손전등으로 쓴다. */
  flashlight = false;
  /** 최근 유리를 두드린 자리, 지난 시간, 일렁임 크기(1이 두드림)다. 무리가 잠깐 피한다. */
  taps: [number, number, number, number][] = [];
  /** 마우스가 가리키는 월드 좌표다. 먹이 주기·유리 두드리기·손전등·교감에 쓴다. */
  pointer: [number, number] | null = null;
  /** 마우스가 올라가 있는 생물 id다. 그 생물은 천천히 헤엄쳐 누르기 쉽게 한다. */
  hover: number | null = null;
  /** 종마다 활동 시간·먹이·교감 규칙이다(종 번호로 찾는다). */
  traits: Traits[];
  /** 포인터가 스쳐 터뜨린 기포 줄기 알(키)과 그 알이 다시 나타나는 시각이다. */
  popped = new Map<string, number>();
  time = 0;
  started: boolean;
  schools: School[] = [];
  rng: Rng;
  spawnTimer = 0;
  nextSchool = 1;
  nextWhale = 35;
  nextStorm = 250;
  nextId = 1;

  constructor(species: Species[], seed: number | bigint, started: boolean) {
    this.species = species;
    this.traits = traitTable(species);
    this.started = started;
    this.rng = new Rng(mixSeed(seed));
    // 처음 모습도 시드마다 다르다: 지금 시각에 활동하는 종에서 여덟 마리와 무리 하나를 고른다.
    for (const index of this.startingLineup()) {
      this.spawn(index, true);
    }
    const school = this.startingSchool();
    if (school !== null) {
      this.spawnSchool(school, true);
    }
    for (let index = 0; index < PLANKTON; index += 1) {
      const x = this.random() * WIDTH;
      const y = 24 + this.random() * (HEIGHT - 30);
      const life = 3 + this.random() * 5;
      const speck = new Particle("Plankton", x, y, 0, 0, life, index * 0.37);
      speck.age = this.random() * life;
      this.particles.push(speck);
    }
  }

  /**
   * 첫 화면 생물 여덟 종을 고른다. 헤엄치는 물고기를 중심으로 하되, 큰 생물·해파리·바닥 생물·부유 생물을
   * 동작마다 한 종까지만 섞어 한쪽으로 치우치지 않게 한다. 사건 방문자와 무리 종은 빼고, 지금 활동하는 종만 쓴다.
   */
  startingLineup(): number[] {
    const hour = hourOf(this.time);
    const candidates = this.species
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry, index }) => !entry.visitor && entry.group !== "school" && awakeAt(this.traits[index].hours, hour));
    const caps: Record<string, number> = { giant: 1, flap: 1, glide: 1, jelly: 1, octopus: 1, crawl: 1, creep: 1, sessile: 1, hover: 1, eel: 1, squid: 1, puff: 1 };
    const used = new Map<string, number>();
    const chosen: number[] = [];
    for (let attempt = 0; attempt < 400 && chosen.length < 8 && candidates.length > 0; attempt += 1) {
      const { entry, index } = candidates[pickIndex(this.random(), candidates.length)];
      const cap = caps[entry.motion] ?? 8;
      const count = used.get(entry.motion) ?? 0;
      if (chosen.includes(index) || count >= cap) continue;
      used.set(entry.motion, count + 1);
      chosen.push(index);
    }
    return chosen;
  }

  /** 첫 화면 무리 종을 고른다(지금 활동하는 무리 종 가운데 하나). */
  startingSchool(): number | null {
    const hour = hourOf(this.time);
    const schools = this.species
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry, index }) => entry.group === "school" && !entry.visitor && awakeAt(this.traits[index].hours, hour));
    if (schools.length === 0) return null;
    return schools[pickIndex(this.random(), schools.length)].index;
  }

  indexOf(id: string): number | null {
    const index = this.species.findIndex((entry) => entry.id === id);
    return index < 0 ? null : index;
  }

  daylight(): number {
    return clamp(0.5 + 0.5 * Math.cos((TAU * this.time) / DAY_CYCLE_SECONDS), 0, 1);
  }

  nightStrength(): number {
    const dark = (1 - this.daylight() - 0.1) / 0.9;
    return Math.pow(clamp(dark, 0, 1), 1.3);
  }

  /** 해 질 녘과 새벽에만 올라오는 주황빛 세기다. */
  twilight(): number {
    const daylight = this.daylight();
    return clamp(1 - Math.abs((daylight - 0.45) / 0.3), 0, 1);
  }

  /**
   * 카메라 오프셋(정수 픽셀)이다. 층마다 다른 비율로 곱해 패럴랙스를 만든다.
   * 평소에는 고정하고, 열수 분출처럼 흔들림이 필요한 사건 때만 정수 픽셀로 잠깐 튄다.
   */
  cameraOffset(): [number, number] {
    if (this.shake <= 0) {
      return [0, 0];
    }
    const jolt = round(Math.sin(this.time * 53) * 2 * Math.min(this.shake, 1));
    return [jolt, round(jolt * 0.5)];
  }

  /** 포인터 위치에 기본 가루 먹이 몇 조각을 뿌린다. 가까운 물고기가 찾아와 먹는다. */
  feed(x: number, y: number): void {
    this.drop("Food", x, y, 0);
  }

  /** 큰 물고기가 먹는 물고기 과자를 뿌린다. */
  feedCookie(x: number, y: number): void {
    this.drop("Cookie", x, y, 0);
  }

  /**
   * 생물을 눌러 그 종이 좋아하는 먹이를 입 앞(바닥 생물은 머리 위, 해파리는 갓 위)에 준다.
   * 그 생물이 먹으면 하트가 뜬다. 준 먹이 종류를 돌려준다.
   */
  feedActor(actor: Actor): FoodKind {
    const species = this.species[actor.species];
    const kind = this.traits[actor.species].diet;
    const facing = faceTravel(species) ? actor.facing : 0;
    let x: number;
    let y: number;
    if (grounded(species)) {
      x = actor.x + facing * species.frameW * 0.3;
      y = actor.y - species.frameH * 0.5 - 16;
    } else if (species.motion === "jelly" || species.motion === "octopus") {
      x = actor.x;
      y = actor.y - species.frameH * 0.5 - 8;
    } else {
      x = actor.x + facing * (species.frameW * 0.5 + 10);
      y = actor.y - 2;
    }
    this.drop(kind, x, y, actor.id);
    return kind;
  }

  /** 먹이 입자를 뿌린다. `owner`는 먹이를 받은 생물 id(0이면 누구나)다. */
  drop(kind: FoodKind, x: number, y: number, owner: number): void {
    const [count, spreadX, spreadY]: [number, number, number] =
      kind === "Food" ? [6, 18, 8] : kind === "Cookie" ? [3, 14, 6] : kind === "Leaf" ? [3, 14, 6] : kind === "Pellet" ? [4, 12, 4] : [10, 16, 10];
    for (let n = 0; n < count; n += 1) {
      const dx = (this.random() - 0.5) * spreadX;
      const dy = (this.random() - 0.5) * spreadY;
      const seed = this.random();
      const life = kind === "Glimmer" ? 25 : 30;
      const particle = new Particle(kind, x + dx, Math.min(y, FLOOR_Y - 10) + dy, 0, 0, life, seed);
      particle.owner = owner;
      this.particles.push(particle);
    }
  }

  /** 생물과 교감한다(오른쪽 클릭). 시작한 반응을 돌려준다. */
  react(actor: Actor): Reaction | null {
    return react(this, actor);
  }

  /** 유리를 두드린다. 화면이 그 자리에서 둥글게 일렁이고 근처 생물이 놀라 흩어진다. */
  tap(x: number, y: number): void {
    this.startle(x, y, 130);
  }

  /** 진행 중인 일렁임(월드 x, y, 지난 시간, 크기)이다. */
  ripples(): [number, number, number, number][] {
    return this.taps.map(([x, y, age, scale]) => [x, y, age, scale]);
  }

  /** 지금 시각(0..24시)이다. 0초가 정오다. */
  hour(): number {
    return hourOf(this.time);
  }

  /** 종이 지금 활동할 시간인지 알려 준다. */
  awake(species: number): boolean {
    return awakeAt(this.traits[species].hours, this.hour());
  }

  /** 근처 물고기를 놀라게 해 반대로 튀어 나가게 한다(유리 두드리기·열수 분출). */
  startle(x: number, y: number, radius: number): void {
    startle(this, x, y, radius);
  }

  /** 사건 하나를 바로 시작한다. 이미 진행 중인 사건은 끝낸다. */
  triggerEvent(kind: EventKind): void {
    triggerEvent(this, kind);
  }

  /** 조건이 맞는 사건 가운데 희귀도 가중치로 하나를 골라 바로 시작한다. 없으면 false다. */
  triggerRandomEvent(): boolean {
    return triggerRandomEvent(this);
  }

  /** 사건이 등장시키거나 반응시키는 종 목록이다. */
  eventPool(kind: EventKind): number[] {
    return eventPool(this, kind);
  }

  /** 도감의 모든 칸(생물 먼저, 사건 다음)이다. */
  dexEntries(): DexEntry[] {
    return dexEntries(this);
  }

  step(seconds: number): void {
    const dt = f32(clamp(seconds, 0, 0.1));
    this.time = f32(this.time + dt);
    const time = this.time;
    const daylight = this.daylight();
    const night = this.nightStrength();
    const hour = this.hour();
    for (const school of this.schools) {
      school.step(dt, time);
    }
    const threats: Threat[] = [];
    const baseObstacles: Threat[] = [];
    const mates: [number, number, number, number, number][] = [];
    const bodies: Body[] = [];
    const positions: Position[] = [];
    for (const actor of this.actors) {
      const species = this.species[actor.species];
      if (species.motion === "giant" && actor.depth === 1) {
        threats.push([actor.x, actor.y, species.frameW * 0.5]);
      }
      if (actor.depth === 1 && species.frameW >= 50) {
        baseObstacles.push([actor.x, actor.y, species.frameW * 0.5]);
      }
      if (actor.school !== null) {
        mates.push([actor.school, actor.x, actor.y, actor.vx, actor.vy]);
      }
      const solid = grounded(species) ? 0 : actor.depth;
      bodies.push([actor.x, actor.y, solid, actor.school, species.frameW, species.frameH]);
      positions.push([actor.id, actor.x, actor.y, actor.facing]);
    }
    const food: Food[] = [];
    this.particles.forEach((particle, index) => {
      if ((FOOD_KINDS as readonly string[]).includes(particle.kind) && particle.age > 0.5) {
        food.push([index, particle.x, particle.y, particle.kind as FoodKind, particle.owner]);
      }
    });
    const current = this.current;
    const torch = this.flashlight && night > 0.2 ? this.pointer : null;
    for (const tap of this.taps) {
      tap[2] = f32(tap[2] + dt);
    }
    retain(this.taps, (tap) => tap[2] < 1.2);
    const obstacles: Threat[] = baseObstacles.concat(this.taps.map(([x, y]) => [x, y, 40] as Threat));
    const randoms: number[] = [];
    for (let n = 0; n < this.actors.length * 2; n += 1) {
      randoms.push(this.random());
    }
    const eaten: Eaten[] = [];
    const puffs: [number, number][] = [];
    const spawned: Particle[] = [];
    for (let index = 0; index < this.actors.length; index += 1) {
      const actor = this.actors[index];
      const species = this.species[actor.species];
      const r0 = randoms[index * 2];
      const r1 = randoms[index * 2 + 1];
      actor.age = f32(actor.age + dt);
      actor.turnCooldown = f32(actor.turnCooldown - dt);
      actor.turn = Math.max(f32(actor.turn - dt), 0);
      actor.burst = Math.max(f32(actor.burst - f32(dt * 0.7)), 0);
      actor.puffed = Math.max(f32(actor.puffed - dt), 0);
      actor.retarget = f32(actor.retarget - dt);
      actor.emit = f32(actor.emit - dt);
      actor.roll = Math.max(f32(actor.roll - dt), 0);
      if (actor.mood !== null) {
        stepMood(this, actor, species, dt, spawned);
      }
      if (actor.script !== null) {
        runScript(actor, species, actor.script, dt, positions);
        for (const tentacle of actor.tentacles) {
          tentacle.step([actor.x, actor.y], dt, time);
        }
        emitGlowTrail(actor, species, night, spawned, r0);
        continue;
      }
      if (actor.burrow > 0) {
        // 모래 속으로 들어가는 중이다. 그리는 쪽이 모래선 아래를 잘라 낸다.
        actor.burrow = f32(actor.burrow + dt);
        continue;
      }
      const diet = this.traits[actor.species].diet;
      // 활동 시간이 끝나면 들어간다. 개체마다 0~0.8시간씩 늦게 알아채 한꺼번에 사라지지 않는다.
      const late = (actor.phase / TAU) * 0.8;
      const offHours = !awakeAt(this.traits[actor.species].hours, (hour - late + 24) % 24);
      if (offHours && actor.mood === null && !actor.dreamt && dreamer(species) && actor.depth === 1 && !actor.isLeaving()) {
        // 두족류는 들어가기 전에 바닥 가까이 내려앉아 잠들고 꿈꾸듯 몸빛이 바뀐다.
        actor.dreamt = true;
        dream(actor, species);
      }
      if (offHours && actor.school === null && actor.mood === null) {
        actor.lifespan = Math.min(actor.lifespan, actor.age);
      }
      if (grounded(species) && actor.isLeaving() && actor.mood === null && (offHours || species.motion === "sessile")) {
        // 바닥 생물은 걸어 나가지 않고 그 자리에서 모래 속으로 들어간다.
        actor.burrow = f32(dt);
        const feet = actor.y + species.frameH * 0.45;
        for (const side of [-1, 1]) {
          spawned.push(new Particle("Dust", actor.x + side * species.frameW * 0.25, feet, side * 8, -7, 1.1, r0));
          spawned.push(new Particle("Dust", actor.x + side * species.frameW * 0.1, feet, side * 3, -10, 1.1, r1));
        }
        continue;
      }
      const school = actor.school === null ? undefined : this.schools.find((entry) => entry.id === actor.school);
      if (school !== undefined) {
        const flock = mates
          .filter((mate) => mate[0] === actor.school)
          .map((mate) => [mate[1], mate[2], mate[3], mate[4]] as [number, number, number, number]);
        steer(actor, school, flock, obstacles, dt);
        actor.x += current * 0.7 * dt;
        const nearest = minBy(
          food.filter((entry) => entry[3] === "Food" || entry[3] === diet),
          (entry) => Math.hypot(entry[1] - actor.x, entry[2] - actor.y),
        );
        if (nearest !== null && Math.hypot(nearest[1] - actor.x, nearest[2] - actor.y) < 40) {
          const [slot, fx, fy, , owner] = nearest;
          actor.x += (fx - actor.x) * Math.min(dt * 2, 1);
          actor.y += (fy - actor.y) * Math.min(dt * 2, 1);
          if (Math.hypot(fx - actor.x, fy - actor.y) < 4) {
            eaten.push([slot, fx, fy, owner !== 0 ? [actor.x, actor.y - species.frameH * 0.5 - 3] : null]);
          }
        }
        if (Math.abs(actor.vx) > 4 && signum(actor.vx) !== actor.facing && actor.turn <= 0) {
          actor.flip();
        }
        actor.anim += dt * (8 + actor.burst * 8);
        if (school.leaving()) {
          actor.lifespan = Math.min(actor.lifespan, actor.age);
        }
        emitGlowTrail(actor, species, night, spawned, r0);
        continue;
      }
      const leaving = actor.isLeaving();
      const big = bigBody(species);
      let hunger: [number, number, number, number, number] | null = null;
      // 작은 물고기는 기본 가루 먹이도 먹는다. 그 밖에는 종마다 좋아하는 먹이만 먹는다.
      const eatsFlakes = ["fish", "puff", "squid"].includes(species.motion) && species.frameW < 44;
      const eats = (kind: FoodKind) => kind === diet || (kind === "Food" && eatsFlakes);
      // 나가는 중이거나 사건 방문자라도 사용자가 직접 건넨 먹이는 먹고 간다.
      const offered = food.some((entry) => entry[4] === actor.id);
      if ((!leaving || offered) && actor.depth === 1 && (!species.visitor || offered)) {
        hunger = minBy(
          food
            .filter((entry) => eats(entry[3]) && (entry[4] === actor.id || (!leaving && !species.visitor)))
            .map(
              ([slot, fx, fy, , owner]) =>
                [slot, fx, fy, Math.hypot(fx - actor.x, fy - actor.y), owner] as [number, number, number, number, number],
            )
            // 큰 생물은 돌아서지 않으므로 앞에 있는 먹이만 본다.
            .filter((entry) => entry[3] < (entry[4] === actor.id ? 240 : 120) && (!big || (entry[1] - actor.x) * actor.facing > -4)),
          (entry) => entry[3],
        );
      }
      if (hunger !== null) {
        const [slot, fx, fy, distance, owner] = hunger;
        const thanks: [number, number] | null = owner === actor.id ? [actor.x, actor.y - species.frameH * 0.5 - 3] : null;
        if (species.motion === "sessile") {
          // 붙어 사는 생물은 가까이 떠 온 먹이를 끌어당겨 먹는다.
          const reach = species.frameW * 0.5 + 18;
          const top = actor.y - species.frameH * 0.3;
          if (distance < reach) {
            const particle = this.particles[slot];
            particle.x += (actor.x - particle.x) * Math.min(dt * 1.6, 1);
            particle.y += (top - particle.y) * Math.min(dt * 1.6, 1);
          }
          if (Math.hypot(fx - actor.x, fy - top) < species.frameW * 0.35 + 3) {
            eaten.push([slot, fx, fy, thanks]);
          }
        } else if (grounded(species)) {
          // 바닥 생물은 먹이 쪽으로 걸어가 발밑에 닿으면 먹는다.
          const toward = fx >= actor.x ? 1 : -1;
          if (toward !== actor.facing && !big && actor.turn <= 0 && Math.abs(fx - actor.x) > 3) {
            if (faceTravel(species)) actor.flip();
            else actor.facing = toward;
          }
          if (!moodStill(actor)) actor.pause = Math.min(actor.pause, 0);
          const onFloor = fy > actor.y - species.frameH * 0.5 - 6;
          if (Math.abs(fx - actor.x) < species.frameW * 0.35 + 3 && onFloor) {
            eaten.push([slot, fx, fy, thanks]);
          }
        } else if (species.motion === "jelly" || species.motion === "octopus") {
          actor.targetY = fy;
          actor.x += clamp(fx - actor.x, -1, 1) * 8 * dt;
          if (distance < species.frameW * 0.4 + 3) {
            eaten.push([slot, fx, fy, thanks]);
          }
        } else {
          actor.targetY = fy;
          if (thanks !== null) {
            // 건네받은 먹이는 곧장 입 높이를 맞춘다.
            actor.y += (fy - actor.y) * Math.min(dt * 1.5, 1);
          }
          if (!big && (fx - actor.x) * actor.facing < -4 && actor.turn <= 0 && actor.turnCooldown <= 0) {
            actor.flip();
            actor.turnCooldown = f32(0.8);
          }
          actor.burst = Math.max(actor.burst, 0.5);
          // 머리 앞쪽 절반(몸 가운데 조금 앞부터 입 조금 앞까지)에 닿으면 먹는다.
          const ahead = (fx - actor.x) * actor.facing;
          const reachX = 5 + species.frameW * 0.06;
          const reachY = Math.max(5, species.frameH * 0.3);
          if (ahead > species.frameW * 0.1 && ahead < species.frameW * 0.4 + reachX && Math.abs(actor.y - fy) < reachY) {
            eaten.push([slot, fx, fy, thanks]);
          }
        }
      }
      switch (species.motion) {
        case "jelly":
        case "octopus": {
          const cycle = fract(actor.anim / species.frames);
          const thrust = clamp(9 + (actor.y - actor.targetY) * 0.1, 3, 20);
          const push = Math.max(Math.sin(cycle * TAU), 0);
          actor.y += (2.6 - thrust * push) * dt;
          const drift = species.motion === "octopus" ? 7 : 2.5;
          actor.x += actor.facing * drift * (0.3 + push) * dt;
          actor.anim += dt * (species.motion === "octopus" ? 7 : 5.5);
          break;
        }
        case "sessile":
          // 바닥에 붙어 지낸다. 물살에 흔들리는 프레임만 넘긴다.
          actor.anim += dt * 4.5;
          break;
        case "crawl":
        case "creep": {
          actor.pause = f32(actor.pause - dt);
          if (actor.pause < -f32(2.5 + f32(r0 * 3)) && !leaving && hunger === null) {
            actor.pause = f32(0.8 + f32(r1 * 2.2));
            if (r0 < 0.35 && !big) {
              actor.facing = -actor.facing;
            }
          }
          if (actor.pause <= 0) {
            actor.x += actor.facing * actor.speed * dt;
            actor.anim += dt * 8;
            if (actor.emit <= 0 && actor.depth === 1) {
              actor.emit = f32(0.3);
              const feet = actor.y + species.frameH * 0.45;
              for (const side of [-1, 1]) {
                const x = actor.x + side * species.frameW * 0.3;
                spawned.push(new Particle("Dust", x, feet, side * (4 + r0 * 6), -6 - r1 * 5, 0.9, r0));
              }
              this.leavePrints(actor, species, spawned);
            }
          }
          break;
        }
        default: {
          const motion = species.motion;
          let pulse: number;
          if (motion === "squid") {
            const cycle = fract(actor.anim / species.frames);
            pulse = 0.35 + 1.3 * Math.max(Math.sin(cycle * TAU), 0);
          } else {
            pulse = 1 + 0.18 * Math.sin(time * 0.6 + actor.phase);
          }
          const hurry = leaving && motion === "hover" ? 2.5 : 1;
          const calm = actor.puffed > 0 || moodStill(actor) ? 0.25 : this.hover === actor.id ? 0.5 : 1;
          const dash = (1 + actor.burst) * hurry * calm;
          actor.x += actor.facing * actor.speed * pulse * dash * dt;
          let rate: number;
          switch (motion) {
            case "giant":
            case "flap":
            case "glide":
              rate = 6;
              break;
            case "hover":
              rate = 5;
              break;
            case "squid":
              rate = 6.5;
              break;
            default:
              rate = 8 + actor.speed * 0.12;
              break;
          }
          actor.anim += dt * rate * dash;
          break;
        }
      }
      let drift: number;
      switch (species.motion) {
        case "giant":
        case "flap":
          drift = 0.2;
          break;
        case "glide":
        case "crawl":
        case "creep":
        case "sessile":
          drift = 0;
          break;
        case "jelly":
        case "octopus":
          drift = 1;
          break;
        default:
          drift = 0.6;
          break;
      }
      actor.x += current * drift * dt;
      if (torch !== null && actor.depth === 1) {
        const [px, py] = torch;
        const distance = Math.hypot(px - actor.x, py - actor.y);
        const nocturnal = species.activity === "night" || species.glow;
        if (nocturnal && distance < 120) {
          actor.targetY = py;
          if (faceTravel(species) && !big && (px - actor.x) * actor.facing < -6 && actor.turn <= 0) {
            actor.flip();
          }
        } else if (!nocturnal && distance < 60 && faceTravel(species)) {
          if (!big && (px - actor.x) * actor.facing > 0 && actor.turn <= 0) {
            actor.flip();
          }
          actor.burst = Math.max(actor.burst, 0.8);
        }
      }
      if (!grounded(species)) {
        actor.y += (actor.targetY - actor.y) * Math.min(dt * 0.45, 1);
        if (actor.retarget <= 0 && hunger === null) {
          actor.retarget = f32(5 + f32(r0 * 7));
          actor.targetY = swimBand(species, r1);
        }
      }
      const margin = species.frameW * 0.5 + 6;
      const towardEdge = (actor.facing > 0 && actor.x > WIDTH - margin) || (actor.facing < 0 && actor.x < margin);
      const inside = actor.x > margin * 0.5 && actor.x < WIDTH - margin * 0.5;
      const near = (range: number): boolean =>
        threats.some(([px, py, width]) => {
          const ahead = (px - actor.x) * actor.facing;
          return ahead > 0 && ahead < width + range && Math.abs(py - actor.y) < 30;
        });
      const prey = (species.motion === "fish" || species.motion === "squid") && actor.depth === 1 && !big;
      if (species.motion === "puff" && actor.depth === 1 && actor.puffed <= 0 && near(40)) {
        actor.puffed = 3.5;
        puffs.push([actor.x, actor.y]);
      } else if (prey && actor.turn <= 0 && near(34)) {
        actor.flip();
        actor.burst = f32(1.4);
        actor.turnCooldown = 3;
        actor.targetY += r1 < 0.5 ? -18 : 18;
      } else if (big) {
        // 큰 생물은 중간에 돌아서지 않는다. 가장자리에 닿으면 그대로 화면 밖으로 나간다.
        if (!leaving && towardEdge && !inside) {
          actor.lifespan = Math.min(actor.lifespan, actor.age);
        }
      } else if (!leaving && towardEdge && inside) {
        actor.flip();
        actor.turnCooldown = f32(5 + f32(r1 * 6));
      } else if (!leaving && faceTravel(species) && actor.turnCooldown <= 0 && r0 < dt * 0.05 && hunger === null && actor.mood === null) {
        actor.flip();
        actor.turnCooldown = f32(7 + f32(r1 * 8));
      }
      if (!grounded(species)) {
        let push = 0;
        for (let other = 0; other < bodies.length; other += 1) {
          const [x, y, depth, otherSchool, w, h] = bodies[other];
          if (other === index || depth !== actor.depth || otherSchool !== null) {
            continue;
          }
          const dx = actor.x - x;
          const dy = actor.y - y;
          const reachX = (species.frameW + w) * 0.5 + 4;
          const reachY = (species.frameH + h) * 0.5 + 2;
          if (Math.abs(dx) < reachX && Math.abs(dy) < reachY) {
            const side = Math.abs(dy) < 0.5 ? (index < other ? -1 : 1) : signum(dy);
            push += side * (1 - Math.abs(dy) / reachY);
          }
        }
        actor.y += clamp(push, -1.5, 1.5) * dt * 20;
        actor.targetY += clamp(push, -1.5, 1.5) * dt * 16;
      }
      const half = species.frameH * 0.5;
      if (species.motion === "jelly" || species.motion === "octopus") {
        if (leaving) {
          actor.targetY = -HEIGHT;
        } else {
          actor.y = Math.max(actor.y, SWIM_TOP + half * 0.5);
        }
      } else {
        actor.y = clamp(actor.y, Math.min(SWIM_TOP, FLOOR_Y - half), FLOOR_Y + 12 - half);
      }
      for (const tentacle of actor.tentacles) {
        tentacle.step([actor.x, actor.y], dt, time);
      }
      emitGlowTrail(actor, species, night, spawned, r0);
    }
    // 복어가 갑자기 부풀면 둘레 물고기도 덩달아 놀라 흩어진다(연쇄 반응).
    for (const [x, y] of puffs) {
      this.startle(x, y, 60);
    }
    // 안정 정렬 뒤 같은 칸이 이어지면 처음 것만 남긴다.
    eaten.sort((a, b) => a[0] - b[0]);
    const unique = eaten.filter((entry, position) => position === 0 || eaten[position - 1][0] !== entry[0]);
    for (const [slot, x, y, thanks] of unique) {
      this.particles[slot].age = this.particles[slot].life;
      for (let burst = 0; burst < 4; burst += 1) {
        const angle = burst * 1.7 + x;
        spawned.push(new Particle("Chomp", x, y, Math.cos(angle) * 14, Math.sin(angle) * 14, 0.5, 0));
      }
      // 먹이를 받은 생물이 먹으면 고맙다는 하트가 뜬다.
      if (thanks !== null) {
        spawned.push(new Particle("Heart", thanks[0], thanks[1], 0, -10, 1.4, 0));
      }
    }
    this.popBubbles(spawned);
    this.particles.push(...spawned);
    stepParticles(this.particles, dt, time, current);
    const species = this.species;
    retain(this.actors, (actor) => {
      const reach = species[actor.species].frameW;
      const tall = species[actor.species].frameH;
      const outside = actor.x < -reach || actor.x > WIDTH + reach || actor.y < -tall || actor.y > HEIGHT + tall;
      return !(actor.isLeaving() && outside) && actor.age < actor.lifespan + LINGER && actor.burrow < BURROW_SECONDS;
    });
    const actors = this.actors;
    retain(this.schools, (school) => !school.leaving() || actors.some((actor) => actor.school === school.id));
    const roll = this.random();
    this.weather.step(dt, roll);
    this.stepEvents(daylight);
    stepDirector(this, dt);
    observe(this, dt);
    this.spawnTimer = f32(this.spawnTimer + dt);
    if (this.spawnTimer >= f32(1.6)) {
      this.spawnTimer = f32(this.spawnTimer - f32(1.6));
      this.spawnRandom();
    }
  }

  stepEvents(daylight: number): void {
    const whalePresent = this.farThings.some((thing) => thing.kind === "Whale");
    if (!whalePresent && this.time >= this.nextWhale) {
      const facing = this.random() < 0.5 ? 1 : -1;
      const y = 70 + this.random() * 45;
      this.farThings.push(new FarThing("Whale", facing, y));
      this.nextWhale = f32(f32(this.time + 170) + f32(this.random() * 90));
    }
    if (this.time >= this.nextStorm && daylight > 0.5 && !this.weather.active()) {
      this.weather.start(45);
      this.nextStorm = f32(f32(this.time + 320) + f32(this.random() * 180));
    }
  }

  /** 누적 시간이 `seconds`가 될 때까지 30Hz로 진행한다. */
  advanceTo(seconds: number): void {
    const steps = toUsize(round(f32(Math.max(f32(f32(seconds) - this.time), 0) * 30)));
    for (let n = 0; n < steps; n += 1) {
      this.step(f32(1 / 30));
    }
  }

  /** 걷는 바닥 생물이 모래에 발자국(게는 좌우 점, 기는 생물은 가는 줄)을 두 걸음에 한 번 남긴다. 60개를 넘으면 남기지 않는다. */
  leavePrints(actor: Actor, species: Species, spawned: Particle[]): void {
    if (Math.floor(actor.anim / 2.4) % 2 === 1) return;
    let count = 0;
    for (const particle of this.particles) {
      if (particle.kind === "Print") count += 1;
    }
    if (count >= 60) return;
    const bottom = Math.min(actor.y + species.frameH * 0.5 - 1, FLOOR_Y + 8);
    if (species.motion === "crawl") {
      // 걸음마다 앞뒤로 엇갈려 찍힌다.
      const stagger = Math.floor(actor.anim) % 2 === 0 ? 2 : -2;
      for (const side of [-1, 1]) {
        spawned.push(new Particle("Print", actor.x + side * species.frameW * 0.28 + stagger, bottom, 0, 0, 18, 0));
      }
    } else {
      spawned.push(new Particle("Print", actor.x - actor.facing * species.frameW * 0.3, bottom, actor.facing, 0, 18, 1));
    }
  }

  /** 포인터가 스친 기포(떠오르는 기포 입자와 기포 줄기 알)를 톡 터뜨린다. 클릭은 필요 없다. */
  popBubbles(spawned: Particle[]): void {
    const pointer = this.pointer;
    if (pointer === null || !this.started || this.dex.open) return;
    const [px, py] = pointer;
    for (const particle of this.particles) {
      if (particle.kind === "Bubble" && particle.age < particle.life && Math.hypot(particle.x - px, particle.y - py) < 4) {
        particle.age = particle.life;
        spawned.push(new Particle("Pop", particle.x, particle.y, 0, 0, 0.35, 0));
      }
    }
    for (const bubble of ventBubbles(this.time)) {
      if (bubble.popping !== null || this.popped.has(bubble.key)) continue;
      if (Math.hypot(bubble.x - px, bubble.y - py) < 3 + bubble.size) {
        // 이 알은 이번 오름이 끝날 때까지 다시 그리지 않는다.
        this.popped.set(bubble.key, this.time + 30);
        spawned.push(new Particle("Pop", bubble.x, bubble.y, 0, 0, 0.35, 1));
      }
    }
    for (const [key, until] of this.popped) {
      if (this.time > until) this.popped.delete(key);
    }
  }

  /** 무리는 한 단위로 센다. */
  units(): number {
    return this.actors.filter((actor) => actor.school === null).length + this.schools.length;
  }

  spawn(species: number, initial: boolean): number {
    const entry = this.species[species];
    const facing = this.random() < 0.5 ? 1 : -1;
    let speed: number;
    switch (entry.motion) {
      case "giant":
        speed = 11 + this.random() * 5;
        break;
      case "flap":
      case "glide":
        speed = 8 + this.random() * 4;
        break;
      case "hover":
        speed = 2.5 + this.random() * 2;
        break;
      case "crawl":
        speed = 7 + this.random() * 4;
        break;
      case "creep":
        speed = 4 + this.random() * 4;
        break;
      case "sessile":
        speed = 0;
        break;
      case "eel":
        speed = 8 + this.random() * 6;
        break;
      case "squid":
        speed = 13 + this.random() * 5;
        break;
      case "puff":
        speed = 7 + this.random() * 4;
        break;
      default:
        speed = 11 + this.random() * 10;
        break;
    }
    const band = this.random();
    let y = grounded(entry) ? FLOOR_Y + 4 * this.random() - entry.frameH * 0.5 : swimBand(entry, band);
    const depth = ["giant", "fish", "eel"].includes(entry.motion) && this.random() < 0.3 ? 0 : 1;
    let x: number;
    if (initial) {
      x = this.initialX(y, entry.frameW);
    } else if (entry.motion === "sessile") {
      x = 30 + this.random() * (WIDTH - 60);
    } else if (faceTravel(entry) || grounded(entry)) {
      x = facing > 0 ? -entry.frameW * 0.5 - 4 : WIDTH + entry.frameW * 0.5 + 4;
    } else {
      x = 40 + this.random() * (WIDTH - 80);
    }
    const drifter = entry.motion === "jelly" || entry.motion === "octopus";
    if (drifter && !initial) {
      y = HEIGHT + entry.frameH * 0.5;
    }
    const id = this.nextId;
    this.nextId += 1;
    const actor = new Actor();
    actor.id = id;
    actor.species = species;
    actor.x = x;
    actor.y = y;
    actor.facing = facing;
    actor.depth = depth;
    // 이 순서대로 난수를 쓴다: phase, anim, lifespan, retarget, turnCooldown.
    actor.phase = this.random() * TAU;
    actor.anim = this.random() * entry.frames;
    actor.age = initial ? 1.5 : 0;
    actor.lifespan = f32(30 + f32(this.random() * 35));
    actor.speed = speed;
    actor.targetY = drifter ? swimBand(entry, band) : y;
    actor.retarget = f32(3 + f32(this.random() * 6));
    actor.turnCooldown = f32(4 + f32(this.random() * 6));
    actor.variant = entry.visitor ? 0 : variantOf(id, 1 / 90);
    actor.individual = entry.visitor && entry.id !== "diver" ? Math.floor(hash01(id, 3.3) * 3) : -1;
    if (entry.motion === "sessile" && !initial) {
      // 붙어 사는 생물은 모래에서 쑥 올라오며 나타난다.
      actor.emerging = true;
      for (const side of [-1, 1]) {
        this.particles.push(new Particle("Dust", x + side * entry.frameW * 0.25, y + entry.frameH * 0.45, side * 7, -6, 1, 0.5));
      }
    }
    const spec = tentacleSpec(entry.id);
    if (spec !== null) {
      const [count, segments, segment, anchorY] = spec;
      const width = entry.frameW * 0.5;
      for (let strand = 0; strand < count; strand += 1) {
        const spread = ((strand + 0.5) / count) * 2 - 1;
        const anchor: [number, number] = [spread * width, entry.frameH * anchorY];
        const phase = this.random() * TAU;
        actor.tentacles.push(new Tentacle(anchor, [x, y], segments, segment, phase));
      }
    }
    this.actors.push(actor);
    return this.actors.length - 1;
  }

  initialX(y: number, width: number): number {
    let best: [number, number] = [WIDTH * 0.5, -1];
    for (let n = 0; n < 40; n += 1) {
      const x = width * 0.5 + 8 + this.random() * (WIDTH - width - 16);
      const titleClear = this.started || !(x >= 130 && x < 350) || !(y >= 60 && y < 160);
      let nearest = Infinity;
      for (const actor of this.actors) {
        nearest = Math.min(nearest, Math.hypot(x - actor.x, (y - actor.y) * 1.6));
      }
      if (titleClear && nearest > best[1]) {
        best = [x, nearest];
      }
      if (titleClear && nearest > 70) {
        break;
      }
    }
    return best[0];
  }

  spawnSchool(species: number, initial: boolean): void {
    const id = this.nextSchool;
    this.nextSchool += 1;
    const heading = initial || this.random() < 0.5 ? 1 : -1;
    const x = initial ? 90 : heading > 0 ? -30 : WIDTH + 30;
    const lifespan = f32(60 + f32(this.random() * 30));
    const phase = this.random() * TAU;
    const school = new School({ id, x, y: 140, heading, age: 0, lifespan, phase, lift: 0 });
    // 작은 무리 물고기는 크게, 오징어처럼 큰 종은 작게 모인다.
    const count = (this.species[species].frameW <= 30 ? 24 : 12) + toUsize(this.random() * 6);
    for (let n = 0; n < count; n += 1) {
      const index = this.spawn(species, initial);
      const dx = (this.random() - 0.5) * 50;
      const dy = (this.random() - 0.5) * 30;
      const actor = this.actors[index];
      actor.school = id;
      actor.depth = 1;
      actor.x = school.x - heading * 20 + dx;
      actor.y = school.y + dy;
      actor.vx = heading * 20;
      actor.facing = heading;
      actor.lifespan = 400;
      actor.tentacles = [];
      // 무리 안에서는 더 드물게 나온다(한 무리에 20마리가 넘기 때문).
      actor.variant = variantOf(actor.id, 1 / 450);
    }
    this.schools.push(school);
  }

  spawnRandom(): void {
    if (this.units() >= MAX_UNITS) {
      return;
    }
    const night = this.daylight() < 0.4;
    const hour = this.hour();
    const hasSchool = this.schools.length > 0;
    const giants = this.countWhere((entry) => entry.motion === "giant");
    const rays = this.countWhere((entry) => entry.motion === "flap");
    const jellies = this.countWhere((entry) => entry.motion === "jelly");
    const crawlers = this.countWhere((entry) => entry.motion === "crawl" || entry.motion === "creep");
    const sessiles = this.countWhere((entry) => entry.motion === "sessile");
    const allowed = (index: number): boolean => {
      const entry = this.species[index];
      if (entry.visitor || !awakeAt(this.traits[index].hours, hour)) {
        return false;
      }
      const same = this.actors.filter((actor) => actor.species === index && actor.school === null).length;
      let blocked: boolean;
      switch (entry.motion) {
        case "giant":
          blocked = giants >= 1;
          break;
        case "flap":
          blocked = rays >= 1;
          break;
        case "jelly":
          blocked = jellies >= 3;
          break;
        case "crawl":
        case "creep":
          blocked = crawlers >= 3;
          break;
        case "sessile":
          blocked = sessiles >= 3;
          break;
        default:
          blocked = entry.group === "school" && hasSchool;
          break;
      }
      const limit = entry.motion === "fish" ? 2 : 1;
      return !blocked && same < limit;
    };
    const launch = (index: number): void => {
      if (this.species[index].group === "school") {
        this.spawnSchool(index, false);
      } else {
        this.spawn(index, false);
      }
    };
    // 밤에는 빛나는 생물을 먼저 부른다(발광 생물이 셋 모이기 전까지).
    const glowing = this.actors.filter((actor) => actor.school === null && this.species[actor.species].glow).length;
    if (this.nightStrength() > 0.5 && glowing < 3 && this.random() < 0.6) {
      const pool: number[] = [];
      this.species.forEach((entry, index) => {
        if (entry.glow && !entry.visitor) pool.push(index);
      });
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const index = pool[pickIndex(this.random(), pool.length)];
        if (allowed(index)) {
          launch(index);
          return;
        }
      }
    }
    // 활동 시간이 막 시작된 종(1.5시간 안)을 먼저 부른다. 해 질 녘에 야행성 생물이 몰려나오는 느낌을 낸다.
    const fresh: number[] = [];
    this.species.forEach((entry, index) => {
      const hours = this.traits[index].hours;
      const since = hoursSinceStart(hours, hour);
      if (!entry.visitor && hours[1] - hours[0] < 24 && since !== null && since < 1.5) {
        fresh.push(index);
      }
    });
    if (fresh.length > 0 && this.random() < 0.6) {
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const index = fresh[pickIndex(this.random(), fresh.length)];
        if (allowed(index)) {
          launch(index);
          return;
        }
      }
    }
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const index = pickIndex(this.random(), this.species.length);
      if (!allowed(index)) {
        continue;
      }
      if (night && !this.species[index].glow && this.random() < 0.4) {
        continue;
      }
      launch(index);
      return;
    }
  }

  countWhere(rule: (entry: Species) => boolean): number {
    return this.actors.filter((actor) => actor.school === null && rule(this.species[actor.species])).length;
  }

  random(): number {
    return this.rng.next();
  }
}

/** 개체 번호로 정하는 희귀 색 변이다. 황금 45%, 알비노 35%, 흑색 20%다. */
function variantOf(id: number, rate: number): Variant {
  if (hash01(id, 1.7) >= rate) return 0;
  const kind = hash01(id, 5.1);
  return kind < 0.45 ? 1 : kind < 0.8 ? 2 : 3;
}

/** 사건이 붙인 동작을 한 frame 진행한다. 목표점을 향해 속도 한도 안에서 움직이고 진행 방향을 바라본다. */
function runScript(actor: Actor, species: Species, script: Script, dt: number, positions: Position[]): void {
  let tx: number;
  let ty: number;
  let speed: number;
  switch (script.kind) {
    case "Goto":
      tx = script.x;
      ty = script.y;
      speed = script.speed;
      break;
    case "Orbit": {
      const next = script.angle + script.rate * dt;
      actor.script = { ...script, angle: next };
      tx = script.cx + Math.cos(next) * script.rx;
      ty = script.cy + Math.sin(next) * script.ry;
      speed = 120;
      break;
    }
    case "Follow": {
      const leader = positions.find((entry) => entry[0] === script.leader);
      if (leader === undefined) {
        actor.script = null;
        return;
      }
      const [, lx, ly, facing] = leader;
      tx = lx + script.dx * facing;
      ty = ly + script.dy;
      speed = 70;
      break;
    }
  }
  const dx = tx - actor.x;
  const dy = ty - actor.y;
  const distance = Math.hypot(dx, dy);
  const step = Math.min(speed * dt, distance);
  if (distance > 0.01) {
    actor.x += (dx / distance) * step;
    actor.y += (dy / distance) * step;
  }
  if (faceTravel(species) && Math.abs(dx) > 1.5 && step > 0.05 && signum(dx) !== actor.facing && actor.turn <= 0) {
    actor.flip();
  }
  actor.targetY = actor.y;
  const moving = distance > 1 ? 1 : 0.35;
  actor.anim += dt * 8 * moving * (1 + actor.burst);
}

/** 밤에 빛나는 생물이 지나간 자리에 청록 궤적을 남긴다. 거의 제자리에 떠 있는 해파리·문어·부유 생물은 궤적이 한 점에 쌓여 남기지 않는다. */
function emitGlowTrail(actor: Actor, species: Species, night: number, spawned: Particle[], roll: number): void {
  if (species.glowCenter === null || ["jelly", "octopus", "hover"].includes(species.motion)) {
    return;
  }
  const [gx, gy] = species.glowCenter;
  if (night < 0.3 || actor.depth === 0 || actor.emit > 0) {
    return;
  }
  actor.emit = f32(actor.school !== null ? 0.35 : 0.08);
  const facing = faceTravel(species) ? actor.facing : 1;
  spawned.push(new Particle("Trail", actor.x + gx * facing, actor.y + gy, (roll - 0.5) * 4, -1, 1.4, roll));
}

/** 촉수를 매다는 종의 (가닥 수, 마디 수, 마디 길이, 몸 높이 대비 뿌리 위치)다. */
function tentacleSpec(id: string): [number, number, number, number] | null {
  // 태평양쐐기해파리는 스프라이트에 긴 촉수가 이미 있어 덧붙이지 않는다.
  return id === "moon-jelly" ? [6, 8, 3, 0.08] : null;
}

/** 종마다 머무는 물 높이 범위에서 한 점을 고른다. */
export function swimBand(species: Species, t: number): number {
  const half = species.frameH * 0.5;
  let top: number;
  let bottom: number;
  switch (species.motion) {
    case "giant":
    case "flap":
      [top, bottom] = [60, 150];
      break;
    case "jelly":
      [top, bottom] = [50, 170];
      break;
    case "hover":
      [top, bottom] = [130, 205];
      break;
    case "octopus":
      [top, bottom] = [140, 210];
      break;
    case "school":
      [top, bottom] = [70, 190];
      break;
    case "eel":
      [top, bottom] = [110, 215];
      break;
    default:
      [top, bottom] = [SWIM_TOP + half, SWIM_BOTTOM - half];
      break;
  }
  return top + Math.max(bottom - top, 0) * t;
}
