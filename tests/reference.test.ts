// seed 7 기준 기록(생물 위치, tests/fixtures/reference-seed7.json)과 시뮬레이션을 비교해
// 동작이 뜻하지 않게 바뀌지 않았는지 확인한다.
// 0초·1초는 첫 무작위 등장(1.6초)과 사건(20초) 전이라 카탈로그에 종이 더 늘어도 결과가 같아야 한다.
// 16초·30초는 무작위 등장·타이머·사건 감독까지 거치므로 기준을 만든 카탈로그와 같을 때만 비교한다.
// 동작을 일부러 바꿨다면 `pnpm reference`로 기준 기록을 다시 만든다.

import { writeFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { Aquarium } from "../src/sim/aquarium";
import { loadAll } from "../src/sim/catalog";
import { eventId } from "../src/sim/director";
import fixture from "./fixtures/reference-seed7.json";

interface Creature {
  id: string;
  x: number;
  y: number;
  facing: number;
  depth: number;
  school: boolean;
}

// 무리(boids)는 f32/f64 차이를 키우므로 무리 개체는 4px, 나머지는 주어진 오차로 비교한다.
function compare(game: Aquarium, expected: Creature[], solo: number): void {
  expect(game.actors.length).toBe(expected.length);
  game.actors.forEach((actor, position) => {
    const want = expected[position];
    const tolerance = want.school ? Math.max(solo, 4) : solo;
    const species = game.species[actor.species];
    expect(species.id).toBe(want.id);
    expect(actor.facing).toBe(want.facing);
    expect(actor.depth).toBe(want.depth);
    expect(actor.school !== null).toBe(want.school);
    expect(Math.abs(actor.x - want.x), `${want.id}#${position} x`).toBeLessThan(tolerance);
    expect(Math.abs(actor.y - want.y), `${want.id}#${position} y`).toBeLessThan(tolerance);
  });
}

/** 지금 시뮬레이션으로 기준 기록을 다시 쓴다(`RECORD_REFERENCE=1`일 때만). */
function record(): void {
  const snapshot = (game: Aquarium) => ({
    seconds: game.time,
    started: game.started,
    event: game.director.active === null ? null : eventId(game.director.active.kind),
    creatures: game.actors.map((actor) => ({
      id: game.species[actor.species].id,
      x: actor.x,
      y: actor.y,
      facing: actor.facing,
      depth: actor.depth,
      school: actor.school !== null,
    })),
  });
  const at = (started: boolean, seconds: number) => {
    const game = new Aquarium(loadAll(), 7, started);
    game.advanceTo(seconds);
    return snapshot(game);
  };
  const out = {
    "title-t0": at(false, 0),
    "started-t0": at(true, 0),
    "started-t1": at(true, 1),
    catalogIds: loadAll().map((entry) => entry.id),
    "started-t16": at(true, 16),
    "started-t30": at(true, 30),
  };
  writeFileSync(new URL("./fixtures/reference-seed7.json", import.meta.url), `${JSON.stringify(out, null, 1)}\n`);
}

if (process.env.RECORD_REFERENCE) record();

describe("reference recording", () => {
  it("test_new_when_title_screen_with_seed_7_then_matches_reference_spawn", () => {
    const game = new Aquarium(loadAll(), 7, false);
    compare(game, fixture["title-t0"].creatures, 1e-3);
  });

  it("test_new_when_started_with_seed_7_then_matches_reference_spawn", () => {
    const game = new Aquarium(loadAll(), 7, true);
    compare(game, fixture["started-t0"].creatures, 1e-3);
  });

  it("test_advance_when_one_second_with_seed_7_then_matches_reference_motion", () => {
    const game = new Aquarium(loadAll(), 7, true);
    game.advanceTo(1);
    // 30 frame 동안 f32와 f64 차이만 쌓인다.
    compare(game, fixture["started-t1"].creatures, 0.05);
  });

  const sameCatalog = loadAll()
    .map((entry) => entry.id)
    .join(",") === fixture.catalogIds.join(",");

  it.skipIf(!sameCatalog)("test_advance_when_sixteen_seconds_with_seed_7_then_spawns_and_timers_match_reference", () => {
    const game = new Aquarium(loadAll(), 7, true);
    game.advanceTo(16);
    compare(game, fixture["started-t16"].creatures, 0.01);
  });

  it.skipIf(!sameCatalog)("test_advance_when_thirty_seconds_with_seed_7_then_same_creatures_and_event_as_reference", () => {
    const game = new Aquarium(loadAll(), 7, true);
    game.advanceTo(30);
    // 20초 뒤부터는 무리(boids)의 f32/f64 차이가 커져 위치는 비교하지 않고 등장 순서와 사건만 본다.
    expect(game.actors.map((actor) => game.species[actor.species].id)).toEqual(
      fixture["started-t30"].creatures.map((creature) => creature.id),
    );
    const active = game.director.active;
    expect(active === null ? null : eventId(active.kind)).toBe(fixture["started-t30"].event);
  });
});
