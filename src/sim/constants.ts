// 시뮬레이션 공용 상수다.

/** 게임 월드 해상도다. 창은 이 해상도를 확대해 픽셀을 그대로 보여 준다. */
export const WIDTH = 480;
export const HEIGHT = 270;
/** 창과 UI가 쓰는 논리 해상도다. */
export const SCREEN_WIDTH = 960;
export const SCREEN_HEIGHT = 540;
/** 게와 바닥 생물이 걷는 모래 높이다. */
export const FLOOR_Y = 255;
export const SWIM_TOP = 38;
export const SWIM_BOTTOM = 218;
export const DAY_CYCLE_SECONDS = 240;
export const MAX_UNITS = 10;
/** 몸을 뒤집어 돌아서는 데 걸리는 시간이다. */
export const TURN_SECONDS = 0.3;
/** 퇴장을 시작한 뒤 화면 밖으로 못 나가도 이 시간 안에 서서히 사라진다. */
export const LINGER = 90;
/** 활동 시간이 끝난 바닥 생물이 모래 속으로 다 들어가는 데 걸리는 시간이다. */
export const BURROW_SECONDS = 2.2;
export const PLANKTON = 45;
export const TAU = Math.PI * 2;
