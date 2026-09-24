// 종마다 다른 생활 규칙: 활동 시간, 좋아하는 먹이, 교감(오른쪽 클릭) 반응, 밤 발광 세기.
// 기본값은 이벤트 그룹과 표의 활동 시간(day/night/any)에서 오고, 실제 습성이 뚜렷한 종은 따로 적는다.

import type { Species } from "./catalog";
import { DAY_CYCLE_SECONDS } from "./constants";

/** 입자로 떨어지는 먹이 종류다. 모두 과자·해초·알갱이 같은 귀여운 먹이다. */
export type FoodKind = "Food" | "Cookie" | "Leaf" | "Pellet" | "Glimmer";

export const FOOD_KINDS: readonly FoodKind[] = ["Food", "Cookie", "Leaf", "Pellet", "Glimmer"];

/** 먹이 종류의 한글 이름이다. */
export const FOOD_NAMES: Record<FoodKind, string> = {
  Food: "가루 먹이",
  Cookie: "물고기 과자",
  Leaf: "해초 잎",
  Pellet: "가라앉는 알갱이",
  Glimmer: "반짝 플랑크톤",
};

/**
 * 교감 반응이다. 생물을 사라지게 하거나 해치는 반응은 없다.
 * - puff: 복어처럼 크게 부푼다
 * - claws: 집게를 번쩍 들고 깡충 뛴다(자세 그림이 있으면 바꿔 그린다)
 * - snap: 딱총새우가 집게를 튕겨 작은 충격파와 섬광을 낸다
 * - prism: 몸이 무지갯빛으로 반짝인다
 * - dance: 몸을 흔들며 춤추고 음표가 난다
 * - shift: 몸빛이 물결처럼 바뀐다(갑오징어·오징어)
 * - ink: 먹물로 하트를 그린다
 * - glow: 발광이 크게 번지고 빛 고리가 퍼진다
 * - roll: 한 바퀴 구르며 거품 꼬리를 남긴다
 * - loop: 가오리가 공중제비를 돈다
 * - leap: 수면까지 솟구쳐 물보라를 내고 돌아온다
 * - belly: 배를 드러내고 뒤집혀 둥둥 뜬다
 * - song: 노래 고리와 음표가 퍼진다
 * - dash: 반짝이며 앞으로 쏜살같이 나아간다(방향은 그대로)
 * - follow: 포인터로 헤엄쳐 와 비빈다
 * - clean: 포인터 둘레를 돌며 청소해 준다
 * - heart: 무리가 하트 모양으로 모인다
 * - hide: 주변 색으로 숨었다가 "짜잔" 하고 나타난다
 * - retract: 쏙 들어갔다가 꽃처럼 다시 핀다
 * - pearl: 조개가 활짝 열려 진주를 보여 준다
 * - clap: 가리비가 껍데기를 여닫으며 폴짝 뛴다
 * - spin: 바닥에서 천천히 한 바퀴 돈다
 * - bristle: 가시를 곤두세운다
 * - wave: 반갑게 깡충 뛰고 하트를 낸다(기본)
 * - nod: 고개를 들어 거품을 뿜고 인사한다
 * - bloom: 해파리 갓이 빠르게 뛰며 파스텔빛으로 떠오른다
 * - sway: 살랑살랑 흔들리며 수줍어한다
 * - sneeze: 바다이구아나가 소금 재채기를 한다
 * - flip: 몸을 위아래로 뒤집었다 돌아온다
 * - curl: 공처럼 몸을 말아 구른다
 * - squish: 몸을 말랑하게 늘였다 줄인다
 * - fan: 지느러미를 활짝 편다
 * - kiss: 빨간 입술로 하트를 날린다
 * - bob: 통통 튀어 오른다
 * - bubble: 거품 고리를 뿜는다
 * - zap: 약한 전기 불꽃이 파직인다
 * - photo: 잠수부가 사진을 찍어 준다
 */
