// 렌더러와 앱이 쓰는 시뮬레이션 표면을 한곳에서 다시 내보낸다(docs/sim-contract.md).
export { Aquarium, Actor, WIDTH, HEIGHT, FLOOR_Y, SCREEN_WIDTH, SCREEN_HEIGHT } from "../sim/aquarium";
export { faceTravel, grounded, loadAll } from "../sim/catalog";
export { moodLook, type Look } from "../sim/mood";
export { FOOD_NAMES, type FoodKind, INDIVIDUAL_NAMES, type Reaction, silver, VARIANT_NAMES } from "../sim/traits";
export { SURFACE_Y, ventBubbles } from "../sim/life";
export type { Species } from "../sim/catalog";
export { Dex } from "../sim/dex";
export { EVENT_KINDS, eventFromId, eventId } from "../sim/director";
export type { EventKind, Rarity } from "../sim/director";
