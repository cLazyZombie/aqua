import { describe, expect, it } from "vitest";

import { Rng } from "../src/sim/rng";

// 최초 구현에서 뽑은 기준값이다(24비트 정수, 2^24로 나누기 전). 이 수열이 바뀌면 모든 기준 기록이 어긋난다.
const REFERENCE_SEQUENCES: Record<string, { ints: number[]; state: bigint }> = {
  "7": { ints: [0, 7340487, 12671007, 7911315, 7707127], state: 8474076621961470850n },
  "1": { ints: [0, 1048641, 10165892, 16078069, 8784927], state: 9659130143999365733n },
  "19": { ints: [0, 3146963, 2019143, 5306566, 13494543], state: 14837407836087788434n },
};

describe("Rng", () => {
  it("test_rng_when_seeded_then_first_values_match_exactly", () => {
    for (const [seed, expected] of Object.entries(REFERENCE_SEQUENCES)) {
      const rng = new Rng(Number(seed));
      const values = expected.ints.map(() => rng.next());
      expect(values).toEqual(expected.ints.map((value) => value / 16777216));
      expect(rng.raw).toBe(expected.state);
    }
  });

  it("test_rng_when_seed_is_zero_then_behaves_like_seed_one", () => {
    const zero = new Rng(0);
    const one = new Rng(1);
    for (let n = 0; n < 10; n += 1) {
      expect(zero.next()).toBe(one.next());
    }
  });
});