export type Reaction =
  | "puff"
  | "claws"
  | "snap"
  | "prism"
  | "dance"
  | "shift"
  | "ink"
  | "glow"
  | "roll"
  | "loop"
  | "leap"
  | "belly"
  | "song"
  | "dash"
  | "follow"
  | "clean"
  | "heart"
  | "hide"
  | "retract"
  | "pearl"
  | "clap"
  | "spin"
  | "bristle"
  | "wave"
  | "nod"
  | "bloom"
  | "sway"
  | "sneeze"
  | "flip"
  | "curl"
  | "squish"
  | "fan"
  | "kiss"
  | "bob"
  | "bubble"
  | "zap"
  | "photo"
  /** 사용자 교감이 아니라 새벽에 잠드는 두족류의 꿈이다. */
  | "dream";

/** 하루 안의 활동 구간(시, 0..24)이다. start > end면 자정을 넘긴다. [0, 24]는 종일이다. */
export type Hours = [number, number];

export interface Traits {
  hours: Hours;
  diet: FoodKind;
  reaction: Reaction;
  /** 0: 발광 없음, 1: 발광, 2: 밤에 둥근 빛 고리를 두를 만큼 강한 발광. */
  glow: 0 | 1 | 2;
}

const ALL_DAY: Hours = [0, 24];
const DAYTIME: Hours = [6, 19];
const NIGHTTIME: Hours = [19, 5];

/** 표에 적힌 활동 시간대(day/night/any)의 기본 구간이다. */
function defaultHours(activity: string): Hours {
  return activity === "day" ? DAYTIME : activity === "night" ? NIGHTTIME : ALL_DAY;
}

/** 실제 습성에 맞춘 종별 활동 시간이다. */
const HOURS: Record<string, Hours> = {
  // 짝짓기 춤을 추러 해 질 녘에만 나온다.
  mandarinfish: [16, 21],
  "pajama-cardinalfish": [18, 6],
  "elephant-fish": [18, 6],
  clownfish: [5, 21],
  "tomato-clownfish": [5, 21],
  "maroon-clownfish": [5, 21],
  "black-clownfish": [5, 21],
  "pink-skunk-clownfish": [5, 21],
  // 밤에는 점액 주머니를 만들어 잔다.
  "bumphead-parrotfish": [6, 18],
  "humphead-wrasse": [6, 19],
  swordfish: [17, 7],
  "whitetip-reef-shark": [17, 8],
  "tiger-shark": [16, 9],
  "nurse-shark": [18, 7],
  "sand-tiger-shark": [18, 7],
  "zebra-shark": [18, 7],
  "epaulette-shark": [17, 7],
  "spotted-wobbegong": [18, 6],
  "horn-shark": [18, 6],
  "swell-shark": [18, 6],
  "spinner-dolphin": ALL_DAY,
  "harbor-porpoise": ALL_DAY,
  dolphin: [5, 21],
  "pacific-white-sided-dolphin": [5, 21],
  "sea-otter": [6, 19],
  "california-sea-lion": [5, 21],
  "steller-sea-lion": [5, 21],
  // 햇볕으로 몸을 데워야 움직인다.
  "marine-iguana": [9, 16],
  "electric-ray": [19, 6],
  sawfish: [17, 8],
  "shovelnose-guitarfish": [18, 7],
  // 몸속 조류가 햇빛을 받아야 해서 낮에만 뒤집혀 있다.
  "upside-down-jelly": [7, 17],
  "box-jellyfish": [6, 18],
  "atlantic-herring": [18, 6],
  "spanish-dancer-nudibranch": [19, 5],
  "zebra-moray-eel": [18, 7],
  "snowflake-moray-eel": [18, 7],
  "wolf-eel": [18, 7],
  "ribbon-eel": ALL_DAY,
  // 해가 지면 모래 구멍으로 쏙 들어간다.
  "garden-eel": [6, 18],
  octopus: [18, 6],
  "california-two-spot-octopus": [18, 6],
  "blue-ringed-octopus": [18, 6],
  "flamboyant-cuttlefish": [7, 18],
  "reef-squid": [18, 6],
  "coconut-crab": [19, 5],
  "horseshoe-crab": [18, 6],
  "spiny-lobster": [19, 5],
  "mantis-shrimp": [6, 18],
  "decorator-crab": [18, 6],
  "arrow-crab": [18, 6],
  lionfish: [17, 8],
  "spotfin-lionfish": [18, 6],
  "stargazer-fish": [19, 6],
  scorpionfish: [18, 6],
  "sea-toadfish": [19, 6],
  "flathead-fish": [18, 6],
  "peacock-flounder": [6, 18],
  "dover-sole": [19, 6],
  "greenland-shark": [20, 4],
  "striped-bass": [17, 8],
  // 바다나리·거미불가사리·바다조름은 밤에 팔을 편다.
  "feather-star": [18, 6],
  "brittle-star": [19, 6],
  "sea-pen": [18, 6],
  "purple-sea-urchin": [18, 6],
  abalone: [19, 5],
  "sea-cucumber": [18, 6],
};

