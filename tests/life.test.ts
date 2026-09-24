import { describe, expect, it } from "vitest";

import { Weather } from "../src/sim/events";
import { flow, Tentacle } from "../src/sim/life";

describe("life", () => {
  it("test_tentacle_step_when_body_rises_then_tip_trails_below_and_keeps_length", () => {
    const tentacle = new Tentacle([0, 4], [100, 100], 6, 3, 0);
    for (let frame = 0; frame < 90; frame += 1) {
      tentacle.step([100, 100 - frame * 0.5], 1 / 30, frame / 30);
    }
    const root = tentacle.points[0];
    const tip = tentacle.points[6];
    expect(tip[1]).toBeGreaterThan(root[1] + 10);
    for (let index = 1; index < tentacle.points.length; index += 1) {
      const [ax, ay] = tentacle.points[index - 1];
      const [bx, by] = tentacle.points[index];
      expect(Math.abs(Math.hypot(bx - ax, by - ay) - 3)).toBeLessThan(0.05);
    }
  });

  it("test_flow_when_sampled_then_divergence_is_near_zero", () => {
    const h = 0.01;
    for (const [x, y, t] of [
      [40, 60, 0],
      [300, 200, 12],
      [123, 45, 99],
    ]) {
      const [u1] = flow(x + h, y, t);
      const [u0] = flow(x - h, y, t);
      const [, v1] = flow(x, y + h, t);
      const [, v0] = flow(x, y - h, t);
      const divergence = (u1 - u0) / (2 * h) + (v1 - v0) / (2 * h);
      expect(Math.abs(divergence)).toBeLessThan(0.05);
    }
  });
});

describe("events", () => {
  it("test_weather_step_when_storm_runs_then_ramps_flashes_and_clears", () => {
    const weather = new Weather();
    weather.start(20);
    let flashes = 0;
    for (let n = 0; n < 40 * 30; n += 1) {
      const before = weather.flash;
      weather.step(1 / 30, 0.5);
      if (weather.flash > before) {
        flashes += 1;
      }
    }
    expect(flashes).toBeGreaterThanOrEqual(2);
    expect(weather.strength).toBe(0);
    expect(weather.active()).toBe(false);
  });
});
