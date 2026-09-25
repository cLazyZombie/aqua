// headless 캡처 장면 목록이다. 값은 캡처 URL 쿼리(`?capture=1&...`)로 바뀐다.

import { readFileSync } from "node:fs";

/** 발광 시트가 있는 모든 종이다. 밤 발광 전수 검사에 쓴다. */
export const GLOWERS = JSON.parse(readFileSync(new URL("../src/data/catalog.json", import.meta.url), "utf8"))
  .filter((entry) => entry.glow)
  .map((entry) => entry.id);

/** 발광 종마다 한밤에 불러 평상시(`glow-<id>`)와 교감 번뜩임 한가운데(`glow-<id>-react`)를 찍는다. */
const GLOW_SCENARIOS = GLOWERS.flatMap((id) => [
  { name: `glow-${id}`, seconds: 121, started: true, pointer: "240,125", cast: id, castAt: 120, hover: false },
  { name: `glow-${id}-react`, seconds: 122, started: true, pointer: "240,125", cast: id, castAt: 120, reactAt: 120.2, hover: false },
]);

/** 밤 사건의 빛(등불·빛나는 물결·산호 알·유성·잠수정 탐조등 등)을 한가운데서 찍는다. */
const NIGHT_EVENTS = ["angler-lantern", "ink-escape", "jelly-bloom", "giant-squid", "coral-spawn", "glow-wave", "meteor-shower", "submarine", "deep-visitors"];
const NIGHT_EVENT_SCENARIOS = NIGHT_EVENTS.map((id) => ({ name: `glow-event-${id}`, seconds: id === "glow-wave" ? 123 : 127, started: true, event: id, eventAt: 119 }));

/** 사건 2부 31종: (id, 시작 뒤 찍을 초, 밤인지, 배경 컨셉). 한가운데 모습을 찍는다. */
const EXTRA_EVENTS = [
  ["manta-campfire", 12, true], ["beluga-rings", 14], ["seahorse-birth", 19], ["cuttle-show", 10], ["flying-fish-leap", 4],
  ["dolphin-kelp", 10], ["otter-raft", 12], ["pearl-night", 8, true], ["octopus-garden", 16], ["goby-shrimp", 8],
  ["silver-migration", 10], ["sun-flecks", 8, false, "kelp"], ["urchin-march", 20, false, "kelp"], ["wreck-gold", 10, false, "wreck"],
  ["rune-glow", 16, true, "ruins"], ["aurora", 12, true, "ice"], ["ice-drop", 9, false, "ice"], ["shell-swap", 26], ["penguin-dive", 1.4, false, "ice"],
  ["clown-eggs", 18], ["fireworks", 5, true], ["duck-flotilla", 16], ["haenyeo-dive", 16], ["sumbi-chorus", 7.5], ["haenyeo-dolphins", 12],
  ["coral-planting", 13], ["turtle-buddy", 12], ["diver-rings", 13], ["mermaid-song", 12], ["mermaid-ring", 12], ["mermaid-pearl", 13],
];
export const EXTRA_EVENT_SCENARIOS = EXTRA_EVENTS.map(([id, after, night, scene]) => ({
  name: `vignette-${id}`,
  seconds: (night ? 119 : 20) + after,
  started: true,
  event: id,
  eventAt: night ? 119 : 20,
  ...(scene ? { scene } : {}),
}));