/** 그룹별 좋아하는 먹이다. */
const GROUP_DIET: Record<string, FoodKind> = {
  reef: "Food",
  clown: "Food",
  bigreef: "Cookie",
  pelagic: "Cookie",
  shark: "Cookie",
  bottomshark: "Pellet",
  dolphin: "Cookie",
  turtle: "Leaf",
  pinniped: "Cookie",
  ray: "Pellet",
  jelly: "Glimmer",
  school: "Food",
  seahorse: "Glimmer",
  nudi: "Leaf",
  eel: "Cookie",
  ceph: "Cookie",
  crust: "Pellet",
  camo: "Cookie",
  deep: "Glimmer",
  cold: "Cookie",
  puffer: "Food",
  sessile: "Glimmer",
  whale: "Glimmer",
};

const DIET: Record<string, FoodKind> = {
  "blue-tang": "Leaf",
  "yellow-tang": "Leaf",
  "powder-blue-tang": "Leaf",
  "achilles-tang": "Leaf",
  "sailfin-tang": "Leaf",
  "orange-shoulder-tang": "Leaf",
  "zebra-surgeonfish": "Leaf",
  "foxface-rabbitfish": "Leaf",
  "spotted-rabbitfish": "Leaf",
  mandarinfish: "Glimmer",
  "bumphead-parrotfish": "Leaf",
  "flying-fish": "Glimmer",
  "leatherback-sea-turtle": "Glimmer",
  "loggerhead-sea-turtle": "Pellet",
  "olive-ridley-sea-turtle": "Pellet",
  "sea-otter": "Pellet",
  walrus: "Pellet",
  dugong: "Leaf",
  "west-indian-manatee": "Leaf",
  "marine-iguana": "Leaf",
  "manta-ray": "Glimmer",
  "reef-manta-ray": "Glimmer",
  "firefly-squid": "Glimmer",
  "silver-hatchetfish": "Glimmer",
  lanternfish: "Glimmer",
  "blue-dragon-sea-slug": "Glimmer",
  "garden-eel": "Glimmer",
  octopus: "Pellet",
  "california-two-spot-octopus": "Pellet",
  "blue-ringed-octopus": "Pellet",
  "blanket-octopus": "Pellet",
  "red-lipped-batfish": "Pellet",
  "flying-gurnard": "Pellet",
  seamoth: "Pellet",
  "sea-toadfish": "Pellet",
  "atlantic-halibut": "Pellet",
  "peacock-flounder": "Pellet",
  "dover-sole": "Pellet",
  turbot: "Pellet",
  "greenland-shark": "Cookie",
  "tripod-fish": "Pellet",
  "giant-isopod": "Pellet",
  "pacific-hagfish": "Pellet",
  "chambered-nautilus": "Pellet",
  "pacific-spiny-lumpsucker": "Glimmer",
  "purple-sea-urchin": "Leaf",
  abalone: "Leaf",
  "red-sea-star": "Pellet",
  "sunflower-sea-star": "Pellet",
  "sea-cucumber": "Pellet",
  "whale-shark": "Glimmer",
  sunfish: "Glimmer",
  "baby-turtle": "Leaf",
  oarfish: "Glimmer",
  orca: "Cookie",
  "sperm-whale": "Cookie",
};

