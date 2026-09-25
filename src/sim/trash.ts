// 바다 쓰레기: 10~20초마다 수면에서 하나씩 가라앉아 바닥에 쌓인다.
// 10개부터 물이 갈색 섞인 초록으로 탁해지고, 쌓일수록 수초가 시들어 사라지며, 30개면 새 생물이 오지 않는다.
// 누르면(클릭·탭) 치운다. 시뮬레이션 난수와 섞이지 않게 전용 난수를 쓴다(평소 동작과 기준 기록은 그대로다).

import trashJson from "../data/trash.json";
import { FLOOR_Y, WIDTH } from "./constants";
import { Particle } from "./life";
import { mixSeed, Rng } from "./rng";

/** scripts/build_fx.py가 굽는 쓰레기 목록(종류, 이름, 그림, 크기)이다. */
export interface TrashInfo {
  kind: string;
  name: string;
  texture: string;
  w: number;
  h: number;
}

export const TRASH_INFO = trashJson as TrashInfo[];
/** 이만큼 쌓이면 물이 탁해지기 시작한다. */
export const DIRTY_FROM = 10;
/** 이만큼 쌓이면 새 생물이 오지 않고 수초가 모두 사라진다. */
export const DEAD_AT = 30;
/** 쓰레기가 떨어지는 간격(초)이다: 10~20초. */
const GAP_MIN = 10;
const GAP_SPREAD = 10;
/** 종류마다 가라앉는 빠르기(px/초)와 옆으로 흔들리는 폭이다. 비닐·마스크는 느리게 나풀거린다. */
const SINK: Record<string, [number, number]> = {
  can: [13, 4],
  bottle: [10, 6],
  bag: [7, 14],
  boot: [15, 3],
  tire: [16, 2],
  glass: [14, 3],
  mask: [7, 12],
  net: [9, 9],
};

export class Trash {
  landed = false;
  age = 0;

  constructor(
    readonly id: number,
    readonly kind: number,
    public x: number,
    public y: number,
    readonly seed: number,
  ) {}

  get info(): TrashInfo {
    return TRASH_INFO[this.kind];
  }

  /** 가라앉는 동안 나풀거리는 기울기(라디안)다. 바닥에 닿으면 0이다. */
  tilt(): number {
    return this.landed ? 0 : Math.sin(this.age * 1.7 + this.seed * 9) * 0.35;
  }
}

export class Litter {
  items: Trash[] = [];
  /** 지금까지 치운 쓰레기 수다. */
  cleaned = 0;
  /** 물이 탁한 정도(0..1)를 쓰레기 수에 몇 초에 걸쳐 따라가게 한 값이다. 물빛·수초가 이 값을 쓴다. */
  gloom = 0;
  /** 다음 쓰레기가 떨어질 시각(초)이다. */
  next: number;
  private readonly rng: Rng;
  private nextId = 1;

  constructor(seed: number | bigint) {
    this.rng = new Rng(mixSeed(BigInt.asUintN(64, BigInt(seed) ^ 0x7a5e7a5en)));
    this.next = 12 + this.rng.next() * GAP_SPREAD;
  }

  count(): number {
    return this.items.length;
  }

  /** 쓰레기 수로 정한 탁함 목표값이다. 10개에서 눈에 띄게 탁해지기 시작해 30개에서 가장 탁하다. */
  dirt(): number {
    const count = this.count();
    if (count < DIRTY_FROM) return 0;
    return Math.min(1, 0.3 + (0.7 * (count - DIRTY_FROM)) / (DEAD_AT - DIRTY_FROM));
  }

  /** 새 생물이 오지 않을 만큼 쌓였는지다. */
  dead(): boolean {
    return this.count() >= DEAD_AT;
  }

  /** 새 생물을 부를지 정한다. 10개를 넘으면 쌓인 만큼 덜 오고, 30개면 오지 않는다. */
  allowsSpawn(): boolean {
    const count = this.count();
    if (count >= DEAD_AT) return false;
    if (count <= DIRTY_FROM) return true;
    return this.rng.next() >= (count - DIRTY_FROM) / (DEAD_AT - DIRTY_FROM);
  }

  step(time: number, dt: number, started: boolean, spawned: Particle[]): void {
    if (started && time >= this.next) {
      this.drop(24 + this.rng.next() * (WIDTH - 48));
      this.next = time + GAP_MIN + this.rng.next() * GAP_SPREAD;
    }
    for (const item of this.items) {
      if (item.landed) continue;
      item.age += dt;
      const [speed, sway] = SINK[item.info.kind] ?? [10, 4];
      item.y += speed * dt;
      item.x += Math.cos(item.age * 1.7 + item.seed * 9) * sway * dt;
      const rest = this.restY(item);
      if (item.y >= rest) {
        item.y = rest;
        item.landed = true;
        // 모래에 닿으며 먼지가 인다.
        for (const side of [-1, 1]) {
          spawned.push(new Particle("Dust", item.x + side * item.info.w * 0.3, rest + item.info.h * 0.4, side * 7, -6, 1, item.seed));
        }
      }
    }
    // 물빛은 쓰레기 수를 3초쯤에 걸쳐 따라간다(치우면 서서히 맑아진다).
    this.gloom += (this.dirt() - this.gloom) * Math.min(1, dt * 0.35);
  }

  /** 쓰레기 하나를 수면에서 떨어뜨린다. */
  drop(x: number, kind?: number): Trash {
    const item = new Trash(this.nextId++, kind ?? Math.floor(this.rng.next() * TRASH_INFO.length) % TRASH_INFO.length, x, 12, this.rng.next());
    this.items.push(item);
    return item;
  }

  /** 바닥(또는 먼저 쌓인 쓰레기 위)에 놓일 높이다. 겹치는 쓰레기마다 4px씩 올라가 쌓인다. */
  restY(item: Trash): number {
    let pile = 0;
    for (const other of this.items) {
      if (other === item || !other.landed) continue;
      if (Math.abs(other.x - item.x) < (other.info.w + item.info.w) * 0.5 - 3) pile += 1;
    }
    return FLOOR_Y + 3 - item.info.h * 0.5 - Math.min(pile, 6) * 4;
  }

  /** 쓰레기를 치운다(반짝임과 기포가 오른다). 치운 쓰레기를 돌려준다. */
  pick(id: number, spawned: Particle[]): Trash | null {
    const index = this.items.findIndex((item) => item.id === id);
    if (index < 0) return null;
    const [item] = this.items.splice(index, 1);
    this.cleaned += 1;
    for (let n = 0; n < 6; n += 1) {
      const angle = (n / 6) * Math.PI * 2;
      spawned.push(new Particle("Spark", item.x, item.y, Math.cos(angle) * 22, Math.sin(angle) * 16 - 6, 0.7, 0));
    }
    spawned.push(new Particle("Bubble", item.x, item.y - 4, 0, -16, 3, item.seed));
    return item;
  }

  /** 캡처·테스트용: 바닥에 쓰레기 n개를 미리 쌓는다(물빛도 바로 맞춘다). */
  seed(count: number): void {
    for (let n = 0; n < count; n += 1) {
      const item = this.drop(20 + ((n * 97) % (WIDTH - 40)), n % TRASH_INFO.length);
      item.y = this.restY(item);
      item.landed = true;
    }
    this.gloom = this.dirt();
  }
}
