// 진입점: 창 모드(입력·크기 조절·60fps 루프)와 headless 캡처 모드.

import "./style.css";

import { Sound } from "./audio";
import { type SceneAssets, loadScene, loadSceneAssets } from "./render/assets";
import { clamStates } from "./render/backdrop";
import { availableScenes, pickScene } from "./render/scenes";
import { Renderer } from "./render/renderer";
import { displayName, pick } from "./render/interact";
import { buildFrame, screenToWorld, visibleRange } from "./render/scene";
import { Aquarium, Dex, type EventKind, SCREEN_HEIGHT, SCREEN_WIDTH, eventFromId, eventId, loadAll, setVisibleRange } from "./render/simapi";
import { TextLayer } from "./render/text";

declare global {
  interface Window {
    __aquaReady?: boolean;
    __aquaReport?: unknown;
    __aquaError?: string;
    __aquaEnter?: () => Promise<void>;
    __aquaSound?: Sound;
    __aquaLive?: () => { started: boolean; dex: boolean; page: number; flashlight: boolean; food: number; ripples: number; hover: string | null; touch: boolean; pointer: [number, number] | null };
  }
}

const canvas = document.getElementById("view") as HTMLCanvasElement;
const uiRoot = document.getElementById("ui") as HTMLDivElement;
const params = new URLSearchParams(location.search);

async function loadFonts(): Promise<void> {
  const faces = [new FontFace("Galmuri", "url(./assets/fonts/Galmuri11.ttf)"), new FontFace("GalmuriBold", "url(./assets/fonts/Galmuri11-Bold.ttf)")];
  await Promise.all(
    faces.map(async (face) => {
      await face.load();
      document.fonts.add(face);
    }),
  );
}

function numberParam(name: string, fallback: number): number {
  const value = params.get(name);
  return value === null || value === "" ? fallback : Number(value);
}

function pairParam(name: string, separator: string): [number, number] | null {
  const value = params.get(name);
  if (!value) return null;
  const [a, b] = value.split(separator).map((part) => Number(part.trim()));
  if (!Number.isFinite(a) || !Number.isFinite(b)) throw new Error(`--${name} expects a${separator}b`);
  return [a, b];
}

class App {
  private readonly renderer = new Renderer(canvas);
  private readonly text = new TextLayer(uiRoot);
  /// 창의 논리 크기다.
  viewport: [number, number] = [SCREEN_WIDTH, SCREEN_HEIGHT];
  private pixelRatio = 1;

  constructor(
    readonly game: Aquarium,
    private readonly assets: SceneAssets,
  ) {}

  /// 바닥 조개들의 열림 단계(0 닫힘, 1 반쯤, 2 활짝)다.
  clams(): { x: number; open: number }[] {
    return clamStates(this.game, this.assets);
  }

  /// 지금 배경 컨셉 id다.
  get sceneId(): string {
    return this.assets.scene.style.id;
  }

  /// 배경 컨셉을 바꾸고 소품 배치를 새로 만든다(텍스처를 읽는 동안에는 이전 배경을 그린다).
  async switchScene(id: string, layoutSeed: number): Promise<void> {
    this.assets.scene = await loadScene(id, this.assets.props, layoutSeed);
  }

  /// 창 크기를 읽어 뷰포트와 렌더 표면을 맞춘다(매 frame 호출해도 된다).
  syncSize(fixed: [number, number] | null, ratio: number): void {
    const width = fixed ? fixed[0] : Math.max(1, window.innerWidth);
    const height = fixed ? fixed[1] : Math.max(1, window.innerHeight);
    this.viewport = [width, height];
    this.pixelRatio = ratio;
    // 생물 등장·퇴장·돌아서기 가장자리를 이 창에 보이는 월드 범위에 맞춘다(휴대폰 가로 화면은 무대 양옆 여백까지).
    setVisibleRange(...visibleRange(this.viewport, this.game.look.integer));
    this.renderer.resize(width * ratio, height * ratio, ratio, width, height);
  }

  draw(): void {
    const frame = buildFrame(this.game, this.assets, this.viewport);
    this.renderer.render(frame);
    this.text.update(frame.texts);
  }

  /// 포인터가 가리키는 생물을 찾아 `game.hover`에 적는다. 타이틀·도감 화면에서는 비운다.
  updateHover(): void {
    const game = this.game;
    const target = game.pointer && game.started && !game.dex.open ? pick(game, this.assets, game.pointer[0], game.pointer[1]) : null;
    game.hover = target ? target.id : null;
  }

