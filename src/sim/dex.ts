// 목격 도감. 화면에서 처음 본 생물과 처음 겪은 사건을 조용히 기록한다(`Tab` 창에서 확인).
// 브라우저에서는 localStorage `aqua.dex`에 저장해 다음 방문에도 이어진다.

import type { Aquarium } from "./aquarium";
import { WIDTH } from "./constants";
import { EVENT_KINDS, eventId, eventTitle } from "./director";
import { f32 } from "./num";

const STORAGE_KEY = "aqua.dex";
/** 방문자 단골 개체별 방문 횟수를 두는 저장 키다. */
const VISITS_KEY = "aqua.dex.visits";
/** 낚시로 잡은 종별 횟수를 두는 저장 키다. */
const CAUGHT_KEY = "aqua.dex.caught";

/** 도감 한 칸(생물 또는 사건)이다. */
export interface DexEntry {
  key: string;
  name: string;
  seen: boolean;
}

function storage(): Storage | null {
  try {
    const candidate = (globalThis as { localStorage?: Storage }).localStorage;
    return candidate ?? null;
  } catch {
    return null;
  }
}

export class Dex {
  seen = new Set<string>();
  /** 기록할 때마다 localStorage에 저장하는지다. 테스트와 캡처는 끈다. */
  persist = false;
  /** 도감 목록 창을 펼쳤는지다. */
  open = false;
  /** 펼친 도감의 쪽 번호다. */
  page = 0;
  sinceCheck = 0;
  /** 방문자 단골 개체(`<종 id>:<개체 번호>`)별 방문 횟수다. */
  visits = new Map<string, number>();
  /** 이번 방문을 이미 센 생물 id다(저장하지 않는다). */
  counted = new Set<number>();
  /** 낚시로 잡은(놓아 준) 종 id별 횟수다. */
  caught = new Map<string, number>();

  /** `persist`면 저장된 기록을 읽고 이후 기록도 저장한다. 읽기 실패는 빈 도감으로 시작한다. */
  static load(persist: boolean): Dex {
    const dex = new Dex();
    dex.persist = persist;
    if (!persist) {
      return dex;
    }
    try {
      const text = storage()?.getItem(STORAGE_KEY);
      if (text) {
        const parsed: unknown = JSON.parse(text);
        if (Array.isArray(parsed)) {
          for (const key of parsed) {
            if (typeof key === "string") dex.seen.add(key);
          }
        }
      }
      const caught = storage()?.getItem(CAUGHT_KEY);
      if (caught) {
        const parsed: unknown = JSON.parse(caught);
        if (parsed && typeof parsed === "object") {
          for (const [key, count] of Object.entries(parsed as Record<string, unknown>)) {
            if (typeof count === "number") dex.caught.set(key, count);
          }
        }
      }
      const visits = storage()?.getItem(VISITS_KEY);
      if (visits) {
        const parsed: unknown = JSON.parse(visits);
        if (parsed && typeof parsed === "object") {
          for (const [key, count] of Object.entries(parsed as Record<string, unknown>)) {
            if (typeof count === "number") dex.visits.set(key, count);
          }
        }
      }
    } catch {
      // 저장소를 못 읽어도 게임은 계속한다.
    }
    return dex;
  }

  /** 방문자 단골 개체의 방문을 한 번 센다. */
  visit(key: string): void {
    this.visits.set(key, (this.visits.get(key) ?? 0) + 1);
    if (this.persist) {
      try {
        storage()?.setItem(VISITS_KEY, JSON.stringify(Object.fromEntries([...this.visits].sort())));
      } catch {
        // 저장 실패는 무시한다.
      }
    }
  }

  /** 낚시로 한 종을 잡았다(놓아 줬다). 도감에 ◎로 남는다. */
  catch(species: string): void {
    this.caught.set(species, (this.caught.get(species) ?? 0) + 1);
    if (this.persist) {
      try {
        storage()?.setItem(CAUGHT_KEY, JSON.stringify(Object.fromEntries([...this.caught].sort())));
      } catch {
        // 저장 실패는 무시한다.
      }
    }
  }

  /** 한 종의 방문 횟수 합이다. */
  visitsOf(species: string): number {
    let total = 0;
    for (const [key, count] of this.visits) {
      if (key.startsWith(`${species}:`)) total += count;
    }
    return total;
  }

  seenCount(): number {
    return this.seen.size;
  }

  has(key: string): boolean {
    return this.seen.has(key);
  }

  /** 처음 보는 항목이면 기록하고, 저장을 켰으면 저장한다. 저장 실패는 게임을 멈추지 않는다. */
  record(key: string): void {
    if (this.seen.has(key)) {
      return;
    }
    this.seen.add(key);
    if (this.persist) {
      try {
        // 정렬된 순서로 쓴다.
        storage()?.setItem(STORAGE_KEY, JSON.stringify([...this.seen].sort()));
      } catch {
        // 저장 실패는 무시한다.
      }
    }
  }
}

/** 도감의 모든 칸(생물 먼저, 사건 다음)이다. 잠수부는 사건으로만 센다. */
export function dexEntries(game: Aquarium): DexEntry[] {
  const entries: DexEntry[] = [];
  for (const entry of game.species) {
    if (entry.id === "diver") continue;
    const key = `species:${entry.id}`;
    // 희귀 색 변이를 본 종에는 ★, 방문자에는 지금까지 온 횟수를 붙인다.
    const rare = [1, 2, 3].some((variant) => game.dex.has(`variant:${entry.id}:${variant}`));
    const visits = game.dex.visitsOf(entry.id);
    // 낚시로 잡은 종에는 ◎를 붙인다.
    const caught = game.dex.caught.has(entry.id);
    const name = `${entry.nameKo}${rare ? " ★" : ""}${visits > 1 ? ` ×${visits}` : ""}${caught ? " ◎" : ""}`;
    entries.push({ key, name, seen: game.dex.has(key) });
  }
  for (const kind of EVENT_KINDS) {
    const key = `event:${eventId(kind)}`;
    entries.push({ key, name: eventTitle(kind), seen: game.dex.has(key) });
  }
  return entries;
}

/** 화면에 들어온 가까운 층 생물과 시작된 사건을 도감에 기록한다. */
export function observe(game: Aquarium, dt: number): void {
  const dex = game.dex;
  dex.sinceCheck = f32(dex.sinceCheck + dt);
  if (dex.sinceCheck < 0.5 || !game.started) {
    return;
  }
  dex.sinceCheck = 0;
  const found: string[] = [];
  for (const actor of game.actors) {
    const species = game.species[actor.species];
    if (species.id !== "diver" && actor.depth === 1 && actor.alpha() > 0.6 && actor.x >= 8 && actor.x < WIDTH - 8) {
      found.push(`species:${species.id}`);
      if (actor.variant > 0) found.push(`variant:${species.id}:${actor.variant}`);
      if (actor.individual >= 0 && !dex.counted.has(actor.id)) {
        dex.counted.add(actor.id);
        dex.visit(`${species.id}:${actor.individual}`);
      }
    }
  }
  for (const kind of game.director.started) {
    found.push(`event:${eventId(kind)}`);
  }
  for (const key of found) {
    dex.record(key);
  }
}
