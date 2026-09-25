// 사용자 교감 테스트: 종마다 먹이·교감 반응·활동 시간, 큰 생물 직진.

import { describe, expect, it } from "vitest";

import { type Actor, Aquarium } from "../src/sim/aquarium";
import { bigBody, grounded, loadAll } from "../src/sim/catalog";
import { BURROW_SECONDS } from "../src/sim/constants";
import { moodLook, moodSeconds } from "../src/sim/mood";
import { awakeAt, hourOf } from "../src/sim/traits";

const LONG = 180_000;
const species = loadAll();

/** 사건·무작위 등장 없이 한 종만 두는 빈 수족관이다. 시각은 그 종이 활동하는 시간 한가운데다. */
function alone(index: number): Aquarium {
  const game = new Aquarium(species, 7, true);
  game.actors = [];
  game.schools = [];
  game.spawnTimer = -1e9;
  game.director.nextAt = 1e9;
  const [start, end] = game.traits[index].hours;
  const middle = end > start ? (start + end) / 2 : ((start + end + 24) / 2) % 24;
  game.time = ((((middle - 12) / 24) * 240) % 240 + 240) % 240;
  return game;
}

/** 화면 가운데(바닥 생물은 모래 위)에 오른쪽을 보는 생물 하나를 둔다. */
function place(game: Aquarium, index: number): Actor {
  const entry = game.species[index];
  const actor = game.actors[game.spawn(index, false)];
  actor.x = 200;
  actor.y = grounded(entry) ? 257 - entry.frameH * 0.5 : 140;
  actor.targetY = actor.y;
  actor.facing = 1;
  actor.depth = 1;
  actor.age = 1.5;
  actor.lifespan = 200;
  actor.emerging = false;
  return actor;
}