export const SCENARIOS = [
  { name: "title", seconds: 0, started: false, enter: true },
  { name: "day", seconds: 16, started: true },
  { name: "day-motion", seconds: 16.5, started: true },
  { name: "whale-dusk", seconds: 60, started: true },
  { name: "night", seconds: 125, started: true },
  { name: "dawn", seconds: 190, started: true },
  { name: "storm-flash", seconds: 256.2, started: true },
  { name: "feeding", seconds: 60, started: true, pointer: "240,140", feedAt: 59 },
  { name: "hover", seconds: 60, started: true, pointer: "240,140" },
  // 교감: cast 종을 포인터 자리에 부르고 reactAt에 오른쪽 클릭, treatAt에 왼쪽 클릭한다.
  { name: "hover-name", seconds: 20.5, started: true, pointer: "300,120", cast: "clownfish", castAt: 20 },
  { name: "react-crab", seconds: 21.4, started: true, pointer: "300,230", cast: "red-crab", castAt: 20, reactAt: 20.5 },
  { name: "react-puffer", seconds: 21.6, started: true, pointer: "300,130", cast: "pufferfish", castAt: 20, reactAt: 20.2 },
  { name: "react-clam", seconds: 21.8, started: true, pointer: "300,240", cast: "giant-clam", castAt: 20, reactAt: 20.2 },
  { name: "react-dolphin", seconds: 22, started: true, pointer: "200,150", cast: "dolphin", castAt: 20, reactAt: 20.1 },
  { name: "react-school", seconds: 23.5, started: true, pointer: "300,130", cast: "blue-green-chromis", castAt: 20, reactAt: 20.3 },
  { name: "react-cuttlefish", seconds: 21.2, started: true, pointer: "300,130", cast: "common-cuttlefish", castAt: 20, reactAt: 20.2 },
  { name: "treat-turtle", seconds: 21.4, started: true, pointer: "230,120", cast: "green-turtle", castAt: 20, treatAt: 20.1 },
  { name: "night-rings", seconds: 121, started: true, pointer: "300,130", cast: "anglerfish", castAt: 120 },
  { name: "night-jelly", seconds: 122, started: true, pointer: "200,110", cast: "atolla-jelly", castAt: 120, reactAt: 121 },
  { name: "tap-before", seconds: 20.2, started: true },
  { name: "tap-ripple", seconds: 20.2, started: true, pointer: "70,150", tapAt: 20 },
  { name: "flashlight", seconds: 124, started: true, pointer: "250,140", flashlight: true },
  { name: "dex", seconds: 60, started: true, dex: true, event: "jelly-bloom", eventAt: 20 },
  { name: "size-1280x720", seconds: 16, started: true, size: "1280x720" },
  { name: "size-1280x720-integer", seconds: 16, started: true, size: "1280x720", integer: true },
  { name: "size-1000x800", seconds: 16, started: true, size: "1000x800" },
  // 휴대폰 가로 화면(아이폰 17, 약 2.17:1): 588×270 월드가 화면을 꼭 채우고, 무대 양옆 여백까지 보인다.
  { name: "size-phone", seconds: 16, started: true, size: "1176x540" },
  { name: "size-phone-title", seconds: 0, started: false, size: "1176x540" },
  { name: "size-phone-kelp-night", seconds: 124, started: true, size: "1176x540", scene: "kelp" },
  { name: "event-chest", seconds: 32, started: true, event: "treasure-chest", eventAt: 10 },
  { name: "event-patrol", seconds: 14, started: true, event: "shark-patrol", eventAt: 12 },
  { name: "event-patrol-after", seconds: 26, started: true, event: "shark-patrol", eventAt: 12 },
  { name: "event-basket", seconds: 22, started: true, event: "treat-basket", eventAt: 10 },
  { name: "event-diver", seconds: 123, started: true, event: "diver", eventAt: 118 },
  { name: "event-jelly", seconds: 30, started: true, event: "jelly-bloom", eventAt: 10 },
  { name: "event-whale-shark", seconds: 26, started: true, event: "whale-shark", eventAt: 10 },
  { name: "event-coral-spawn", seconds: 128, started: true, event: "coral-spawn", eventAt: 120 },
  { name: "event-current", seconds: 20, started: true, event: "current", eventAt: 12 },
  { name: "event-golden-dawn", seconds: 196, started: true, event: "golden-dawn", eventAt: 188 },
  // 배경 컨셉: 낮·밤을 컨셉마다 찍는다. 배치 시드는 캡처 시드를 따른다.
  ...["reef", "kelp", "wreck", "ruins", "ice"].flatMap((scene) => [
    { name: `scene-${scene}`, seconds: 24, started: true, scene },
    { name: `scene-${scene}-night`, seconds: 124, started: true, scene },
  ]),
  { name: "scene-kelp-layout", seconds: 24, started: true, scene: "kelp", layout: 99 },
  { name: "scene-reef-clams", seconds: 28, started: true, scene: "reef" },
  // 소소한 볼거리: 은빛 반짝임, 수면 거울, 달, 해초 헤치기, 바닥 빛 웅덩이, 색 변이·단골 개체, 꿈꾸는 문어, 기포 터뜨리기.
  { name: "ambient-glint", seconds: 29.5, started: true, pointer: "260,120", cast: "sardine", castAt: 29, tapAt: 29.4, hover: false },
  { name: "ambient-mirror", seconds: 21.6, started: true, pointer: "330,150", cast: "dolphin", castAt: 20, reactAt: 20.1, hover: false },
  { name: "ambient-moon", seconds: 121, started: true },
  { name: "ambient-seaweed", seconds: 20.4, started: true, pointer: "318,205", cast: "blue-tang", castAt: 20, hover: false },
  { name: "ambient-floor-glow", seconds: 121, started: true, pointer: "240,236", cast: "atolla-jelly", castAt: 120.5, hover: false },
  { name: "ambient-golden", seconds: 20.1, started: true, pointer: "240,125", cast: "clownfish", castAt: 20, variant: 1 },
  { name: "ambient-albino", seconds: 20.1, started: true, pointer: "240,125", cast: "clownfish", castAt: 20, variant: 2 },
  { name: "ambient-melanistic", seconds: 20.1, started: true, pointer: "240,125", cast: "clownfish", castAt: 20, variant: 3 },
  { name: "ambient-regular", seconds: 20.5, started: true, pointer: "240,125", cast: "whale-shark", castAt: 20, individual: 0 },
  { name: "ambient-dream", seconds: 186, started: true, pointer: "240,200", cast: "octopus", castAt: 178, hover: false },
  { name: "ambient-pop", seconds: 30, started: true, pointer: "62,150" },
  // 먼 층 생물은 불투명하다: 켈프 숲 앞 먼 층에 상어를 불러 뒤 배경이 몸을 뚫고 보이지 않는지 본다.
  { name: "far-shark", seconds: 20.2, started: true, pointer: "120,120", cast: "leopard-shark", castAt: 20, depth: 0, scene: "kelp", hover: false },
  ...GLOW_SCENARIOS,
  ...NIGHT_EVENT_SCENARIOS,
  ...EXTRA_EVENT_SCENARIOS,
];

