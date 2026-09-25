# Aqua 작업 계약

Three.js + TypeScript(pnpm, Vite) 픽셀 아쿠아리움이다. 옛 Rust 버전은 없앴고(백업 `../aqua-rust-backup-20260925.tar.gz`), 이 저장소의 웹 버전이 유일한 기준이다.

## 소통

- 사용자 답변, 진행 보고, 문서, 코드 주석은 한국어로 쓴다. 코드 식별자·명령어·에러 원문만 영어로 둔다.

## 명령

```bash
pnpm dev          # 개발 서버
pnpm build        # 타입 검사 + 빌드
pnpm test         # vitest(시뮬레이션·기준 기록 동일성)
pnpm assets       # art/ 원본 → public/assets 그림 + src/data 목록 JSON + 팔레트
pnpm audio        # 음원 출처에서 받아 음량 맞춰 public/assets/audio/*.mp3로 굽기(ffmpeg)
pnpm qc           # 에셋 계약 검사
pnpm e2e          # headless 캡처 후 화면·상태 검사(output/capture)
pnpm smoke        # 실제 루프·입력·창 크기 스모크
pnpm reference    # 동작을 일부러 바꾼 뒤 기준 기록 다시 만들기
```

코드를 바꾸면 `pnpm build`, `pnpm test`, `pnpm e2e`를 모두 통과시킨 뒤 끝낸다. 에셋을 바꾸면 `pnpm assets`, `pnpm qc`도 돌린다.

## 구조

- `src/sim/`: 시뮬레이션(생물·무리·사건 감독·도감). 종별 활동 시간·먹이·교감 반응은 `traits.ts`, 교감 연출은 `mood.ts`다. 난수 호출 순서나 동작을 바꾸면 `tests/fixtures/reference-seed7.json` 기준 기록이 어긋나므로, 의도한 변경이면 `pnpm reference`로 다시 만든다.
- `src/render/`: 스프라이트 일괄 렌더러, 셰이더(`shaders/*.frag`), 장면 층, 호버·마우스 판정(`interact.ts`), 소소한 볼거리(`ambient.ts`), UI 글자. 그리는 쪽 볼거리는 시간·해시로만 정하고 시뮬레이션 난수를 쓰지 않는다.
- `src/audio.ts`: 배경 음악(낮·밤 목록)과 물속 소리. 창 모드에서만 돌고 캡처에서는 만들지 않는다. 시뮬레이션 상태를 읽기만 하고 난수는 `Math.random`을 쓴다. 음원 출처·라이선스는 `public/assets/audio/CREDITS.txt`이고, CC BY 곡을 더하면 타이틀 아래 표기와 LICENSE도 고친다.
- `src/data/`: `scripts/build_*.py`가 만드는 목록 JSON(생물 카탈로그·방문자·소품·사건 그림). 손으로 고치지 않는다. Vite는 `public/` 파일을 import할 수 없으므로 코드가 읽는 JSON은 여기 둔다.
- `public/assets/`: 굽힌 그림(생물 색·노멀·발광 시트, 효과, 글꼴).
- `art/`: Codex로 그린 원본. 프롬프트는 `art/PROMPTS.md`, 종 목록·그룹·시점은 `scripts/species_table.py`. 배경 컨셉은 `art/scenes/<id>/`(far·deep·back·mid·floor·props), 산호·해초·조개는 `art/props/`.
- 배경 컨셉과 소품 배치는 `src/render/scenes.ts`다. 컨셉별 색은 `SCENE_STYLES`, 소품의 종류(tall·prop·clam)와 어울리는 컨셉은 `build_fx.py`가 `props.json`에 적는다.

## 지켜야 할 규칙

- **잡아먹지 않는다**: 사건·교감에서 생물끼리 먹거나 사라지게 하지 않는다. 먹이는 과자·해초 같은 귀여운 먹이만 쓴다. 테스트가 사건 중 등장 생물이 사라지지 않는지 본다.
- **모든 생물은 반응한다**: 새 종은 이벤트 그룹이 있어야 하고 모든 그룹에는 반응하는 사건이 있어야 한다. 교감 반응과 먹이도 있어야 하며, 모든 종이 자기 먹이를 먹고 교감이 깨끗이 끝나는지 테스트가 본다.
- **큰 생물은 돌아서지 않는다**: `bigBody` 종은 사건 스크립트·교감이 아니면 방향을 바꾸지 않고 가장자리에서 그대로 나간다.
- **마우스**: 왼쪽은 먹이(생물이면 그 종 먹이, 빈 곳이면 기본 가루 먹이), 오른쪽은 교감(빈 곳이면 유리 두드리기). 호버는 연노랑 테두리와 이름만 띄우고 카드·팝업은 쓰지 않는다.
- **픽셀 격자**: 월드는 480×270이고 마지막 수중 후처리가 월드 픽셀로 다시 모은다. 스프라이트는 정수 픽셀에 놓고 `Nearest`로 샘플링한다. 창은 월드로 빈틈없이 덮고(검은 여백 금지) 넘치는 쪽을 자른다.
- **방향**: 모든 생물 시트는 오른쪽을 본다. 왼쪽으로 갈 때만 뒤집는다. 뒤로 헤엄치면 안 된다.
- **무작위와 결정성**: 창 모드는 실행마다 시드·배경 컨셉·배치 시드가 무작위다. 캡처는 `seed`(기본 7)·`scene`(기본 reef)·`layout`(기본 seed)으로 고정해 같은 그림이 나와야 한다. 배치 난수는 시뮬레이션 난수와 섞지 않고, 섞기는 Fisher–Yates로 한다(`sort(() => random() - 0.5)`는 JS 엔진마다 결과가 달라 Node와 브라우저 배치가 어긋났다).
- **깔끔함**: 바둑판 디더링·색수차·필름 그레인·화면 전체 흔들림을 쓰지 않는다(흔들림은 열수 분출 때만). 화면 가운데는 비워 둔다.
- **이미지 생성**: 새 그림은 Codex `image_gen`으로 만들고 사람이 검수한다. 여러 작업을 동시에 돌리면 Codex가 다른 작업의 그림을 복사할 수 있으므로, 각 작업 로그의 `session id` 폴더(`~/.codex/generated_images/<id>/`)에서 그 작업의 그림을 가져온다. 정면·해파리·바닥 구도는 외눈이 생기지 않게 "눈 없음" 또는 "두 눈"을 명시한다. 기존 그림을 고칠 때는 `codex exec --image <원본> -- "<프롬프트>"`처럼 `--`로 프롬프트를 떼어야 한다(없으면 프롬프트를 이미지 경로로 삼킨다).

## 문서

- `README.md`: 실행·조작
- `doc/events.md`: 사건·종 그룹·사용자 참여
- `doc/interaction.md`: 교감·먹이·활동 시간·밤 발광·큰 생물
- `doc/art-direction.md`: 픽셀·조명·후처리 계약
- `doc/species.md`: 도감(자동 생성)
- `doc/polish.md`: 작업 기록