  /// 월드 좌표의 생물(없으면 null)이다.
  actorAt(x: number, y: number) {
    return pick(this.game, this.assets, x, y);
  }

  pointerAt(clientX: number, clientY: number): [number, number] {
    const rect = canvas.getBoundingClientRect();
    return screenToWorld(this.game, this.viewport, [clientX - rect.left, clientY - rect.top]);
  }

  get ratio(): number {
    return this.pixelRatio;
  }
}

/// 소리 켜기/끄기 같은 짧은 알림을 오른쪽 위에 잠깐 띄운다.
function toast(stage: HTMLElement, text: string): void {
  let note = document.getElementById("toast");
  if (!note) {
    note = document.createElement("div");
    note.id = "toast";
    stage.appendChild(note);
  }
  note.textContent = text;
  note.classList.add("show");
  window.clearTimeout(Number(note.dataset.timer ?? 0));
  note.dataset.timer = String(window.setTimeout(() => note.classList.remove("show"), 1400));
}

/// 길게 누르면 교감(마우스 오른쪽)으로 보는 시간(ms)이다.
const LONG_PRESS = 450;
/// 이만큼(px) 넘게 움직이면 탭·길게 누르기가 아니라 끌기(기포 터뜨리기·둘러보기)다.
const DRAG_SLOP = 12;

/// 터치 화면용 메뉴: 오른쪽 위 작은 버튼을 누르면 키보드 기능(도감·손전등·소리·배경·사건·전체 화면)을 고른다.
function touchMenu(stage: HTMLElement, items: [string, () => string, () => void][]): { show: (visible: boolean) => void } {
  const button = document.createElement("button");
  button.id = "menu-button";
  button.type = "button";
  button.setAttribute("aria-label", "메뉴");
  button.textContent = "☰";
  const panel = document.createElement("div");
  panel.id = "menu";
  panel.hidden = true;
  const close = () => (panel.hidden = true);
  const fill = () => {
    panel.replaceChildren(
      ...items.map(([id, label, run]) => {
        const entry = document.createElement("button");
        entry.type = "button";
        entry.dataset.action = id;
        entry.textContent = label();
        entry.addEventListener("click", () => {
          run();
          close();
        });
        return entry;
      }),
    );
  };
  button.addEventListener("click", () => {
    fill();
    panel.hidden = !panel.hidden;
  });
  // 메뉴를 누른 것이 물속 탭(먹이 주기)으로 새지 않게 한다.
  for (const element of [button, panel]) {
    for (const kind of ["pointerdown", "pointerup", "mousedown", "contextmenu"]) element.addEventListener(kind, (event) => event.stopPropagation());
  }
  stage.append(button, panel);
  return {
    show(visible: boolean) {
      button.hidden = !visible;
      if (!visible) close();
    },
  };
}

