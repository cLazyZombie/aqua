// 생물 주변의 작은 생명감: 흐름장 플랑크톤, 먹이, 모래 먼지, 발광 궤적, 해파리 촉수.

import { FLOOR_Y, HEIGHT, TAU, visible } from "./constants";
import { remEuclid, retain } from "./num";

/**
 * - Dust: 게가 걸을 때 이는 모래 먼지
 * - Trail: 밤 발광 생물이 지나간 자리에 남는 청록 빛
 * - Chomp: 먹이를 먹을 때 튀는 부스러기
 * - Food: 클릭으로 뿌린 먹이
 * - Plankton: 흐름장을 따라 떠도는 플랑크톤(화면 밖으로 나가면 반대편에서 들어온다)
 * - Cookie: 큰 물고기가 먹는 동글동글한 물고기 과자
 * - Bubble: 떠오르다 수면에서 터지는 자유 기포
 * - Ink: 문어 먹물
 * - Spark: 루어가 번쩍이는 빛 알갱이
 * - Heart: 해마 커플의 하트
 * - Exclaim: 대치 중인 게 머리 위 느낌표
 * - Spawn: 산호가 뿜은 알
 * - Meteor: 수면 위를 긋는 유성
 * - Ring: 퍼지는 고리(반지름은 나이로 정한다)
 * - Gold: 열린 보물상자의 금빛 반짝임
 * - Leaf: 초식 생물이 먹는 해초 잎(천천히 흔들리며 가라앉는다)
 * - Pellet: 바닥 생물이 먹는 알갱이(빨리 가라앉아 모래 위에 머문다)
 * - Glimmer: 해파리·여과 섭식 생물이 먹는 반짝 플랑크톤 가루(물살 따라 떠돈다)
 * - Note: 노래·춤 교감의 음표
 * - Zap: 전기 교감의 파란 불꽃
 * - Love: 교감으로 떠오르는 큰 하트
 * - Print: 모래 위 발자국·기어간 줄·물건이 파인 자국(seed 0 점, 1 줄, 2 파임. 줄은 vx에 방향을 둔다)
 * - Pop: 포인터가 스쳐 터진 기포의 작은 고리
 * - Donut: 흰고래·다이버가 부는 도넛 모양 기포 고리(천천히 커지며 떠오른다)
 * - Fry: 갓 태어난 치어·새끼 해마(seed 0.9 이상은 흰동가리 주황)
 * - Firework: 수면 위 불꽃 한 알(seed가 색)
 */
export type ParticleKind =
  | "Dust"
  | "Trail"
  | "Chomp"
  | "Food"
  | "Plankton"
  | "Cookie"
  | "Bubble"
  | "Ink"
  | "Spark"
  | "Heart"
  | "Exclaim"
  | "Spawn"
  | "Meteor"
  | "Ring"
  | "Gold"
  | "Leaf"
  | "Pellet"
  | "Glimmer"
  | "Note"
  | "Zap"
  | "Love"
  | "Print"
  | "Pop"
  | "Donut"
  | "Fry"
  | "Firework";

export class Particle {
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age = 0;
  life: number;
  seed: number;
  /** 생물을 눌러 준 먹이면 그 생물 id다(0이면 누구나 먹는 먹이). */
  owner = 0;

  constructor(kind: ParticleKind, x: number, y: number, vx: number, vy: number, life: number, seed: number) {
    this.kind = kind;
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.life = life;
    this.seed = seed;
  }

  /** 남은 수명 비율(1에서 0으로 줄어듦)이다. */
  remaining(): number {
    return Math.min(Math.max(1 - this.age / this.life, 0), 1);
  }
}

/** 바닥 두 곳에서 수면까지 오르는 기포 줄기의 x 위치다. */
export const VENTS = [62, 418];
/** 기포 줄기가 터지는 수면 높이다. */
export const SURFACE_Y = 22;

/** 기포 줄기 한 알(줄기 번호, 알 번호, 몇 번째 오름인지, 위치, 크기 단계 0..2)이다. */
export interface VentBubble {
  key: string;
  x: number;
  y: number;
  size: number;
  /** 수면에 닿아 터지는 중이면 0..8의 진행도, 아니면 null이다. */
  popping: number | null;
}

