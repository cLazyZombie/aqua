import { describe, expect, it } from "vitest";

import { loadAll, loadCatalog } from "../src/sim/catalog";

describe("catalog", () => {
  it("test_load_all_when_assets_are_current_then_every_creature_has_a_group_and_animation", () => {
    const species = loadAll();
    expect(species.length).toBeGreaterThanOrEqual(25);
    expect(species.every((entry) => entry.group !== "")).toBe(true);
    expect(species.every((entry) => entry.frames >= 2)).toBe(true);
    expect(species.some((entry) => entry.group === "school")).toBe(true);
    expect(species.some((entry) => entry.glow)).toBe(true);
  });

  it("test_load_catalog_when_json_is_snake_case_then_fields_are_camel_case", () => {
    const species = loadCatalog();
    const clown = species.find((entry) => entry.id === "clownfish");
    expect(clown).toBeDefined();
    expect(clown?.nameKo).toBe("흰동가리");
    expect(clown?.frameW).toBeGreaterThan(0);
    expect(clown?.frameH).toBeGreaterThan(0);
    expect(clown?.alt).toBeNull();
    const puffer = species.find((entry) => entry.id === "pufferfish");
    expect(puffer?.alt?.frameW).toBeGreaterThan(0);
    expect(puffer?.alt?.texture).toMatch(/pufferfish-puffed\.png$/);
    const glowing = species.find((entry) => entry.glow);
    expect(glowing?.glowTexture).not.toBeNull();
    expect(glowing?.glowCenter).toHaveLength(2);
  });
});
