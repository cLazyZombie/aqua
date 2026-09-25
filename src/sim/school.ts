// 정어리·반딧불오징어 무리의 boids 군집. 모이기·줄맞추기·거리두기에 무리 목표점 주위를 도는
// 소용돌이(베이트볼)와 포식자 회피를 더한다.

import type { Actor } from "./aquarium";
import { visible } from "./constants";
import { clamp, f32 } from "./num";

/** 무리 전체가 따라가는 목표점이다. 화면을 가로지르다 가장자리에서 돌아서고, 수명이 다하면 떠난다. */
export class School {
  id: number;
  x: number;
  y: number;
  heading: number;
  age: number;
  lifespan: number;
  phase: number;
  /** 사건이 무리를 위아래로 몰아붙이는 높이 보정이다(돌고래 기포 그물). */
  lift: number;

  constructor(fields: {
    id: number;
    x: number;
    y: number;
    heading: number;
    age: number;
    lifespan: number;
    phase: number;
    lift: number;
  }) {
    this.id = fields.id;
    this.x = fields.x;
    this.y = fields.y;
    this.heading = fields.heading;
    this.age = fields.age;
    this.lifespan = fields.lifespan;
    this.phase = fields.phase;
    this.lift = fields.lift;
  }

  leaving(): boolean {
    return this.age > this.lifespan;
  }

  step(dt: number, time: number): void {
    this.age = f32(this.age + dt);
    this.x += this.heading * 15 * dt;
    this.y = 120 + this.lift + Math.sin(time * 0.23 + this.phase) * 45 + Math.sin(time * 0.61 + this.phase) * 12;
    if (!this.leaving() && ((this.x > visible.right - 60 && this.heading > 0) || (this.x < visible.left + 60 && this.heading < 0))) {
      this.heading = -this.heading;
    }
  }
}

/** 피해야 할 큰 생물의 위치(x, y, 반경)다. 상어가 파고들면 무리가 크게 갈라진다. */
export type Threat = [number, number, number];

/** 한 무리 구성원의 가속도를 계산해 속도·위치를 갱신한다. `mates`는 같은 무리의 (x, y, vx, vy)다. */
export function steer(
  actor: Actor,
  school: School,
  mates: [number, number, number, number][],
  threats: Threat[],
  dt: number,
): void {
  let cx = 0;
  let cy = 0;
  let ax = 0;
  let ay = 0;
  let sx = 0;
  let sy = 0;
  let count = 0;
  for (const [x, y, vx, vy] of mates) {
    const dx = actor.x - x;
    const dy = actor.y - y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance < 0.01 || distance > 40) {
      continue;
    }
    cx += x;
    cy += y;
    ax += vx;
    ay += vy;
    count += 1;
    if (distance < 13) {
      sx += (dx / distance) * (13 - distance);
      sy += (dy / distance) * (13 - distance);
    }
  }
  let fx = 0;
  let fy = 0;
  if (count > 0) {
    fx += (cx / count - actor.x) * 0.5 + (ax / count - actor.vx) * 0.6;
    fy += (cy / count - actor.y) * 0.5 + (ay / count - actor.vy) * 0.6;
  }
  fx += sx * 5;
  fy += sy * 5;
  // 목표점으로 끌리면서 그 둘레를 돌게 해 베이트볼처럼 소용돌이친다.
  const tx = school.x - actor.x;
  const ty = school.y - actor.y;
  const reach = Math.max(Math.sqrt(tx * tx + ty * ty), 1);
  fx += tx * 0.5 - (ty / reach) * 14 * school.heading;
  fy += ty * 0.5 + (tx / reach) * 6 * school.heading;
  let fleeing = false;
  for (const [px, py, radius] of threats) {
    const dx = actor.x - px;
    const dy = actor.y - py;
    const distance = Math.max(Math.sqrt(dx * dx + dy * dy), 0.5);
    if (distance < radius + 40) {
      const push = (radius + 40 - distance) * 9;
      fx += (dx / distance) * push;
      fy += (dy / distance) * push;
      fleeing = true;
    }
  }
  actor.vx += fx * dt;
  actor.vy += fy * dt;
  const speed = Math.max(Math.sqrt(actor.vx * actor.vx + actor.vy * actor.vy), 0.001);
  const [low, high] = fleeing ? [20, 62] : [12, 34];
  const clamped = clamp(speed, low, high);
  actor.vx *= clamped / speed;
  actor.vy *= (clamped / speed) * 0.8;
  actor.x += actor.vx * dt;
  actor.y += actor.vy * dt;
  actor.burst = fleeing ? 1 : actor.burst;
}
