// 번개가 치는 폭풍. 먼 배경의 고래·오징어·잠수정은 `director.ts`의 `FarThing`이 맡는다.

import { clamp, f32 } from "./num";

/** 폭풍 진행 상태. `strength`는 0에서 1로 올라갔다 내려오고, `flash`는 번개 직후 1에서 0으로 줄어든다. */
export class Weather {
  strength = 0;
  flash = 0;
  remaining = 0;
  untilFlash = 0;
  /** 첫 섬광 직후 한 번 더 번쩍이는 잔광까지 남은 시간이다. */
  echo: number | null = null;

  start(seconds: number): void {
    this.remaining = seconds;
    this.untilFlash = 2.5;
  }

  active(): boolean {
    return this.remaining > 0 || this.strength > 0;
  }

  /** `roll`은 0..1 난수다. 번개 간격을 정한다. */
  step(dt: number, roll: number): void {
    this.remaining = Math.max(f32(this.remaining - dt), 0);
    const target = this.remaining > 0 ? 1 : 0;
    const limit = f32(dt / 6);
    this.strength = f32(this.strength + clamp(f32(target - this.strength), -limit, limit));
    this.flash = Math.max(f32(this.flash - f32(dt * 3.2)), 0);
    if (this.echo !== null) {
      if (this.echo <= dt) {
        this.flash = Math.max(this.flash, f32(0.65));
        this.echo = null;
      } else {
        this.echo = f32(this.echo - dt);
      }
    }
    if (this.remaining > 0 && this.strength > f32(0.6)) {
      this.untilFlash = f32(this.untilFlash - dt);
      if (this.untilFlash <= 0) {
        this.flash = 1;
        this.echo = f32(0.18);
        this.untilFlash = f32(3 + f32(roll * 6));
      }
    }
  }
}