/// 창 모드: 약 60fps로 한 걸음씩 진행하고 그린다.
function runLive(app: App): void {
  const game = app.game;
  game.dex = Dex.load(true);
  const stage = document.getElementById("stage") as HTMLDivElement;
  const sound = new Sound();
  window.__aquaSound = sound;
  // 스모크 테스트가 창 모드 조작 결과를 읽는 훅이다.
  window.__aquaLive = () => ({
    started: game.started,
    dex: game.dex.open,
    page: game.dex.page,
    flashlight: game.flashlight,
    food: game.particles.filter((particle) => ["Food", "Cookie", "Leaf", "Pellet", "Glimmer"].includes(particle.kind)).length,
    ripples: game.ripples().length,
    hover: game.hover === null ? null : displayName(game, game.actors.find((actor) => actor.id === game.hover)!),
    touch: game.look.touch,
    pointer: game.pointer,
  });
  // 터치 화면이면 타이틀·도감 안내를 탭 조작으로 바꾸고 메뉴 버튼을 띄운다.
  game.look.touch = window.matchMedia("(pointer: coarse)").matches;
  // 브라우저는 사용자 입력이 있어야 소리를 낼 수 있다(모바일은 터치를 뗄 때).
  for (const kind of ["pointerup", "touchend"]) window.addEventListener(kind, () => sound.unlock());

  // 키보드와 터치 메뉴가 같은 동작을 부른다.
  const toggleSound = () => toast(stage, sound.toggle() ? "소리 켬" : "소리 끔");
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.();
  };
  const toggleDex = () => {
    game.dex.open = !game.dex.open;
  };
  const toggleFlashlight = () => {
    game.flashlight = !game.flashlight;
  };
  const nextScene = () => {
    // 배경 컨셉을 차례로 바꾸고 소품 배치도 새로 흩는다.
    const scenes = availableScenes();
    const next = scenes[(scenes.indexOf(app.sceneId) + 1) % scenes.length];
    void app.switchScene(next, randomSeed());
  };
  const menu = touchMenu(stage, [
    ["dex", () => "도감", toggleDex],
    ["flashlight", () => (game.flashlight ? "손전등 끄기" : "손전등 켜기"), toggleFlashlight],
    ["sound", () => (sound.enabled ? "소리 끄기" : "소리 켜기"), toggleSound],
    ["scene", () => "배경 바꾸기", nextScene],
    ["event", () => "사건 일으키기", () => game.triggerRandomEvent()],
    // 아이폰 사파리는 전체 화면 API가 없다(홈 화면에 추가하면 전체 화면으로 열린다).
    ...(document.fullscreenEnabled ? [["fullscreen", () => (document.fullscreenElement ? "전체 화면 끝내기" : "전체 화면"), toggleFullscreen] as [string, () => string, () => void]] : []),
  ]);

  let last = performance.now();
  const loop = (now: number) => {
    requestAnimationFrame(loop);
    // 약 60fps(16ms 간격)로만 다시 그린다.
    if (now - last < 15.5) return;
    // 후처리가 월드 픽셀로 다시 모으므로 기기 픽셀 비율은 2까지만 쓴다(휴대폰 3배 화면에서 그리기 비용을 줄인다).
    app.syncSize(null, Math.min(2, window.devicePixelRatio || 1));
    const dt = (now - last) / 1000;
    game.step(dt);
    sound.update(game, Math.min(dt, 0.25));
    last = now;
    app.updateHover();
    stage.style.cursor = game.hover !== null ? "pointer" : "";
    menu.show(game.look.touch && game.started);
    app.draw();
  };
  requestAnimationFrame(loop);

  window.addEventListener("keydown", (event) => {
    if (event.repeat) return;
    const code = event.code;
    if (code === "Tab" || code === "F11" || code.startsWith("Arrow")) event.preventDefault();
    if (code !== "KeyM") sound.unlock();
    if (code === "KeyM") {
      toggleSound();
    } else if (code === "KeyF" || code === "F11") {
      toggleFullscreen();
    } else if (code === "KeyP") {
      game.look.palette = !game.look.palette;
    } else if (code === "KeyC") {
      game.look.crt = !game.look.crt;
    } else if (code === "KeyI") {
      game.look.integer = !game.look.integer;
    } else if (code === "Tab") {
      toggleDex();
    } else if (code === "ArrowRight" && game.dex.open) {
      game.dex.page += 1;
    } else if (code === "ArrowLeft" && game.dex.open) {
      game.dex.page = Math.max(0, game.dex.page - 1);
    } else if (code === "KeyL") {
      toggleFlashlight();
    } else if (code === "KeyE" && game.started) {
      game.triggerRandomEvent();
    } else if (code === "KeyB") {
      nextScene();
    } else if (!game.started) {
      game.started = true;
    }
    // Esc: 웹에서는 창을 닫지 않는다.
  });

  // 왼쪽(탭): 생물을 누르면 그 종이 좋아하는 먹이, 빈 곳이면 기본 가루 먹이.
  // 오른쪽(길게 누르기): 생물을 누르면 교감, 빈 곳이면 유리 두드리기(화면 일렁임).
  const act = (button: 0 | 2) => {
    if (!game.pointer) return;
    const [x, y] = game.pointer;
    const target = app.actorAt(x, y);
    if (button === 0) {
      if (target) game.feedActor(target);
      else game.feed(x, y);
      sound.feed(x);
    } else {
      if (target) game.react(target);
      else {
        game.tap(x, y);
        sound.tap(x);
      }
    }
  };
  // 터치 한 번의 상태: 누른 자리, 길게 누르기 타이머, 길게 눌렀는지, 끌었는지.
  let press: { id: number; x: number; y: number; timer: number; long: boolean; moved: boolean } | null = null;
  let forget = 0;
  const release = () => {
    if (press) window.clearTimeout(press.timer);
    press = null;
  };
  stage.addEventListener("pointermove", (event) => {
    game.pointer = app.pointerAt(event.clientX, event.clientY);
    if (press && press.id === event.pointerId && Math.hypot(event.clientX - press.x, event.clientY - press.y) > DRAG_SLOP) {
      window.clearTimeout(press.timer);
      press.moved = true;
    }
  });
  stage.addEventListener("pointerleave", (event) => {
    if (event.pointerType === "mouse") game.pointer = null;
  });
  stage.addEventListener("contextmenu", (event) => event.preventDefault());
  stage.addEventListener("pointerdown", (event) => {
    // 터치의 뒤따르는 호환 마우스 이벤트와 글자 선택·확대를 막는다.
    event.preventDefault();
    sound.unlock();
    if (event.pointerType !== "mouse") game.look.touch = true;
    window.clearTimeout(forget);
    game.pointer = app.pointerAt(event.clientX, event.clientY);
    if (!game.started) {
      game.started = true;
      return;
    }
    if (game.dex.open) {
      // 도감: 화면 양옆 3분의 1을 누르면 쪽을 넘기고, 가운데를 누르면 닫는다(마우스 클릭도 같다).
      const third = event.clientX / Math.max(1, stage.clientWidth);
      if (third < 1 / 3) game.dex.page = Math.max(0, game.dex.page - 1);
      else if (third > 2 / 3) game.dex.page += 1;
      else game.dex.open = false;
      return;
    }
    if (event.pointerType === "mouse") {
      if (event.button === 0) act(0);
      else if (event.button === 2) act(2);
      return;
    }
    release();
    const id = event.pointerId;
    press = {
      id,
      x: event.clientX,
      y: event.clientY,
      long: false,
      moved: false,
      timer: window.setTimeout(() => {
        if (press && press.id === id && !press.moved) {
          press.long = true;
          act(2);
          navigator.vibrate?.(12);
        }
      }, LONG_PRESS),
    };
  });
  const lift = (event: PointerEvent, cancelled: boolean) => {
    if (!press || press.id !== event.pointerId) return;
    if (!cancelled && !press.long && !press.moved) act(0);
    release();
    // 탭한 생물의 테두리와 이름을 잠깐 보여 준 뒤 지운다.
    forget = window.setTimeout(() => {
      game.pointer = null;
    }, 1600);
  };
  stage.addEventListener("pointerup", (event) => lift(event, false));
  stage.addEventListener("pointercancel", (event) => lift(event, true));
}