describe("interaction", () => {
  it(
    "test_feed_actor_when_every_species_is_clicked_then_it_eats_its_own_food_and_shows_a_heart",
    () => {
      const hungry: string[] = [];
      species.forEach((entry, index) => {
        if (entry.id === "diver") return;
        const game = alone(index);
        const actor = place(game, index);
        game.feedActor(actor);
        let thanked = false;
        for (let frame = 0; frame < 30 * 15 && !thanked; frame += 1) {
          game.step(1 / 30);
          thanked = game.particles.some((particle) => particle.kind === "Heart");
        }
        if (!thanked) hungry.push(entry.id);
      });
      expect(hungry).toEqual([]);
    },
    LONG,
  );

  it(
    "test_react_when_every_species_is_right_clicked_then_reaction_ends_cleanly_and_nobody_disappears",
    () => {
      const broken: string[] = [];
      species.forEach((entry, index) => {
        const game = alone(index);
        game.pointer = [260, 120];
        let actor: Actor;
        if (entry.group === "school") {
          game.spawnSchool(index, true);
          actor = game.actors[0];
        } else {
          actor = place(game, index);
        }
        const count = game.actors.length;
        const kind = game.react(actor);
        expect(kind, entry.id).not.toBeNull();
        expect(Number.isFinite(moodSeconds(kind!))).toBe(true);
        for (let frame = 0; frame < 30 * 8; frame += 1) {
          game.step(1 / 30);
          for (const other of game.actors) {
            const look = moodLook(other, game.species[other.species], game.time);
            const values = [other.x, other.y, look.sx, look.sy, look.rot, look.dx, look.dy, look.alpha];
            if (!values.every(Number.isFinite)) broken.push(`${entry.id}: NaN`);
          }
        }
        if (game.actors.length < count) broken.push(`${entry.id}: lost ${count - game.actors.length}`);
        if (game.actors.some((other) => other.mood !== null || other.script !== null)) broken.push(`${entry.id}: stuck`);
      });
      expect(broken).toEqual([]);
    },
    LONG,
  );

  it("test_feed_actor_when_diver_or_haenyeo_is_clicked_then_they_share_food_instead_of_eating", () => {
    for (const [id, kind] of [
      ["diver", "Food"],
      ["haenyeo", "Leaf"],
    ] as const) {
      const index = species.findIndex((entry) => entry.id === id);
      const game = alone(index);
      const actor = place(game, index);
      expect(game.feedActor(actor)).toBe(kind);
      // 누구나 먹을 수 있는 먹이(받은 생물 없음)를 둘레에 뿌린다.
      const shared = game.particles.filter((particle) => particle.kind === kind);
      expect(shared.length).toBeGreaterThanOrEqual(3);
      expect(shared.every((particle) => particle.owner === 0)).toBe(true);
    }
  });

  it("test_react_when_mermaid_sings_then_nearby_fish_dance", () => {
    const mermaid = species.findIndex((entry) => entry.id === "mermaid");
    const tang = species.findIndex((entry) => entry.id === "blue-tang");
    const game = alone(mermaid);
    const singer = place(game, mermaid);
    const fish = place(game, tang);
    fish.x = singer.x + 40;
    expect(game.react(singer)).toBe("serenade");
    for (let frame = 0; frame < 30; frame += 1) game.step(1 / 30);
    expect(fish.mood?.kind).toBe("dance");
  });

  it("test_react_when_school_member_is_right_clicked_then_whole_school_forms_a_heart", () => {
    const sardine = species.findIndex((entry) => entry.id === "sardine");
    const game = alone(sardine);
    game.spawnSchool(sardine, true);
    game.react(game.actors[0]);
    expect(game.actors.every((actor) => actor.mood?.kind === "heart")).toBe(true);
    game.advanceTo(game.time + 3);
    // 하트 중심에서 본 각도가 한쪽에 몰리지 않고 둘레로 퍼져 있어야 한다.
    const [cx, cy] = [game.actors[0].mood!.x0, game.actors[0].mood!.y0];
    const quadrants = new Set(game.actors.map((actor) => `${actor.x > cx}${actor.y > cy}`));
    expect(quadrants.size).toBe(4);
  });

  it("test_left_click_when_empty_space_then_default_flakes_are_dropped_for_everyone", () => {
    const game = new Aquarium(species, 7, true);
    game.feed(240, 120);
    const flakes = game.particles.filter((particle) => particle.kind === "Food");
    expect(flakes.length).toBe(6);
    expect(flakes.every((particle) => particle.owner === 0)).toBe(true);
  });

  it(
    "test_step_when_big_creatures_swim_without_events_then_they_never_turn_around",
    () => {
      for (const seed of [3, 7, 11]) {
        const game = new Aquarium(species, seed, true);
        game.director.nextAt = 1e9;
        const seen = new Map<number, [number, boolean]>();
        for (let frame = 0; frame < 30 * 400; frame += 1) {
          game.step(1 / 30);
          for (const actor of game.actors) {
            const free = actor.script === null && actor.mood === null;
            const before = seen.get(actor.id);
            if (before && bigBody(game.species[actor.species]) && before[1] && free) {
              expect(actor.facing, `${game.species[actor.species].id} turned at ${game.time}`).toBe(before[0]);
            }
            seen.set(actor.id, [actor.facing, free]);
          }
        }
      }
    },
    LONG,
  );

  it(
    "test_spawn_random_when_day_turns_to_night_then_only_awake_species_come_out",
    () => {
      const game = new Aquarium(species, 5, true);
      game.director.nextAt = 1e9;
      const known = new Set(game.actors.map((actor) => actor.id));
      for (let frame = 0; frame < 30 * 480; frame += 1) {
        game.step(1 / 30);
        for (const actor of game.actors) {
          if (known.has(actor.id)) continue;
          known.add(actor.id);
          const hour = hourOf(game.time);
          expect(awakeAt(game.traits[actor.species].hours, hour), `${game.species[actor.species].id} at ${hour.toFixed(1)}h`).toBe(true);
        }
      }
    },
    LONG,
  );

  it("test_step_when_nocturnal_crab_meets_morning_then_it_burrows_into_the_sand", () => {
    const crab = species.findIndex((entry) => entry.id === "coconut-crab");
    const game = alone(crab);
    const actor = place(game, crab);
    // 정오로 넘긴다. 늦게 알아채는 몫(최대 0.8시간)을 넘어도 모래 속으로 들어가 사라져야 한다.
    game.time = 0;
    game.advanceTo(0.2);
    expect(actor.burrow).toBeGreaterThan(0);
    expect(game.particles.some((particle) => particle.kind === "Dust")).toBe(true);
    game.advanceTo(game.time + BURROW_SECONDS + 0.2);
    expect(game.actors.includes(actor)).toBe(false);
  });
});
