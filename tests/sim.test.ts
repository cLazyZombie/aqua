// 시뮬레이션 동작 테스트: 낮밤 교대, 무리, 방향, 먹이, 사건, 카메라.

import { describe, expect, it } from "vitest";

import { Aquarium, MAX_UNITS } from "../src/sim/aquarium";
import { faceTravel, loadAll } from "../src/sim/catalog";
import { EVENT_KINDS, eventId } from "../src/sim/director";

const LONG = 180_000;

function game(seed: number): Aquarium {
  return new Aquarium(loadAll(), seed, true);
}

function index(target: Aquarium, id: string): number {
  const found = target.indexOf(id);
  if (found === null) throw new Error(`missing species ${id}`);
  return found;
}

const NIGHT_EVENTS = new Set([
  "angler-lantern",
  "deep-visitors",
  "ink-escape",
  "jelly-bloom",
  "glow-wave",
  "meteor-shower",
  "coral-spawn",
  "giant-squid",
  "submarine",
  "manta-campfire",
  "pearl-night",
  "rune-glow",
  "aurora",
  "fireworks",
]);

describe("aquarium", () => {
  it(
    "test_trigger_event_when_every_kind_runs_then_it_finishes_without_panicking",
    () => {
      for (const kind of EVENT_KINDS) {
        const g = game(13);
        g.advanceTo(NIGHT_EVENTS.has(eventId(kind)) ? 120 : 10);
        g.triggerEvent(kind);
        expect(g.director.banner, `${eventId(kind)} shows a banner`).not.toBeNull();
        const start = g.time;
        g.advanceTo(start + 70);
        const active = g.director.active;
        expect(active === null || active.kind !== kind || active.age < 70, `${eventId(kind)} should end`).toBe(true);
      }
    },
    LONG,
  );

  it("test_shark_patrol_when_shark_crosses_school_then_nobody_is_eaten", () => {
    const g = game(21);
    g.advanceTo(5);
    const count = (target: Aquarium): number => target.actors.filter((actor) => actor.school !== null).length;
    const before = count(g);
    g.triggerEvent("SharkPatrol");
    g.advanceTo(20);
    // 상어가 무리를 지나가도 무리는 흩어졌다가 다시 모일 뿐 한 마리도 줄지 않는다.
    expect(count(g)).toBe(before);
  });

  it("test_event_pool_when_all_events_are_listed_then_every_creature_joins_at_least_one", () => {
    const g = game(1);
    const covered = new Array<boolean>(g.species.length).fill(false);
    for (const kind of EVENT_KINDS) {
      for (const slot of g.eventPool(kind)) {
        covered[slot] = true;
      }
    }
    const missing = g.species.filter((entry, slot) => entry.id !== "diver" && !covered[slot]).map((entry) => entry.id);
    expect(missing).toEqual([]);
  });

  it(
    "test_events_when_every_kind_runs_then_no_creature_is_eaten",
    () => {
      // 사건은 놀라기·흩어지기·구경하기·과자 먹기로만 반응한다. 등장한 생물이 사건 중에 사라지면 안 된다.
      for (const kind of EVENT_KINDS) {
        const g = game(17);
        g.advanceTo(10);
        g.triggerEvent(kind);
        const cast = g.director.active?.castIds() ?? [];
        for (let n = 0; n < 4 * 30; n += 1) {
          g.step(1 / 30);
          for (const id of cast) {
            const actor = g.actors.find((entry) => entry.id === id);
            if (actor !== undefined) {
              expect(actor.age, `${eventId(kind)} made a creature vanish`).toBeLessThan(1.0e5);
            }
          }
        }
      }
    },
    LONG,
  );

  it(
    "test_director_when_time_passes_then_events_start_on_their_own",
    () => {
      const g = game(8);
      g.advanceTo(200);
      expect(g.director.started.length).toBeGreaterThan(0);
    },
    LONG,
  );

  it("test_camera_offset_when_nothing_shakes_then_camera_stays_still", () => {
    const g = game(6);
    for (let n = 0; n < 90; n += 1) {
      g.step(1 / 30);
      if (g.shake <= 0) {
        expect(g.cameraOffset()).toEqual([0, 0]);
      }
    }
    g.triggerEvent("VentBurst");
    g.step(0.2);
    expect(g.shake).toBeGreaterThan(0);
  });

  it("test_tap_when_fish_are_near_then_they_dash_away", () => {
    const g = game(4);
    g.actors.length = 0;
    g.schools.length = 0;
    const slot = g.spawn(index(g, "clownfish"), true);
    const actor = g.actors[slot];
    actor.x = 200;
    actor.y = 120;
    actor.facing = -1;
    actor.depth = 1;
    g.tap(180, 120);
    expect(g.actors[0].facing).toBe(1);
    expect(g.actors[0].burst).toBeGreaterThan(1);
  });

  it(
    "test_aquarium_when_day_turns_to_night_then_glowing_species_enter_rotation",
    () => {
      const g = game(7);
      g.advanceTo(125);
      expect(g.daylight()).toBeLessThan(0.1);
      expect(g.actors.some((actor) => g.species[actor.species].glow)).toBe(true);
      // 사건(해파리 대발생 등)은 평소 상한을 넘겨 잠깐 더 부를 수 있다.
      expect(g.units()).toBeLessThanOrEqual(MAX_UNITS + 12);
    },
    LONG,
  );

  it(
    "test_aquarium_when_time_advances_then_school_moves_and_species_rotate",
    () => {
      const g = game(19);
      const initial = g.actors.map((actor) => actor.species);
      expect(g.actors.filter((actor) => actor.school !== null).length).toBeGreaterThanOrEqual(20);
      g.advanceTo(80);
      expect(g.actors.map((actor) => actor.species)).not.toEqual(initial);
    },
    LONG,
  );

  it("test_aquarium_when_shark_approaches_then_small_fish_turn_and_dash_away", () => {
    const g = game(5);
    g.actors.length = 0;
    g.schools.length = 0;
    for (const [species, x, facing] of [
      [index(g, "hammerhead"), 260, -1],
      [index(g, "clownfish"), 180, 1],
    ]) {
      const slot = g.spawn(species, true);
      const actor = g.actors[slot];
      actor.x = x;
      actor.y = 120;
      actor.targetY = 120;
      actor.facing = facing;
      actor.depth = 1;
    }
    g.step(1 / 30);
    const fish = g.actors[1];
    expect(fish.facing).toBe(-1);
    expect(fish.burst).toBeGreaterThan(0);
    expect(fish.turn).toBeGreaterThan(0);
  });

  it("test_aquarium_when_shark_crosses_school_then_school_scatters", () => {
    const g = game(11);
    g.advanceTo(3);
    const spread = (target: Aquarium): number => {
      const members = target.actors.filter((actor) => actor.school !== null);
      const cx = members.reduce((sum, actor) => sum + actor.x, 0) / members.length;
      return members.reduce((sum, actor) => sum + Math.abs(actor.x - cx), 0) / members.length;
    };
    const calm = spread(g);
    const slot = g.spawn(index(g, "hammerhead"), true);
    const member = g.actors.find((actor) => actor.school !== null);
    if (member === undefined) throw new Error("school");
    const center: [number, number] = [member.x, member.y];
    const actor = g.actors[slot];
    actor.x = center[0];
    actor.y = center[1];
    actor.targetY = center[1];
    actor.depth = 1;
    for (let n = 0; n < 20; n += 1) {
      g.step(1 / 30);
    }
    expect(spread(g)).toBeGreaterThan(calm);
  });

  it("test_aquarium_when_food_is_dropped_then_nearby_fish_eat_it", () => {
    const g = game(3);
    g.actors.length = 0;
    g.schools.length = 0;
    const slot = g.spawn(index(g, "clownfish"), true);
    const actor = g.actors[slot];
    actor.x = 200;
    actor.y = 120;
    actor.targetY = 120;
    actor.facing = 1;
    actor.depth = 1;
    g.feed(240, 118);
    const count = (target: Aquarium): number => target.particles.filter((particle) => particle.kind === "Food").length;
    const before = count(g);
    g.advanceTo(12);
    expect(count(g)).toBeLessThan(before);
  });

  it(
    "test_aquarium_when_fish_swim_then_they_face_their_travel_direction",
    () => {
      const g = game(3);
      for (let n = 0; n < 300; n += 1) {
        const before = g.actors.map(
          (actor) => [actor.x, actor.species, actor.school === null, actor.facing] as [number, number, boolean, number],
        );
        g.step(1 / 30);
        if (before.length !== g.actors.length) {
          continue;
        }
        before.forEach(([x, species, solo, facing], position) => {
          const actor = g.actors[position];
          const entry = g.species[species];
          if (actor.species !== species || !solo || !faceTravel(entry) || actor.facing !== facing) {
            return;
          }
          expect((actor.x - x) * facing, `${entry.id} swims backwards`).toBeGreaterThanOrEqual(-0.01);
        });
      }
    },
    LONG,
  );
});