/// 캡처 확인용으로 종 하나를 포인터 자리에 오른쪽을 보게 부르고 id를 돌려준다.
function castAtPointer(game: Aquarium, id: string): number | null {
  const index = game.indexOf(id);
  if (index === null || !game.pointer) return null;
  const [px, py] = game.pointer;
  if (game.species[index].group === "school") {
    // 무리 종은 포인터 둘레에 무리째 부르고 가운데에 가장 가까운 물고기를 고른다.
    game.spawnSchool(index, false);
    const school = game.schools[game.schools.length - 1];
    const members = game.actors.filter((actor) => actor.school === school.id);
    const cx = members.reduce((sum, actor) => sum + actor.x, 0) / members.length;
    const cy = members.reduce((sum, actor) => sum + actor.y, 0) / members.length;
    school.x = px;
    school.y = py;
    for (const actor of members) {
      actor.x += px - cx;
      actor.y += py - cy;
      actor.facing = 1;
      actor.vx = 20;
    }
    members.sort((a, b) => Math.hypot(a.x - px, a.y - py) - Math.hypot(b.x - px, b.y - py));
    return members[0].id;
  }
  const actor = game.actors[game.spawn(index, false)];
  const species = game.species[index];
  const grounded = ["crawl", "creep", "sessile"].includes(species.motion);
  actor.x = px;
  actor.y = grounded ? 255 + 2 - species.frameH * 0.5 : py;
  actor.targetY = actor.y;
  actor.facing = 1;
  // 확인용으로 먼 층(depth=0)에 부를 수 있다.
  actor.depth = params.get("depth") === "0" ? 0 : 1;
  actor.age = 1.5;
  actor.emerging = false;
  actor.lifespan = 120;
  actor.pause = 30;
  // 확인용으로 희귀 색 변이·단골 개체를 강제할 수 있다.
  const variant = params.get("variant");
  if (variant !== null) actor.variant = Number(variant) as 0 | 1 | 2 | 3;
  const individual = params.get("individual");
  if (individual !== null) actor.individual = Number(individual);
  return actor.id;
}