export function sizeOf(scenario) {
  const [w, h] = (scenario.size ?? "960x540").split("x").map(Number);
  return { width: w, height: h };
}

/// 웹 캡처 URL 쿼리다.
export function webQuery(scenario, seed = 7) {
  const q = new URLSearchParams({ capture: "1", seconds: String(scenario.seconds), seed: String(seed) });
  if (scenario.started) q.set("started", "1");
  if (scenario.pointer) q.set("pointer", scenario.pointer);
  if (scenario.feedAt !== undefined) q.set("feedAt", String(scenario.feedAt));
  if (scenario.tapAt !== undefined) q.set("tapAt", String(scenario.tapAt));
  if (scenario.event) q.set("event", scenario.event);
  if (scenario.eventAt !== undefined) q.set("eventAt", String(scenario.eventAt));
  if (scenario.size) q.set("size", scenario.size);
  if (scenario.integer) q.set("integer", "1");
  if (scenario.flashlight) q.set("flashlight", "1");
  if (scenario.dex) q.set("dex", "1");
  if (scenario.hover === false) q.set("hover", "0");
  for (const key of ["cast", "castAt", "reactAt", "treatAt", "variant", "individual", "scene", "layout", "depth"]) {
    if (scenario[key] !== undefined) q.set(key, String(scenario[key]));
  }
  return q.toString();
}

