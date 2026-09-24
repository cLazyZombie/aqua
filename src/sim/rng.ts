// xorshift64 수열이다. 64비트 연산을 BigInt로 계산한다.

const MASK = (1n << 64n) - 1n;
const SCALE = 1 << 24;

export class Rng {
  private state: bigint;

  /** 시드 0은 1로 바꾼다. */
  constructor(seed: number | bigint) {
    const value = BigInt.asUintN(64, BigInt(seed));
    this.state = value === 0n ? 1n : value;
  }

  /** 0 이상 1 미만의 값이다. 24비트 정수를 2^24로 나눠 f32와 같은 값이 된다. */
  next(): number {
    let x = this.state;
    x ^= (x << 13n) & MASK;
    x ^= x >> 7n;
    x ^= (x << 17n) & MASK;
    this.state = x;
    return Number(x >> 40n) / SCALE;
  }

  /** 현재 내부 상태다(테스트 비교용). */
  get raw(): bigint {
    return this.state;
  }
}

/**
 * splitmix64로 시드를 고르게 섞는다. xorshift64는 작은 시드(1, 7 같은)에서 첫 값들의 상위 비트가 0에 가까워
 * 첫 뽑기가 늘 목록 앞쪽으로 치우치므로, 수족관은 섞은 시드로 수열을 시작한다.
 */
export function mixSeed(seed: number | bigint): bigint {
  let z = BigInt.asUintN(64, BigInt(seed) + 0x9e3779b97f4a7c15n);
  z = BigInt.asUintN(64, (z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n);
  z = BigInt.asUintN(64, (z ^ (z >> 27n)) * 0x94d049bb133111ebn);
  return z ^ (z >> 31n);
}
