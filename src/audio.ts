// 배경 음악과 물속 소리(Web Audio).
// - 낮·밤 재생 목록이 따로 있고, 시간대가 바뀌면 천천히 엇갈려 바꾼다. 목록마다 재생 위치를 기억했다가 다시 그 시간대가 오면 이어서 튼다.
// - 물속 앰비언스는 늘 깔고, 수면 찰랑임은 낮·폭풍에 조금 커진다. 기포 소리는 먹이·두드림·기포 터뜨리기·도넛 고리 때와 가끔 저절로 난다.
// 시뮬레이션 상태를 읽기만 하고 난수는 Math.random을 쓴다(시뮬레이션·그림의 결정성과 무관하다).
// 브라우저는 사용자 입력 전에는 소리를 막으므로 첫 키·클릭·터치에서 unlock()으로 시작한다.

import type { Aquarium } from "./render/simapi";
import { WIDTH } from "./render/simapi";

const BASE = "./assets/audio/";
const STORAGE_KEY = "aqua.sound";

type Music = { id: string; loop: boolean };

/** 낮 곡(모두 CC0). 마지막 곡은 끝이 페이드아웃이라 루프하지 않고 끝나기 전에 다음 곡으로 넘긴다. */
const DAY: Music[] = [
  { id: "underwater-theme-ii", loop: true },
  { id: "aquaria", loop: true },
  { id: "underwater-bells", loop: true },
  { id: "ice-cave-lofi", loop: false },
];
/** 밤 곡(CC BY 3.0, 표기는 LICENSE·README). */
const NIGHT: Music[] = [
  { id: "starlight", loop: true },
  { id: "gentle-lullaby", loop: true },
];

/** 짧은 루프 곡도 적어도 이만큼(초)은 되풀이한 뒤 다음 곡으로 넘어간다. */
const MIN_PLAY = 150;
/** 곡을 엇갈려 바꾸는 시간(초)이다. */
const FADE = 5;
/** 수면 찰랑임은 루프 이음새가 없는 녹음이라 끝과 처음을 이만큼 겹쳐 잇는다. */
const LAP_OVERLAP = 3;
const LEVEL = { master: 0.9, music: 0.6, bed: 0.45, lapping: 0.2, bubbles: 0.55 };

type Phase = "day" | "night";

/** 한 번 튼 곡. 재생 위치를 계산해 다음에 이어 틀 수 있게 한다. */
class Voice {
  constructor(
    readonly music: Music,
    readonly source: AudioBufferSourceNode,
    readonly gain: GainNode,
    readonly startedAt: number,
    readonly offset: number,
  ) {}

  position(now: number): number {
    const t = this.offset + (now - this.startedAt);
    const source = this.source;
    if (!source.loop) return t;
    const span = source.loopEnd - source.loopStart;
    return t < source.loopEnd ? t : source.loopStart + ((t - source.loopStart) % span);
  }

  fadeOut(now: number, seconds: number): void {
    this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.setValueAtTime(this.gain.gain.value, now);
    this.gain.gain.linearRampToValueAtTime(0, now + seconds);
    this.source.stop(now + seconds + 0.1);
  }
}

/** 한 시간대의 재생 목록: 섞은 순서, 지금 곡, 이어 틀 위치, 지금 곡을 튼 시간. */
class Playlist {
  order: Music[];
  index = 0;
  offset = 0;
  played = 0;

  constructor(private readonly pool: Music[]) {
    this.order = shuffled(pool);
  }

  get current(): Music {
    return this.order[this.index];
  }

  get upcoming(): Music {
    return this.order[(this.index + 1) % this.order.length];
  }

  advance(): void {
    const last = this.current;
    this.index += 1;
    if (this.index >= this.order.length) {
      // 한 바퀴 돌면 다시 섞되 방금 곡이 바로 또 나오지 않게 한다.
      this.index = 0;
      this.order = shuffled(this.pool);
      if (this.order.length > 1 && this.order[0] === last) [this.order[0], this.order[1]] = [this.order[1], this.order[0]];
    }
    this.offset = 0;
    this.played = 0;
  }
}

