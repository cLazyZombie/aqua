// 소소한 볼거리 테스트: 희귀 색 변이, 단골 개체, 꿈꾸는 문어, 모래 발자국, 기포 터뜨리기.

import { describe, expect, it } from "vitest";

import { Aquarium } from "../src/sim/aquarium";
import { grounded, loadAll } from "../src/sim/catalog";
import { dexEntries, observe } from "../src/sim/dex";
import { ventBubbles } from "../src/sim/life";

const LONG = 120_000;
const species = loadAll();

function empty(): Aquarium {
  const game = new Aquarium(species, 7, true);
  game.actors = [];
  game.schools = [];
  game.spawnTimer = -1e9;
  game.director.nextAt = 1e9;
  return game;
}

function indexOf(id: string): number {
  const index = species.findIndex((entry) => entry.id === id);
  if (index < 0) throw new Error(`missing ${id}`);
  return index;
}

describe("ambient", () => {
  it("test_spawn_when_many_fish_appear_then_rare_color_variants_are_rare_and_deterministic", () => {
    const game = empty();
    const clown = indexOf("clownfish");
    const variants: number[] = [];
    for (let n = 0; n < 4000; n += 1) {
      const actor = game.actors[game.spawn(clown, false)];
      variants.push(actor.variant);
      game.actors.pop();
    }
    const rare = variants.filter((variant) => variant > 0).length / variants.length;
    expect(rare).toBeGreaterThan(0.004);
    expect(rare).toBeLessThan(0.025);
    expect(new Set(variants)).toEqual(new Set([0, 1, 2, 3]));
    // 같은 시드면 같은 개체가 같은 변이다(난수 순서를 쓰지 않는다).
    const again = empty();
    const replay: number[] = [];
    for (let n = 0; n < 4000; n += 1) {
      replay.push(again.actors[again.spawn(clown, false)].variant);
      again.actors.pop();
    }
    expect(replay).toEqual(variants);
  });

  it("test_observe_when_variant_and_regular_visitor_are_seen_then_dex_marks_star_and_counts_visit_once", () => {
    const game = empty();
    const clown = game.actors[game.spawn(indexOf("clownfish"), true)];
    clown.variant = 1;
    clown.x = 200;
    const shark = game.actors[game.spawn(indexOf("whale-shark"), true)];
    shark.x = 260;
    shark.depth = 1;
    expect(shark.individual).toBeGreaterThanOrEqual(0);
    for (let n = 0; n < 5; n += 1) observe(game, 0.6);
    const names = dexEntries(game).map((entry) => entry.name);
    expect(names).toContain("흰동가리 ★");
    expect(game.dex.visitsOf("whale-shark")).toBe(1);
  });

  it("test_step_when_octopus_night_ends_then_it_dreams_on_the_floor_before_leaving", () => {
    const game = empty();
    const octopus = indexOf("octopus");
    game.time = 175; // 5시 30분
    const actor = game.actors[game.spawn(octopus, true)];
    actor.x = 240;
    actor.y = 180;
    actor.depth = 1;
    actor.lifespan = 300;
    let dreamed = false;
    for (let frame = 0; frame < 30 * 20; frame += 1) {
      game.step(1 / 30);
      if (actor.mood?.kind === "dream") dreamed = true;
      if (!game.actors.includes(actor)) break;
      // 꿈꾸는 동안에는 떠나지 않는다.
      if (actor.mood?.kind === "dream") expect(actor.isLeaving()).toBe(false);
    }
    expect(dreamed).toBe(true);
    expect(actor.dreamt).toBe(true);
  });

  it(
    "test_step_when_crabs_walk_then_sand_prints_stay_under_the_cap",
    () => {
      const game = empty();
      const crab = indexOf("red-crab");
      for (const x of [100, 240, 380]) {
        const actor = game.actors[game.spawn(crab, true)];
        actor.x = x;
        actor.lifespan = 500;
        expect(grounded(game.species[crab])).toBe(true);
      }
      let peak = 0;
      for (let frame = 0; frame < 30 * 60; frame += 1) {
        game.step(1 / 30);
        peak = Math.max(peak, game.particles.filter((particle) => particle.kind === "Print").length);
      }
      expect(peak).toBeGreaterThan(5);
      expect(peak).toBeLessThanOrEqual(62);
    },
    LONG,
  );

  it("test_step_when_pointer_sits_on_a_bubble_stream_then_bubbles_pop_with_a_ring", () => {
    const game = empty();
    const bubble = ventBubbles(game.time).find((entry) => entry.popping === null)!;
    game.pointer = [bubble.x, bubble.y - 3];
    let popped = false;
    for (let frame = 0; frame < 30 * 12 && !popped; frame += 1) {
      game.step(1 / 30);
      popped = game.popped.size > 0 && game.particles.some((particle) => particle.kind === "Pop");
    }
    expect(popped).toBe(true);
    // 포인터가 없으면 터뜨리지 않는다.
    const calm = empty();
    for (let frame = 0; frame < 30 * 12; frame += 1) calm.step(1 / 30);
    expect(calm.popped.size).toBe(0);
  });
});
