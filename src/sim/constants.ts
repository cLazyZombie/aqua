// 시뮬레이션 공용 상수다.

/** 게임 무대 해상도다. 사건 자리·가운데 비우기·자막은 이 480×270 무대(16:9)를 기준으로 한다. */
export const WIDTH = 480;
export const HEIGHT = 270;
/**
 * 화면에 보일 수 있는 월드 폭이다. 휴대폰 가로 화면(아이폰 17, 약 2.17:1)에 맞춰 무대 양옆에 여백을 둔다.
 * 창은 이 588×270을 빈틈없이 덮고, 그보다 짧은 화면(16:9 등)은 양옆 여백부터 잘린다.
 */
export const VIEW_WIDTH = 588;
/** 무대 양옆 여백 폭이다. 보이는 월드는 VIEW_LEFT..VIEW_RIGHT다. */
export const MARGIN = (VIEW_WIDTH - WIDTH) / 2;
export const VIEW_LEFT = -MARGIN;
export const VIEW_RIGHT = WIDTH + MARGIN;

/**
 * 지금 창에 보이는 월드 가로 범위다. 앱이 창 크기에서 정하고(`setVisibleRange`), 기본은 무대(0..480)다.
 * 생물 등장·퇴장·돌아서기 가장자리와 플랑크톤 순환에 쓴다. 16:9 창은 무대 그대로라 동작과 기준 기록이 바뀌지 않는다.
 */
export const visible = { left: 0, right: WIDTH };

/** 보이는 범위를 정한다. 무대보다 좁아지지 않고 여백보다 넓어지지 않는다. */
export function setVisibleRange(left: number, right: number): void {
  visible.left = Math.min(0, Math.max(VIEW_LEFT, left));
  visible.right = Math.max(WIDTH, Math.min(VIEW_RIGHT, right));
}

/** 무대 밖 좌표(등장·퇴장 자리)를 보이는 여백만큼 더 바깥으로 민다. 무대 안 좌표는 그대로다. 긴 화면 여백에서 생물이 갑자기 나타나지 않게 한다. */
export function offstage(x: number): number {
  return x < 0 ? x + visible.left : x > WIDTH ? x + (visible.right - WIDTH) : x;
}
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