/// 캡처 결과 보고(`window.__aquaReport`) 필드다.
function report(game: Aquarium, image: string): unknown {
  const active = game.actors.map((actor) => game.species[actor.species].id);
  return {
    seconds: game.time,
    started: game.started,
    daylight: game.daylight(),
    active_count: active.length,
    active_species: active,
    active_creatures: game.actors.map((actor) => {
      const species = game.species[actor.species];
      return {
        id: species.id,
        name: species.nameEn,
        name_ko: species.nameKo,
        motion: species.motion,
        x: actor.x,
        y: actor.y,
        facing: actor.facing,
        depth: actor.depth,
        school: actor.school !== null,
        puffed: actor.puffed > 0,
        mood: actor.mood ? actor.mood.kind : null,
        burrow: actor.burrow > 0,
        variant: actor.variant,
        individual: actor.individual,
      };
    }),
    school_count: game.actors.filter((actor) => actor.school !== null).length,
    night: game.nightStrength(),
    storm: game.weather.strength,
    flash: game.weather.flash,
    whale: game.farThings.some((thing) => thing.kind === "Whale"),
    food_count: game.particles.filter((particle) => ["Food", "Cookie", "Leaf", "Pellet", "Glimmer"].includes(particle.kind)).length,
    treats: game.particles.filter((particle) => particle.owner !== 0).map((particle) => particle.kind),
    hearts: game.particles.filter((particle) => particle.kind === "Heart" || particle.kind === "Love").length,
    hover: game.hover === null ? null : (() => {
      const actor = game.actors.find((entry) => entry.id === game.hover);
      return actor ? displayName(game, actor) : null;
    })(),
    hour: game.hour(),
    prints: game.particles.filter((particle) => particle.kind === "Print").length,
    popped: game.popped.size,
    glowing_count: game.actors.filter((actor) => game.species[actor.species].glow).length,
    catalog_count: game.species.filter((entry) => !entry.visitor).length,
    event: game.director.active ? eventId(game.director.active.kind) : null,
    banner: game.director.banner ? game.director.banner.text : null,
    // 지금 사건의 출연진(화면에 남아 있는 개체만)과 무대 장치 상태다.
    cast: (game.director.active?.cast ?? []).flatMap((id) => {
      const actor = game.actors.find((entry) => entry.id === id);
      return actor ? [{ id: game.species[actor.species].id, x: actor.x, y: actor.y, mood: actor.mood ? actor.mood.kind : null }] : [];
    }),
    setpiece: (() => {
      const set = game.setpiece;
      return {
        beam: set.beam !== null, toy: set.toy !== null, pearls: set.pearls, trinkets: set.trinkets.length, burrow: set.burrow !== null,
        sunflecks: set.sunflecks, wreck_glow: set.wreckGlow, runes: set.runeStrength, aurora: set.aurora, floaters: set.floaters.length,
        nest: set.nest !== null, shell: set.shell !== null, planted: set.planted.length,
      };
    })(),
    debris: game.debris.length,
    hook: game.hook !== null,
    far: game.farThings.map((thing) => thing.kind),
    current: game.current,
    dex_seen: game.dex.seenCount(),
    image,
  };
}