/** 시간만으로 정해지는 기포 줄기 알들이다. 그리기와 포인터 터뜨리기가 같은 위치를 쓴다. */
export function ventBubbles(time: number): VentBubble[] {
  const out: VentBubble[] = [];
  VENTS.forEach((x0, vent) => {
    for (let bead = 0; bead < 6; bead++) {
      const seed = vent * 17 + bead;
      const speed = 16 + hashf32(seed) * 10;
      const span = FLOOR_Y - SURFACE_Y;
      const clock = time * speed + hashf32(seed + 3) * 400;
      const travel = remEuclid(clock, span + 8);
      const cycle = Math.floor(clock / (span + 8));
      const x = x0 + Math.sin(time * 2.4 + seed) * (1 + travel * 0.02);
      const size = travel > 120 ? 2 : bead % 3 === 0 ? 1 : 0;
      out.push({ key: `${vent}:${bead}:${cycle}`, x, y: FLOOR_Y - travel, size, popping: travel > span ? travel - span : null });
    }
  });
  return out;
}

/** 그리는 쪽 `hash`와 같은 f32 해시다(기포 줄기 위치가 예전 그림과 같게). */
function hashf32(seed: number): number {
  const f = Math.fround;
  const s = f(Math.sin(f(f(seed) * f(12.9898))));
  const v = f(s * f(43758.547));
  return Math.abs(f(v - Math.trunc(v)));
}

/** 느리게 변하는 흐름 함수의 curl. 발산이 없어 입자가 한곳에 뭉치지 않고 소용돌이치며 흐른다. */
export function flow(x: number, y: number, time: number): [number, number] {
  const a = 0.021;
  const b = 0.027;
  const p = x * a + time * 0.11;
  const q = y * b - time * 0.07;
  const p2 = x * 0.047 - time * 0.05;
  const q2 = y * 0.039 + time * 0.09;
  const u = b * Math.sin(p) * Math.cos(q) * 420 + 0.039 * Math.sin(p2) * Math.cos(q2) * 160;
  const v = -a * Math.cos(p) * Math.sin(q) * 420 - 0.047 * Math.cos(p2) * Math.sin(q2) * 160;
  return [u, v];
}

/** 생물을 눌러 건넨 먹이가 가라앉기 전에 그 자리에 떠 있는 시간(초)이다. 받은 생물이 다가올 틈을 준다. */
export const OFFER_SECONDS = 1.2;