/** 그룹별 교감 반응이다. */
const GROUP_REACTION: Record<string, Reaction> = {
  reef: "follow",
  clown: "follow",
  bigreef: "wave",
  pelagic: "dash",
  shark: "dash",
  bottomshark: "wave",
  dolphin: "leap",
  turtle: "nod",
  pinniped: "roll",
  ray: "loop",
  jelly: "bloom",
  school: "heart",
  seahorse: "sway",
  nudi: "prism",
  eel: "dance",
  ceph: "ink",
  crust: "claws",
  camo: "hide",
  deep: "wave",
  cold: "wave",
  puffer: "bob",
  sessile: "retract",
  whale: "song",
};

const REACTION: Record<string, Reaction> = {
  "cleaner-wrasse": "clean",
  "neon-goby": "clean",
  mandarinfish: "dance",
  "purple-firefish": "hide",
  "red-firefish": "hide",
  "yellow-watchman-goby": "hide",
  "elephant-fish": "zap",
  "giant-sea-bass": "bubble",
  "coral-grouper": "bubble",
  "flying-fish": "leap",
  "mahi-mahi": "shift",
  "spotted-wobbegong": "hide",
  "swell-shark": "puff",
  "nurse-shark": "bubble",
  "sea-otter": "belly",
  walrus: "bubble",
  "west-indian-manatee": "bubble",
  dugong: "nod",
  "marine-iguana": "sneeze",
  "electric-ray": "zap",
  "southern-stingray": "hide",
  "upside-down-jelly": "flip",
  "rainbow-comb-jelly": "prism",
  "pygmy-seahorse": "hide",
  "spanish-dancer-nudibranch": "dance",
  "blue-dragon-sea-slug": "flip",
  "california-sea-hare": "ink",
  "garden-eel": "retract",
  "wolf-eel": "wave",
  "conger-eel": "wave",
  "blue-ringed-octopus": "glow",
  "common-cuttlefish": "shift",
  "flamboyant-cuttlefish": "shift",
  "reef-squid": "shift",
  "horseshoe-crab": "flip",
  "spiny-lobster": "wave",
  "mantis-shrimp": "prism",
  "cleaner-shrimp": "wave",
  "pistol-shrimp": "snap",
  lionfish: "fan",
  "spotfin-lionfish": "fan",
  "flying-gurnard": "fan",
  seamoth: "fan",
  "red-lipped-batfish": "kiss",
  "sea-toadfish": "song",
  "greenland-shark": "bubble",
  "dumbo-octopus": "bob",
  "chambered-nautilus": "bob",
  "gulper-eel": "puff",
  "giant-isopod": "curl",
  "pacific-hagfish": "dance",
  "tripod-fish": "bob",
  "atlantic-salmon": "leap",
  "steelhead-trout": "leap",
  "striped-bass": "dash",
  "pacific-spiny-lumpsucker": "bob",
  pufferfish: "puff",
  "spiny-porcupinefish": "puff",
  "clown-triggerfish": "dance",
  "orange-spotted-filefish": "shift",
  "giant-clam": "pearl",
  scallop: "clap",
  abalone: "prism",
  "red-sea-star": "spin",
  "sunflower-sea-star": "spin",
  "brittle-star": "spin",
  "sand-dollar": "spin",
  "purple-sea-urchin": "bristle",
  "sea-cucumber": "squish",
  "whale-shark": "wave",
  sunfish: "belly",
  "baby-turtle": "nod",
  oarfish: "dance",
  diver: "photo",
};