/// headless 캡처: 정해진 순간에 먹이·두드림·사건을 넣고 30Hz로 진행한 뒤 한 frame을 그린다.
async function runCapture(app: App): Promise<void> {
  const game = app.game;
  const seconds = numberParam("seconds", 0);
  const size = pairParam("size", "x") ?? [SCREEN_WIDTH, SCREEN_HEIGHT];
  type Moment = "feed" | "tap" | "cast" | "react" | "treat" | EventKind;
  const moments: [number, Moment][] = [];
  const at = (name: string, moment: Moment) => {
    const value = params.get(name);
    if (value !== null && Number(value) < seconds) moments.push([Number(value), moment]);
  };
  at("feedAt", "feed");
  at("tapAt", "tap");
  // 교감 확인용: castAt에 `cast` 종을 포인터 자리에 부르고, reactAt에 교감, treatAt에 그 생물 먹이를 준다.
  at("castAt", "cast");
  at("reactAt", "react");
  at("treatAt", "treat");
  const eventParam = params.get("event");
  if (eventParam) {
    const kind = eventFromId(eventParam);
    if (!kind) throw new Error(`unknown event: ${eventParam}`);
    moments.push([Math.min(numberParam("eventAt", 0), seconds), kind]);
  }
  moments.sort((a, b) => a[0] - b[0]);
  let castId: number | null = null;
  const target = () => {
    const cast = game.actors.find((actor) => actor.id === castId);
    return cast ?? (game.pointer ? app.actorAt(game.pointer[0], game.pointer[1]) : null);
  };
  for (const [when, moment] of moments) {
    game.advanceTo(when);
    if (moment === "feed") {
      if (game.pointer) game.feed(game.pointer[0], game.pointer[1]);
    } else if (moment === "tap") {
      if (game.pointer) game.tap(game.pointer[0], game.pointer[1]);
    } else if (moment === "cast") {
      castId = castAtPointer(game, params.get("cast") ?? "");
    } else if (moment === "react") {
      const actor = target();
      if (actor) game.react(actor);
    } else if (moment === "treat") {
      const actor = target();
      if (actor) game.feedActor(actor);
    } else {
      game.triggerEvent(moment);
    }
  }
  game.advanceTo(seconds);
  document.body.style.width = `${size[0]}px`;
  document.body.style.height = `${size[1]}px`;
  const stage = document.getElementById("stage") as HTMLDivElement;
  stage.style.width = `${size[0]}px`;
  stage.style.height = `${size[1]}px`;
  stage.style.right = "auto";
  stage.style.bottom = "auto";
  app.syncSize(size, 1);
  // 발광 검사처럼 포인터 자리에 부른 생물을 테두리 없이 봐야 할 때는 hover=0으로 끈다.
  if (params.get("hover") !== "0") app.updateHover();
  app.draw();
  window.__aquaReport = { ...(report(game, params.get("image") ?? "") as object), scene: app.sceneId, clams: app.clams() };
  window.__aquaEnter = async () => {
    game.started = true;
    app.draw();
  };
}

/// 32비트 무작위 시드다.
function randomSeed(): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0] || 1;
}

async function main(): Promise<void> {
  const capture = params.has("capture");
  // 창 모드는 실행할 때마다 시드·배경 컨셉·소품 배치가 달라진다. 캡처는 같은 결과가 나오게 고정한다(`seed`, `scene`, `layout`).
  const seed = params.has("seed") ? numberParam("seed", 7) : capture ? 7 : randomSeed();
  const sceneId = pickScene(params.get("scene") ?? (capture ? "reef" : null), Math.random);
  const layoutSeed = params.has("layout") ? numberParam("layout", 1) : capture ? seed : randomSeed();
  // 처음 생물·플랑크톤 자리도 보이는 범위를 따르도록 게임을 만들기 전에 창 크기로 정한다.
  const firstSize: [number, number] = capture ? (pairParam("size", "x") ?? [SCREEN_WIDTH, SCREEN_HEIGHT]) : [Math.max(1, window.innerWidth), Math.max(1, window.innerHeight)];
  setVisibleRange(...visibleRange(firstSize, capture && params.get("integer") === "1"));
  const game = new Aquarium(loadAll(), seed, capture ? params.get("started") === "1" : false);
  if (capture) {
    game.flashlight = params.get("flashlight") === "1";
    game.dex.open = params.get("dex") === "1";
    game.look.integer = params.get("integer") === "1";
    game.pointer = pairParam("pointer", ",");
  }
  const [assets] = await Promise.all([loadSceneAssets(game.species, sceneId, layoutSeed), loadFonts()]);
  const app = new App(game, assets);
  if (capture) {
    await runCapture(app);
  } else {
    runLive(app);
    // 배포 빌드에서만 서비스 워커를 등록해 설치(PWA)와 오프라인 실행을 돕는다. 캡처는 캐시 없이 돌린다.
    if (import.meta.env.PROD && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("./sw.js").catch((error: unknown) => console.warn("service worker:", error));
    }
  }
  window.__aquaReady = true;
}

main().catch((error: unknown) => {
  window.__aquaError = String(error instanceof Error ? error.stack ?? error.message : error);
  console.error(error);
});
