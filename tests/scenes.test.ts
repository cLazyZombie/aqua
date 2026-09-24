// 배경 컨셉과 소품 무작위 배치 테스트: 시드마다 결정적이고, 가운데를 비우고, 컨셉에 맞는 소품만 쓴다.

import { describe, expect, it } from "vitest";

import props from "../src/data/props.json";
import scenes from "../src/data/scenes.json";
import { Aquarium } from "../src/sim/aquarium";
import { loadAll } from "../src/sim/catalog";
import { type PropInfo, availableScenes, makeLayout, pickScene } from "../src/render/scenes";

const info = props as PropInfo[];

describe("scenes", () => {
  it("test_available_scenes_when_all_art_is_baked_then_five_concepts_are_ready", () => {
    expect(availableScenes()).toEqual(["reef", "kelp", "wreck", "ruins", "ice"]);
    expect(scenes).toContain("reef");
    expect(pickScene("ruins", () => 0)).toBe("ruins");
    expect(pickScene(null, () => 0.99)).toBe("ice");
  });

  it("test_make_layout_when_same_seed_then_same_placement_and_other_seeds_differ", () => {
    for (const scene of availableScenes()) {
      const a = makeLayout(info, scene, 42);
      expect(makeLayout(info, scene, 42)).toEqual(a);
      const b = makeLayout(info, scene, 43);
      expect(b.map((p) => `${p.prop}@${p.x}`)).not.toEqual(a.map((p) => `${p.prop}@${p.x}`));
    }
  });

  it("test_make_layout_when_many_seeds_then_center_stays_open_and_props_fit_the_concept", () => {
    for (const scene of availableScenes()) {
      for (let seed = 1; seed <= 60; seed++) {
        const layout = makeLayout(info, scene, seed);
        const rows = { back: 0, front: 0, floor: 0 };
        for (const placement of layout) {
          rows[placement.row] += 1;
          const prop = info[placement.prop];
          expect(prop.scenes, `${scene} ${prop.kind}`).toContain(scene);
          if (placement.row === "floor") {
            expect(prop.kind).toBe("clam");
            expect(placement.x < 190 || placement.x > 290, `${scene} clam at ${placement.x}`).toBe(true);
          } else {
            expect(prop.kind).not.toBe("clam");
            // 화면 가운데(175~305)는 비워 둔다.
            expect(placement.x <= 175 || placement.x >= 305, `${scene} ${placement.row} at ${placement.x}`).toBe(true);
          }
        }
        expect(rows.back).toBeGreaterThanOrEqual(6);
        expect(rows.front).toBeGreaterThanOrEqual(5);
        expect(rows.floor).toBeGreaterThanOrEqual(2);
        expect(rows.floor).toBeLessThanOrEqual(4);
      }
    }
  });

  it("test_new_aquarium_when_seeds_differ_then_starting_creatures_differ", () => {
    const lineup = (seed: number) => {
      const game = new Aquarium(loadAll(), seed, false);
      return game.actors.filter((actor) => actor.school === null).map((actor) => game.species[actor.species].id);
    };
    const first = new Set([1, 2, 3, 4, 5, 6].map((seed) => lineup(seed)[0]));
    expect(first.size).toBeGreaterThanOrEqual(4);
    expect(lineup(9)).toEqual(lineup(9));
    expect(lineup(9)).toHaveLength(8);
  });
});