function shuffled<T>(items: T[]): T[] {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** 버퍼 앞뒤의 디지털 무음(인코더 여백)을 뺀 루프 구간이다. */
function loopSpan(buffer: AudioBuffer): [number, number] {
  const data = buffer.getChannelData(0);
  const quiet = 1e-4;
  let start = 0;
  while (start < data.length && Math.abs(data[start]) < quiet) start++;
  let end = data.length - 1;
  while (end > start && Math.abs(data[end]) < quiet) end--;
  return [start / buffer.sampleRate, (end + 1) / buffer.sampleRate];
}

/** 기포 녹음에서 소리가 충분히 큰 0.25초 구간의 시작 위치들이다(조용한 틈을 고르지 않게). */
function loudSpots(buffer: AudioBuffer): number[] {
  const data = buffer.getChannelData(0);
  const window = Math.floor(buffer.sampleRate * 0.25);
  const levels: [number, number][] = [];
  for (let at = 0; at + window < data.length; at += window) {
    let sum = 0;
    for (let i = at; i < at + window; i += 4) sum += data[i] * data[i];
    levels.push([at / buffer.sampleRate, Math.sqrt(sum / (window / 4))]);
  }
  const sorted = levels.map(([, level]) => level).sort((a, b) => a - b);
  const floor = sorted[Math.floor(sorted.length * 0.45)] ?? 0;
  return levels.filter(([, level]) => level >= floor).map(([time]) => time);
}

export class Sound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private lapBus!: GainNode;
  private readonly buffers = new Map<string, Promise<AudioBuffer | null>>();
  private readonly lists: Record<Phase, Playlist> = { day: new Playlist(DAY), night: new Playlist(NIGHT) };
  private phase: Phase | null = null;
  private voice: Voice | null = null;
  /** 곡을 불러오는 중에 다시 바꾸지 않게 하는 표시다. */
  private loading = false;
  private lapBuffer: AudioBuffer | null = null;
  private lapNext = 0;
  private lapVoice: { source: AudioBufferSourceNode; gain: GainNode } | null = null;
  private bubbleBuffer: AudioBuffer | null = null;
  private bubbleSpots: number[] = [];
  private bubbleVoices = 0;
  private lastBubble = 0;
  private ambientBubbleAt = 0;
  private readonly heard = new WeakSet<object>();
  enabled: boolean;

  constructor() {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      stored = null;
    }
    this.enabled = stored !== "off";
    document.addEventListener("visibilitychange", () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend();
      else if (this.enabled) void this.ctx.resume();
    });
  }

  /** 첫 사용자 입력에서 부른다. 소리 장치를 만들고 앰비언스를 깔기 시작한다. */
  unlock(): void {
    if (!this.enabled) return;
    if (this.ctx) {
      if (this.ctx.state === "suspended" && !document.hidden) void this.ctx.resume();
      return;
    }
    const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return;
    const ctx = new Context();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.gain.linearRampToValueAtTime(LEVEL.master, ctx.currentTime + 2);
    this.master.connect(ctx.destination);
    this.musicBus = this.bus(LEVEL.music);
    this.sfxBus = this.bus(LEVEL.bubbles);
    this.lapBus = this.bus(0);
    void this.startBed();
    void this.load("surface-lapping").then((buffer) => {
      this.lapBuffer = buffer;
    });
    void this.load("bubbles").then((buffer) => {
      if (!buffer) return;
      this.bubbleSpots = loudSpots(buffer);
      this.bubbleBuffer = buffer;
    });
    this.ambientBubbleAt = ctx.currentTime + 8 + Math.random() * 12;
  }

  /** M 키: 소리 켜기/끄기. 켜고 끈 상태는 다음 실행에도 남는다. */
  toggle(): boolean {
    this.enabled = !this.enabled;
    try {
      localStorage.setItem(STORAGE_KEY, this.enabled ? "on" : "off");
    } catch {
      // 저장소를 못 쓰면 이번 실행에서만 기억한다.
    }
    if (this.enabled) {
      this.unlock();
      if (this.ctx) {
        const now = this.ctx.currentTime;
        this.master.gain.cancelScheduledValues(now);
        this.master.gain.setValueAtTime(this.master.gain.value, now);
        this.master.gain.linearRampToValueAtTime(LEVEL.master, now + 0.6);
      }
    } else if (this.ctx) {
      const ctx = this.ctx;
      const now = ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(this.master.gain.value, now);
      this.master.gain.linearRampToValueAtTime(0, now + 0.4);
      window.setTimeout(() => {
        if (!this.enabled) void ctx.suspend();
      }, 500);
    }
    return this.enabled;
  }

  /** 스모크 테스트용 상태: 소리 장치, 시간대, 지금 곡, 받아 둔 음원 수. */
  state(): { context: string; phase: Phase | null; music: string | null; buffers: number; lapping: boolean; bubbles: boolean } {
    return {
      context: this.ctx?.state ?? "none",
      phase: this.phase,
      music: this.voice?.music.id ?? null,
      buffers: this.buffers.size,
      lapping: this.lapVoice !== null,
      bubbles: this.bubbleBuffer !== null,
    };
  }

  /** 먹이를 뿌리거나 건넬 때: 짧은 보글 소리. */
  feed(x: number): void {
    this.bubble(x, 0.7, 0.8, 1.1);
  }

  /** 빈 곳 유리 두드리기: 낮고 둔한 보글 소리. */
  tap(x: number): void {
    this.bubble(x, 0.9, 0.9, 0.7);
  }

  /** 매 프레임: 시간대에 맞는 곡, 수면 찰랑임 크기, 새로 생긴 기포 소리를 챙긴다. */
  update(game: Aquarium, dt: number): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running" || !this.enabled) return;
    const now = ctx.currentTime;
    this.updateMusic(game, now, dt);
    this.updateLapping(game, now);
    // 포인터로 터뜨린 기포와 다이버·흰고래의 도넛 고리.
    for (const particle of game.particles) {
      if (particle.kind !== "Pop" && particle.kind !== "Donut") continue;
      if (this.heard.has(particle)) continue;
      this.heard.add(particle);
      if (particle.age > 0.5) continue;
      if (particle.kind === "Pop" && particle.seed > 0.5) this.bubble(particle.x, 0.35, 0.45, 1.35);
      else if (particle.kind === "Donut") this.bubble(particle.x, 1.4, 0.7, 0.85);
    }
    // 가끔 멀리서 저절로 오르는 기포 소리.
    if (now > this.ambientBubbleAt) {
      this.ambientBubbleAt = now + 14 + Math.random() * 26;
      this.bubble(Math.random() * WIDTH, 2.5 + Math.random() * 2, 0.35, 0.9 + Math.random() * 0.2);
    }
  }

  private bus(level: number): GainNode {
    const gain = this.ctx!.createGain();
    gain.gain.value = level;
    gain.connect(this.master);
    return gain;
  }

  private load(id: string): Promise<AudioBuffer | null> {
    let pending = this.buffers.get(id);
    if (!pending) {
      const ctx = this.ctx!;
      pending = fetch(`${BASE}${id}.mp3`)
        .then((response) => (response.ok ? response.arrayBuffer() : Promise.reject(new Error(`${id}: ${response.status}`))))
        .then((data) => ctx.decodeAudioData(data))
        .catch((error) => {
          console.warn("audio", error);
          return null;
        });
      this.buffers.set(id, pending);
    }
    return pending;
  }

  /** 물속 앰비언스: 작가가 이음새 없이 만든 루프라 그대로 되풀이한다. */
  private async startBed(): Promise<void> {
    const buffer = await this.load("underwater-bed");
    const ctx = this.ctx;
    if (!buffer || !ctx) return;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    [source.loopStart, source.loopEnd] = loopSpan(buffer);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.linearRampToValueAtTime(LEVEL.bed, ctx.currentTime + 4);
    source.connect(gain).connect(this.master);
    source.start(ctx.currentTime, source.loopStart);
  }

  private updateMusic(game: Aquarium, now: number, dt: number): void {
    if (!game.started) return;
    const night = game.nightStrength();
    // 경계에서 흔들리지 않게 밤은 0.6을 넘을 때, 낮은 0.4 아래로 내려갈 때 바꾼다.
    const phase: Phase = this.phase === null ? (night > 0.5 ? "night" : "day") : this.phase === "day" ? (night > 0.6 ? "night" : "day") : night < 0.4 ? "day" : "night";
    if (this.loading) return;
    if (phase !== this.phase) {
      if (this.voice && this.phase) {
        const list = this.lists[this.phase];
        list.offset = this.voice.position(now);
        this.voice.fadeOut(now, FADE);
        this.voice = null;
      }
      this.phase = phase;
      void this.play(phase, FADE);
      return;
    }
    const voice = this.voice;
    if (!voice) return;
    const list = this.lists[phase];
    list.played += dt;
    const duration = voice.source.buffer!.duration;
    const due = voice.music.loop
      ? list.played >= Math.max(1, Math.ceil(MIN_PLAY / duration)) * duration - FADE && list.order.length > 1
      : voice.position(now) >= duration - FADE - 0.5;
    if (due) {
      voice.fadeOut(now, FADE);
      this.voice = null;
      list.advance();
      void this.play(phase, FADE);
    }
  }

  /** 시간대 목록의 지금 곡을 기억한 위치부터 서서히 키운다. 다음 곡은 미리 받아 둔다. */
  private async play(phase: Phase, fade: number): Promise<void> {
    const list = this.lists[phase];
    const music = list.current;
    this.loading = true;
    const buffer = await this.load(music.id);
    this.loading = false;
    const ctx = this.ctx;
    if (!buffer || !ctx || this.phase !== phase || list.current !== music) return;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    let offset = list.offset;
    if (music.loop) {
      source.loop = true;
      [source.loopStart, source.loopEnd] = loopSpan(buffer);
      offset = Math.min(Math.max(offset, source.loopStart), source.loopEnd - 0.05);
    } else if (offset > buffer.duration - FADE - 2) {
      offset = 0;
    }
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1, now + fade);
    source.connect(gain).connect(this.musicBus);
    source.start(now, offset);
    this.voice = new Voice(music, source, gain, now, offset);
    void this.load(list.upcoming.id);
    void this.load(this.lists[phase === "day" ? "night" : "day"].current.id);
  }

  /** 수면 찰랑임: 녹음 끝과 처음을 겹쳐 끊김 없이 잇고, 낮·폭풍에 조금 커진다. */
  private updateLapping(game: Aquarium, now: number): void {
    const target = LEVEL.lapping * (0.55 + 0.45 * game.daylight()) * (1 + game.weather.strength * 1.2);
    this.lapBus.gain.setTargetAtTime(target, now, 1.5);
    const buffer = this.lapBuffer;
    if (!buffer || now < this.lapNext) return;
    const ctx = this.ctx!;
    if (this.lapVoice) {
      const old = this.lapVoice;
      old.gain.gain.setValueAtTime(1, now);
      old.gain.gain.linearRampToValueAtTime(0, now + LAP_OVERLAP);
      old.source.stop(now + LAP_OVERLAP + 0.1);
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1, now + LAP_OVERLAP);
    source.connect(gain).connect(this.lapBus);
    // 처음에는 아무 데서나 시작해 매번 같은 찰랑임으로 열리지 않게 한다.
    const offset = this.lapVoice ? 0 : Math.random() * buffer.duration * 0.5;
    source.start(now, offset);
    this.lapVoice = { source, gain };
    this.lapNext = now + (buffer.duration - offset) - LAP_OVERLAP;
  }

  /** 기포 녹음의 큰 구간 하나를 짧게 튼다. x(월드)로 좌우를 나눈다. */
  private bubble(x: number, seconds: number, level: number, rate: number): void {
    const ctx = this.ctx;
    const buffer = this.bubbleBuffer;
    if (!ctx || !buffer || ctx.state !== "running" || !this.enabled) return;
    const now = ctx.currentTime;
    if (this.bubbleVoices >= 4 || now - this.lastBubble < 0.08) return;
    this.lastBubble = now;
    this.bubbleVoices += 1;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const speed = rate * (0.92 + Math.random() * 0.16);
    source.playbackRate.value = speed;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(level, now + Math.min(0.08, seconds * 0.2));
    gain.gain.setValueAtTime(level, now + seconds * 0.55);
    gain.gain.linearRampToValueAtTime(0, now + seconds);
    source.connect(gain);
    let tail: AudioNode = gain;
    if (ctx.createStereoPanner) {
      const pan = ctx.createStereoPanner();
      pan.pan.value = Math.max(-1, Math.min(1, (x / WIDTH) * 2 - 1)) * 0.7;
      gain.connect(pan);
      tail = pan;
    }
    tail.connect(this.sfxBus);
    // start의 길이는 버퍼 시간이라 재생 속도를 곱한다.
    const span = seconds * speed;
    const spot = this.bubbleSpots[Math.floor(Math.random() * this.bubbleSpots.length)];
    source.start(now, Math.min(spot, Math.max(0, buffer.duration - span - 0.1)), span + 0.05);
    source.onended = () => {
      this.bubbleVoices -= 1;
    };
  }
}