/** 밤에 둥근 빛 고리를 두르는 강한 발광 종이다. */
const STRONG_GLOW = new Set([
  "anglerfish",
  "flashlight-fish",
  "firefly-squid",
  "atolla-jelly",
  "black-dragonfish",
  "viperfish",
  "vampire-squid",
  "siphonophore",
  "rainbow-comb-jelly",
  "flower-hat-jelly",
  "glass-squid",
  "blue-ringed-octopus",
]);

/** 한 종의 생활 규칙이다. */
export function traitsOf(species: Species): Traits {
  const glow: 0 | 1 | 2 = !species.glow ? 0 : STRONG_GLOW.has(species.id) ? 2 : 1;
  let reaction = REACTION[species.id] ?? GROUP_REACTION[species.group] ?? "wave";
  // 빛나는 생물은 발광을 크게 번뜩이는 교감이 가장 잘 어울린다.
  if (glow > 0 && REACTION[species.id] === undefined) reaction = "glow";
  return {
    hours: HOURS[species.id] ?? defaultHours(species.activity),
    diet: DIET[species.id] ?? GROUP_DIET[species.group] ?? "Food",
    reaction,
    glow,
  };
}

/** 모든 종의 규칙을 한 번에 만든다(종 번호로 찾는다). */
export function traitTable(species: Species[]): Traits[] {
  return species.map(traitsOf);
}

/** 게임 시간(초)의 시각(0..24시)이다. 0초가 정오이고 하루는 DAY_CYCLE_SECONDS초다. */
export function hourOf(time: number): number {
  const hour = (12 + (24 * time) / DAY_CYCLE_SECONDS) % 24;
  return hour < 0 ? hour + 24 : hour;
}

/** 시각이 활동 구간 안인지 알려 준다. */
export function awakeAt(hours: Hours, hour: number): boolean {
  const [start, end] = hours;
  if (end - start >= 24 || start === end) return true;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

/** 활동 구간이 시작된 뒤 지난 시간(시)이다. 구간 밖이면 null이다. */
export function hoursSinceStart(hours: Hours, hour: number): number | null {
  if (!awakeAt(hours, hour)) return null;
  const since = hour - hours[0];
  return since < 0 ? since + 24 : since;
}

/** 햇빛에 옆구리가 번쩍이는 은빛 물고기다. 무리가 방향을 틀면 반짝임이 물결처럼 번진다. */
const SILVER = new Set([
  "sardine",
  "anchovy",
  "atlantic-herring",
  "pacific-mackerel",
  "silver-hatchetfish",
  "barracuda",
  "needlefish",
  "giant-trevally",
  "bluefish",
  "skipjack-tuna",
  "flying-fish",
  "yellowfin-tuna",
  "bluefin-tuna",
]);

export function silver(species: Species): boolean {
  return SILVER.has(species.id);
}

/** 희귀 색 변이: 0 보통, 1 황금, 2 알비노, 3 흑색이다. */
export type Variant = 0 | 1 | 2 | 3;

export const VARIANT_NAMES: Record<Exclude<Variant, 0>, string> = { 1: "황금", 2: "알비노", 3: "흑색" };

/** 방문자 단골 개체 별명이다. 몸에 그 별명다운 무늬(별 점·흉터·반달)가 있다. */
export const INDIVIDUAL_NAMES = ["별무늬", "흉터", "반달"];

/** 새벽(활동 끝)에 잠들며 몸빛이 바뀌는 두족류다. */
const DREAMERS = new Set(["octopus", "california-two-spot-octopus", "blue-ringed-octopus", "blanket-octopus", "common-cuttlefish"]);

export function dreamer(species: Species): boolean {
  return DREAMERS.has(species.id);
}
