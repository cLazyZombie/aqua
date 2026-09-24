// f32 수 의미(반올림·나머지·부호)를 맞추는 도우미다. 기준 기록(tests/fixtures)과 같은 결과를 내려고 JS 기본 연산과 다른 곳만 모았다.

/**
 * f32로 반올림한다. 위치·속도는 f64로 두되, 문턱을 넘는 frame이 난수 순서를 바꾸는 시계·타이머·수명은
 * f32로 누적한다(예: 1/30초를 48번 더하면 f64는 1.6을 넘고 f32는 넘지 않는다).
 */
export const f32 = Math.fround;

/** f32 clamp. */
export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(Math.max(x, lo), hi);
}

/** 부호. 0은 부호대로 1 또는 -1이다(JS `Math.sign`은 0을 돌려준다). */
export function signum(x: number): number {
  if (Number.isNaN(x)) return NaN;
  if (x > 0) return 1;
  if (x < 0) return -1;
  return Object.is(x, -0) ? -1 : 1;
}

/** 반올림. 0.5는 0에서 먼 쪽으로 반올림한다(JS `Math.round`는 음수에서 다르다). */
export function round(x: number): number {
  return x < 0 ? -Math.round(-x) : Math.round(x);
}

/** 유클리드 나머지. 결과는 늘 0 이상이다. */
export function remEuclid(a: number, b: number): number {
  const r = a % b;
  return r < 0 ? r + Math.abs(b) : r;
}

/** 소수부(0 쪽으로 자른 나머지). */
export function fract(x: number): number {
  return x - Math.trunc(x);
}

/** 0 이상 정수 변환. 0 쪽으로 자르고 음수·NaN은 0이다. */
export function toUsize(x: number): number {
  if (!(x > 0)) return 0;
  return Math.trunc(x);
}

/** `(roll * len as f32) as usize % len`. 곱셈을 f32로 반올림해 기준 기록과 같은 칸을 고른다. */
export function pickIndex(roll: number, len: number): number {
  return toUsize(Math.fround(roll * len)) % len;
}

/** 순서를 지키며 제자리에서 걸러 낸다. */
export function retain<T>(items: T[], keep: (item: T) => boolean): void {
  let write = 0;
  for (let read = 0; read < items.length; read += 1) {
    const item = items[read];
    if (keep(item)) {
      items[write] = item;
      write += 1;
    }
  }
  items.length = write;
}

/** 가장 작은 값. 같은 값이 여럿이면 처음 것을 돌려준다. */
export function minBy<T>(items: Iterable<T>, key: (item: T) => number): T | null {
  let best: T | null = null;
  let bestKey = 0;
  for (const item of items) {
    const value = key(item);
    if (best === null || value < bestKey) {
      best = item;
      bestKey = value;
    }
  }
  return best;
}

/** 난수 순서를 건드리지 않는 결정적 해시(0..1)다. 개체 번호 같은 정수에서 겉모습을 정할 때 쓴다. */
export function hash01(a: number, b = 0): number {
  const v = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return v - Math.floor(v);
}