/** 입자를 움직인다. `current`는 가로 해류(px/s)다. */
export function stepParticles(particles: Particle[], dt: number, time: number, current: number): void {
  for (const particle of particles) {
    particle.age += dt;
    if (particle.owner !== 0 && particle.age < OFFER_SECONDS) {
      // 손으로 건넨 먹이는 잠깐 제자리에서 살랑거린다.
      particle.x += Math.sin(time * 3 + particle.seed * TAU) * 2 * dt;
      continue;
    }
    switch (particle.kind) {
      case "Plankton": {
        const [u, v] = flow(particle.x, particle.y, time);
        particle.x = remEuclid(particle.x + (u + current) * dt - visible.left + 10, visible.right - visible.left + 20) + visible.left - 10;
        particle.y = remEuclid(particle.y + (v + 1.2) * dt - 24, HEIGHT - 30) + 24;
        particle.age %= particle.life;
        break;
      }
      case "Food":
      case "Cookie": {
        if (particle.y < FLOOR_Y - 2) {
          const sink = particle.kind === "Cookie" ? 10 : 7;
          particle.y += sink * dt;
          particle.x += (Math.sin(time * 2.3 + particle.seed * TAU) * 6 + current * 0.8) * dt;
        }
        break;
      }
      case "Leaf": {
        if (particle.y < FLOOR_Y - 2) {
          particle.y += (4 + Math.sin(time * 1.7 + particle.seed * TAU) * 2) * dt;
          particle.x += (Math.sin(time * 1.3 + particle.seed * TAU) * 10 + current * 0.8) * dt;
        }
        break;
      }
      case "Pellet": {
        if (particle.y < FLOOR_Y - 1) {
          particle.y = Math.min(FLOOR_Y - 1, particle.y + 22 * dt);
          particle.x += current * 0.4 * dt;
        }
        break;
      }
      case "Glimmer": {
        const [u, v] = flow(particle.x, particle.y, time);
        particle.x += (u * 0.35 + particle.vx + current * 0.8) * dt;
        particle.y = Math.min(FLOOR_Y - 4, particle.y + (v * 0.25 + particle.vy + 1.5) * dt);
        particle.vx *= 1 - dt * 1.5;
        particle.vy *= 1 - dt * 1.5;
        break;
      }
      case "Note":
      case "Love": {
        particle.x += (particle.vx + Math.sin(time * 4 + particle.seed * 9) * 4) * dt;
        particle.y += particle.vy * dt;
        particle.vx *= 1 - dt * 2;
        break;
      }
      case "Zap":
      case "Print":
      case "Pop":
        break;
      case "Fry": {
        // 갓 태어난 새끼는 흩어지며 꼬물꼬물 천천히 떠오른다.
        particle.x += (particle.vx + Math.sin(time * 5 + particle.seed * 17) * 3 + current * 0.5) * dt;
        particle.y += (particle.vy + Math.cos(time * 4 + particle.seed * 11) * 2) * dt;
        particle.vx *= 1 - dt * 0.6;
        particle.vy = particle.vy * (1 - dt * 0.6) - 1.5 * dt;
        break;
      }
      case "Donut": {
        particle.x += (particle.vx + current * 0.5) * dt;
        particle.y += particle.vy * dt;
        break;
      }
      case "Firework": {
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.vx *= 1 - dt * 1.8;
        particle.vy = particle.vy * (1 - dt * 1.8) + 6 * dt;
        break;
      }
      case "Bubble": {
        particle.x += (particle.vx + Math.sin(time * 3 + particle.seed * 9) * 3 + current * 0.8) * dt;
        particle.y += particle.vy * dt;
        if (particle.y < 22) {
          particle.age = particle.life;
        }
        break;
      }
      case "Spawn": {
        const [u, v] = flow(particle.x, particle.y, time);
        particle.x += (u * 0.4 + particle.vx + current) * dt;
        particle.y += (v * 0.3 + particle.vy) * dt;
        break;
      }
      case "Ring":
        break;
      case "Meteor": {
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        break;
      }
      default: {
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.vx *= 1 - dt * 2.5;
        const lift = particle.kind === "Dust" ? 4 : particle.kind === "Ink" ? 0.5 : -2;
        particle.vy = particle.vy * (1 - dt * 2.5) + lift * dt;
        particle.x += current * 0.5 * dt;
        break;
      }
    }
  }
  retain(particles, (particle) => particle.kind === "Plankton" || particle.age < particle.life);
}

/** 해파리 갓 아래에 매달린 촉수 한 가닥. 앞 점을 일정 거리로 따라가는 verlet 사슬이다. */
export class Tentacle {
  /** 몸 중심에서 뿌리까지의 거리(오른쪽 기준)다. */
  anchor: [number, number];
  points: [number, number][];
  previous: [number, number][];
  segment: number;
  phase: number;

  constructor(anchor: [number, number], origin: [number, number], segments: number, segment: number, phase: number) {
    this.anchor = [anchor[0], anchor[1]];
    this.points = [];
    for (let index = 0; index <= segments; index += 1) {
      this.points.push([origin[0] + anchor[0], origin[1] + anchor[1] + index * segment]);
    }
    this.previous = this.points.map(([x, y]) => [x, y] as [number, number]);
    this.segment = segment;
    this.phase = phase;
  }

  /** 뿌리를 몸에 붙이고 관성·물살·가라앉음을 적용한 뒤 길이 제약을 푼다. */
  step(body: [number, number], dt: number, time: number): void {
    const root: [number, number] = [body[0] + this.anchor[0], body[1] + this.anchor[1]];
    this.points[0] = [root[0], root[1]];
    this.previous[0] = [root[0], root[1]];
    const current = Math.sin(time * 0.8 + this.phase) * 9;
    const count = this.points.length;
    for (let index = 1; index < count; index += 1) {
      const [x, y] = this.points[index];
      const [px, py] = this.previous[index];
      const sway = current * (index / count);
      this.previous[index] = [x, y];
      this.points[index] = [x + (x - px) * 0.94 + sway * dt * dt * 8, y + (y - py) * 0.94 + 30 * dt * dt];
    }
    for (let pass = 0; pass < 2; pass += 1) {
      for (let index = 1; index < count; index += 1) {
        const [ax, ay] = this.points[index - 1];
        const [bx, by] = this.points[index];
        const dx = bx - ax;
        const dy = by - ay;
        const length = Math.max(Math.sqrt(dx * dx + dy * dy), 0.001);
        const ratio = this.segment / length;
        this.points[index] = [ax + dx * ratio, ay + dy * ratio];
      }
    }
  }
}
