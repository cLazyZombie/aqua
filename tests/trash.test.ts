// 바다 쓰레기: 10~20초마다 떨어져 바닥에 쌓이고, 10개부터 물이 탁해지고, 30개면 새 생물이 오지 않으며, 치우면 되돌아온다.

import { describe, expect, it } from "vitest";

import { FLOOR_Y } from "../src/sim/constants";
import { Aquarium } from "../src/sim/aquarium";
import { loadAll } from "../src/sim/catalog";
import { DEAD_AT, DIRTY_FROM, TRASH_INFO } from "../src/sim/trash";

const run = (game: Aquarium, seconds: number) => {
  for (let n = 0; n < seconds * 30; n++) game.step(1 / 30);
};

describe("trash", () => {
  it("test_step_when_game_started_then_trash_falls_every_10_to_20_seconds_and_lands_on_the_floor", () => {
    const game = new Aquarium(loadAll(), 3, true);
    run(game, 200);
    const count = game.litter.count();
    // 200초 동안 10~20초 간격이면 9~19개다(첫 쓰레기는 12~22초).
    expect(count).toBeGreaterThanOrEqual(9);
    expect(count).toBeLessThanOrEqual(19);
    const landed = game.litter.items.filter((item) => item.landed);
    // 비닐·마스크처럼 가벼운 쓰레기는 30초 넘게 나풀거리며 가라앉아, 둘쯤은 아직 물속에 있을 수 있다.
    expect(landed.length).toBeGreaterThanOrEqual(count - 3);
    for (const item of landed) {
      expect(item.y + item.info.h * 0.5).toBeLessThanOrEqual(FLOOR_Y + 4);
      expect(item.y + item.info.h * 0.5).toBeGreaterThan(FLOOR_Y - 30);
    }
    expect(TRASH_INFO.length).toBe(8);
  });

  it("test_step_when_title_screen_then_no_trash_falls", () => {
    const game = new Aquarium(loadAll(), 3, false);
    run(game, 60);
    expect(game.litter.count()).toBe(0);
  });

  it("test_dirt_when_ten_or_more_then_water_turns_murky_and_cleaning_clears_it", () => {
    const game = new Aquarium(loadAll(), 5, true);
    game.litter.seed(DIRTY_FROM - 1);
    expect(game.litter.dirt()).toBe(0);
    game.litter.seed(1);
    expect(game.litter.dirt()).toBeGreaterThan(0.25);
    const before = game.litter.count();
    const first = game.litter.items[0].id;
    expect(game.pickTrash(first)).toBe(true);
    expect(game.pickTrash(first)).toBe(false);
    expect(game.litter.count()).toBe(before - 1);
    expect(game.litter.cleaned).toBe(1);
    // 치우면 물빛(gloom)이 몇 초에 걸쳐 다시 맑아진다.
    while (game.litter.count() > 0) game.pickTrash(game.litter.items[0].id);
    run(game, 12);
    expect(game.litter.gloom).toBeLessThan(0.05);
  });

  it("test_spawn_when_thirty_pieces_then_no_new_creatures_arrive", () => {
    const game = new Aquarium(loadAll(), 11, true);
    game.litter.seed(DEAD_AT);
    const known = new Set(game.actors.map((actor) => actor.id));
    run(game, 120);
    const newcomers = game.actors.filter((actor) => !known.has(actor.id) && !game.species[actor.species].visitor && game.director.active === null);
    expect(newcomers.filter((actor) => actor.school === null)).toEqual([]);
    expect(game.litter.dead()).toBe(true);
  });
});
