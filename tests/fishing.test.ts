// 낚시: 낚을 수 있는 종과 난이도, 던지기 판정, 입질 타이밍(일찍·제때·늦게), 싸움(끊어짐·놓침·낚음), 놓아 주기.

import { describe, expect, it } from "vitest";

import { Aquarium } from "../src/sim/aquarium";
import { loadAll } from "../src/sim/catalog";
import { METER_PERIOD, SWEET, fishProfile, meterAt } from "../src/sim/fishing";

const species = loadAll();

/** 한 종을 가운데 불러 미끼 앞에 두고, 입질 상태로 만든다. */
function suitorGame(id: string, seed = 1): [Aquarium, number] {
  const game = new Aquarium(species, seed, true);
  const slot = game.spawn(game.indexOf(id)!, false);
  const actor = game.actors[slot];
  Object.assign(actor, { x: 240, y: 170, depth: 1, age: 2, lifespan: 999 });
  const fishing = game.fishing;
  fishing.toggle(game);
  fishing.phase = "wait";
  fishing.bobber = 240;
  fishing.bait = [240, 170];
  fishing.suitor = actor.id;
  return [game, actor.id];
}

/** 입질 중에 채서 싸움을 시작하고, 정책대로 감고 풀며 끝까지 싸운다. 결과와 걸린 시간(초)이다. */
function fight(id: string, reel: (game: Aquarium) => boolean, seed = 1): [string, number, Aquarium, number] {
  const [game, actorId] = suitorGame(id, seed);
  const fishing = game.fishing;
  fishing.biteLeft = 0.5;
  fishing.press(game, 240);
  fishing.release();
  expect(fishing.phase).toBe("fight");
  let t = 0;
  while (t < 180 && fishing.phase === "fight") {
    const want = reel(game);
    if (want && !fishing.holding) fishing.press(game, 240);
    if (!want && fishing.holding) fishing.release();
    game.step(1 / 30);
    t += 1 / 30;
  }
  return [fishing.phase === "landed" ? "caught" : fishing.note?.text ?? fishing.phase, t, game, actorId];
}

const greedy = (game: Aquarium) => game.fishing.tension < 0.9;

describe("fishing", () => {
  it("test_profile_when_species_vary_then_only_fish_are_catchable_with_one_to_five_stars", () => {
    const game = new Aquarium(species, 1, false);
    const catchable = species.filter((entry, index) => fishProfile(entry, game.traits[index]) !== null);
    expect(catchable.length).toBeGreaterThan(80);
    for (const id of ["humpback-whale", "dolphin", "green-turtle", "moon-jelly", "red-crab", "sardine", "haenyeo", "mermaid", "whale-shark", "harbor-seal", "seahorse"]) {
      const index = game.indexOf(id);
      if (index !== null) expect(fishProfile(species[index], game.traits[index]), id).toBeNull();
    }
    const stars = (id: string) => fishProfile(species[game.indexOf(id)!], game.traits[game.indexOf(id)!])!.stars;
    expect(stars("clownfish")).toBeLessThanOrEqual(2);
    expect(stars("great-white-shark")).toBe(5);
    expect(stars("bluefin-tuna")).toBeGreaterThanOrEqual(4);
    // 초식 물고기는 미끼에 잘 끌리지 않는다.
    const tang = game.indexOf("blue-tang")!;
    expect(fishProfile(species[tang], game.traits[tang])!.appeal).toBeLessThan(0.3);
  });

  it("test_cast_when_released_in_the_green_zone_then_it_lands_near_the_aim", () => {
    const game = new Aquarium(species, 2, true);
    const fishing = game.fishing;
    fishing.toggle(game);
    fishing.press(game, 330);
    // 게이지가 가장 좋은 자리(0.8)에 올 때(올라가는 중) 뗀다.
    const hold = (SWEET / 2) * METER_PERIOD;
    for (let t = 0; t < hold - 1e-6; t += 1 / 60) game.step(1 / 60);
    expect(meterAt(fishing.timer)).toBeCloseTo(SWEET, 1);
    fishing.release();
    expect(fishing.quality).toBe("perfect");
    for (let n = 0; n < 60; n++) game.step(1 / 30);
    expect(Math.abs(fishing.bobber - 330)).toBeLessThanOrEqual(4);
    expect(fishing.phase === "sink" || fishing.phase === "wait").toBe(true);
    // 가라앉는 미끼는 탭하면 그 깊이에 멈춘다.
    fishing.press(game, 330);
    fishing.release();
    expect(fishing.phase).toBe("wait");
  });

  it("test_bite_when_tapped_early_then_fish_is_spooked_and_when_late_then_bait_is_stolen", () => {
    const [early, id] = suitorGame("clownfish");
    early.step(1 / 30);
    early.fishing.press(early, 240);
    early.fishing.release();
    expect(early.fishing.phase).toBe("wait");
    expect(early.fishing.suitor).toBeNull();
    expect(early.fishing.note?.text).toContain("일찍");
    expect(early.actors.some((actor) => actor.id === id)).toBe(true);

    const [late] = suitorGame("clownfish");
    late.fishing.biteLeft = 0.3;
    // 입질 시간을 넘기면 미끼만 떼이고, 곧 줄을 걷어 새 미끼로 다시 던질 준비를 한다.
    let stolen = false;
    for (let n = 0; n < 150; n++) {
      late.step(1 / 30);
      if (!late.fishing.hasBait && late.fishing.note?.text.includes("미끼")) stolen = true;
    }
    expect(stolen).toBe(true);
    expect(late.fishing.phase).toBe("aim");
    expect(late.fishing.hasBait).toBe(true);
  });

  it("test_fight_when_always_reeling_a_shark_then_the_line_snaps_and_when_never_reeling_then_it_escapes", () => {
    const [always, t1] = fight("great-white-shark", () => true);
    expect(always).toContain("끊어");
    expect(t1).toBeLessThan(5);
    const [never] = fight("clownfish", () => false);
    expect(never).not.toBe("caught");
  });

  it("test_fight_when_reeling_below_the_red_zone_then_fish_are_caught_harder_ones_take_longer_and_are_released", () => {
    const [easy, easyTime] = fight("clownfish", greedy);
    expect(easy).toBe("caught");
    const [hard, hardTime, game, id] = fight("giant-trevally", greedy);
    expect(hard).toBe("caught");
    expect(hardTime).toBeGreaterThan(easyTime);
    // 잡은 물고기는 수면에서 보여 준 뒤 놓아 준다. 사라지지 않는다.
    for (let n = 0; n < 30 * 8; n++) game.step(1 / 30);
    expect(game.fishing.phase).toBe("aim");
    expect(game.actors.some((actor) => actor.id === id)).toBe(true);
    expect(game.fishing.catches.get("giant-trevally")).toBe(1);
  });

  it("test_toggle_when_turned_off_mid_fight_then_the_fish_is_let_go", () => {
    const [game, id] = suitorGame("clownfish");
    game.fishing.biteLeft = 0.5;
    game.fishing.press(game, 240);
    game.fishing.release();
    expect(game.fishing.phase).toBe("fight");
    game.fishing.toggle(game);
    expect(game.fishing.phase).toBe("off");
    const actor = game.actors.find((entry) => entry.id === id)!;
    expect(actor.script).toBeNull();
  });
});
