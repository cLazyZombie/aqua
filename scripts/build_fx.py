#!/usr/bin/env python3
"""게임 해상도(480x270)에 맞춘 빛·물 효과 텍스처를 결정적으로 굽는다.

- `rays.png`: 디더링한 빛줄기 3종
- `caustics.png`: 바닥에 비치는 물결 빛 8프레임 루프
- `surface.png`: 수면 반짝임 8프레임 루프
- `bubbles.png`: 크기별 기포 3종
- `vignette.png`: 화면 가장자리 어둠
- `background.png`: Codex 원본 배경을 게임 해상도 팔레트로 굽는다
- `reef-*.png`: Codex 원본 산호 소품을 개별 스프라이트로 자른다
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from PIL import Image

from build_sprites import clean, despeckle, downsample, key_background, quantize_opaque, to_rgba, outline_color


ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / "art"
OUT = ROOT / "public/assets/fx"
W, H = 480, 270
# 휴대폰 가로 화면(약 2.17:1)에 맞춘 보이는 월드 폭과 무대 양옆 여백이다(src/sim/constants.ts와 같다).
VIEW_W = 588
MARGIN = (VIEW_W - W) // 2


def band(level: np.ndarray, steps: int) -> np.ndarray:
    """0..1 값을 `steps` 단계의 평평한 띠로 끊는다. 바둑판 무늬 없이 깔끔한 픽셀 계조를 만든다."""
    return np.clip(np.floor(level * steps + 0.5) / steps, 0.0, 1.0)




def save(array: np.ndarray, name: str) -> None:
    Image.fromarray(array.astype(np.uint8), "RGBA").save(OUT / name)


def rays() -> None:
    """위에서 비스듬히 내려오는 빛줄기. 가산 합성용 흰색 + 알파."""
    rw, rh = 56, 250
    sheet = np.zeros((rh, rw * 3, 4))
    for k, (width, slope) in enumerate([(9, 0.22), (15, 0.18), (6, 0.26)]):
        ys, xs = np.mgrid[0:rh, 0:rw].astype(np.float32)
        center = 8 + ys * slope
        spread = width * (0.6 + 0.8 * ys / rh)
        across = np.clip(1.0 - np.abs(xs - center) / spread, 0.0, 1.0) ** 1.2
        fade = np.clip(1.0 - ys / rh, 0.0, 1.0) ** 1.4 * np.clip(ys / 18.0, 0.0, 1.0)
        level = band(across * fade, 6)
        sheet[:, k * rw:(k + 1) * rw, :3] = 255
        sheet[:, k * rw:(k + 1) * rw, 3] = level * 255
    save(sheet, "rays.png")


def voronoi_edges(w: int, h: int, t: float, seed: int, cells: int, squash: float) -> np.ndarray:
    """주기적으로 원운동하는 점으로 만든 보로노이 경계 밝기. t가 0..1이면 한 바퀴다."""
    rng = np.random.default_rng(seed)
    base = rng.random((cells, 2))
    radius = 0.018 + 0.02 * rng.random(cells)
    offset = rng.random(cells) * math.tau
    angle = math.tau * t + offset
    points = base + np.stack([np.cos(angle) * radius, np.sin(angle) * radius * 0.8], 1)
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    u, v = xs / w, ys / h
    d1 = np.full((h, w), 9.0)
    d2 = np.full((h, w), 9.0)
    for px, py in points:
        for ox in (-1.0, 0.0, 1.0):
            for oy in (-1.0, 0.0, 1.0):
                dx = (u - px - ox) * w / h * squash
                dy = v - py - oy
                d = np.sqrt(dx * dx + dy * dy)
                d2 = np.where(d < d1, d1, np.minimum(d2, d))
                d1 = np.minimum(d1, d)
    return np.clip(1.0 - (d2 - d1) * 38.0, 0.0, 1.0)


def caustics(scene: str) -> None:
    """바닥 위에만 비치는 물결 빛. 그 배경 바닥 띠의 밝은 땅 픽셀로 가린 588x48 프레임 8장이다(보이는 월드 폭)."""
    cw, ch, frames = VIEW_W, 48, 8
    left = (FLOOR_SIZE[0] + 2 * SIDE - VIEW_W) // 2
    image = Image.open(OUT / f"scene-{scene}-floor.png").convert("RGBA").crop((left, 0, left + VIEW_W, ch))
    ground = np.array(image).astype(np.int32)
    luma = ground[..., 0] * 0.3 + ground[..., 1] * 0.59 + ground[..., 2] * 0.11
    sand = (ground[..., 3] > 0) & (luma > 95)
    sheet = np.zeros((ch, cw * frames, 4))
    for k in range(frames):
        half = voronoi_edges(cw // 2, ch, k / frames, 11, 26, 0.55)
        edge = np.concatenate([half, half], axis=1)
        depth = np.clip(np.mgrid[0:ch, 0:cw][0] / ch * 1.6, 0.0, 1.0)
        level = band(edge ** 1.6 * (0.3 + 0.7 * depth), 3) * sand
        sheet[:, k * cw:(k + 1) * cw, :3] = [255, 255, 225]
        sheet[:, k * cw:(k + 1) * cw, 3] = level * 255
    save(sheet, f"scene-{scene}-caustics.png")


def surface() -> None:
    sw, sh, frames = 240, 30, 8
    sheet = np.zeros((sh, sw * frames, 4))
    for k in range(frames):
        edge = voronoi_edges(sw, sh, k / frames, 5, 30, 1.8)
        fade = np.clip(1.0 - np.mgrid[0:sh, 0:sw][0] / sh, 0.0, 1.0) ** 1.3
        level = band(edge ** 1.2 * fade, 3)
        sheet[:, k * sw:(k + 1) * sw, :3] = [225, 255, 255]
        sheet[:, k * sw:(k + 1) * sw, 3] = level * 255
    save(sheet, "surface.png")


def bubbles() -> None:
    """외곽선·몸·하이라이트 세 색으로 찍은 3, 5, 7픽셀 기포."""
    shapes = [
        [".o.", "o.o", ".o."],
        [".ooo.", "oh..o", "o...o", "o...o", ".ooo."],
        ["..ooo..", ".o...o.", "oh....o", "oh....o", "o.....o", ".o...o.", "..ooo.."],
    ]
    sheet = np.zeros((7, 7 * 3, 4))
    colors = {"o": (200, 245, 255, 235), "h": (255, 255, 255, 255), ".": (120, 210, 240, 70)}
    for k, rows in enumerate(shapes):
        size = len(rows)
        top = (7 - size) // 2
        for y, row in enumerate(rows):
            for x, cell in enumerate(row):
                inside = abs(x - (size - 1) / 2) + abs(y - (size - 1) / 2) <= size * 0.72
                if cell != "." or inside and size > 3:
                    sheet[top + y, k * 7 + top + x] = colors[cell]
    save(sheet, "bubbles.png")


def haze() -> None:
    """뒷줄과 앞줄 사이에 깔 물빛 안개. 행마다 배경 중앙의 물색을 쓴다."""
    ground = np.array(Image.open(OUT / "background.png").convert("RGB")).astype(np.float32)
    water = ground[:, W // 2 - 60: W // 2 + 60].mean(1)
    out = np.zeros((H, 1, 4))
    out[:, 0, :3] = water
    out[:, 0, 3] = 255
    save(out, "haze.png")


def shadow() -> None:
    """모래에 드리우는 생물 그림자. 가운데가 진한 디더링 타원이다."""
    sw, sh = 32, 8
    ys, xs = np.mgrid[0:sh, 0:sw].astype(np.float32)
    dx = (xs + 0.5 - sw / 2) / (sw / 2)
    dy = (ys + 0.5 - sh / 2) / (sh / 2)
    level = np.clip(1.0 - np.sqrt(dx * dx + dy * dy), 0.0, 1.0) ** 0.8
    out = np.zeros((sh, sw, 4))
    out[..., :3] = [6, 20, 40]
    out[..., 3] = band(level, 3) * 255
    save(out, "shadow.png")


def lights() -> None:
    """손전등 원뿔(오른쪽을 향함)과 둥근 불빛. 가산 합성용 흰색 + 단계 알파."""
    cw, ch = 120, 60
    ys, xs = np.mgrid[0:ch, 0:cw].astype(np.float32)
    along = xs / cw
    spread = 0.1 + along * 0.45
    across = np.abs(ys - ch / 2) / (ch / 2)
    level = np.clip(1.0 - across / spread, 0.0, 1.0) ** 0.8 * (1.0 - along) ** 0.9 * np.clip(along * 8.0, 0.0, 1.0)
    cone = np.zeros((ch, cw, 4))
    cone[..., :3] = 255
    cone[..., 3] = band(level, 6) * 255
    save(cone, "cone.png")
    size = 64
    ys, xs = np.mgrid[0:size, 0:size].astype(np.float32)
    radius = np.sqrt((xs + 0.5 - size / 2) ** 2 + (ys + 0.5 - size / 2) ** 2) / (size / 2)
    spot = np.zeros((size, size, 4))
    spot[..., :3] = 255
    spot[..., 3] = band(np.clip(1.0 - radius, 0.0, 1.0) ** 1.4, 6) * 255
    save(spot, "spot.png")


def skylight() -> None:
    """수면에서 아래로 옅어지는 흰 빛. 노을·아침빛을 가산 합성할 때 색을 입혀 쓴다."""
    ys = np.arange(H, dtype=np.float32)
    out = np.zeros((H, 1, 4))
    out[:, 0, :3] = 255
    out[:, 0, 3] = np.clip(1.0 - ys / (H * 0.75), 0.0, 1.0) ** 2.2 * 255
    save(out, "skylight.png")


def vignette() -> None:
    """보이는 월드(588×270) 전체에 까는 비네트다. 16:9 창에서는 양옆이 잘린 가운데만 보인다."""
    ys, xs = np.mgrid[0:H, 0:VIEW_W].astype(np.float32)
    dx = (xs - VIEW_W / 2) / (VIEW_W / 2)
    dy = np.maximum(ys - H * 0.35, 0.0) / (H * 0.65)
    level = np.clip((np.sqrt(dx * dx * 0.8 + dy * dy * 0.6) - 0.7) / 0.5, 0.0, 1.0) ** 1.5
    out = np.zeros((H, VIEW_W, 4))
    out[..., :3] = [4, 10, 30]
    out[..., 3] = band(level * 0.45, 5) * 255
    save(out, "vignette.png")


# 카메라가 흔들려도 가장자리가 드러나지 않도록 층마다 여백을 둔다(패럴랙스 계수 × 표류 폭보다 크게).
# 층은 16:9 무대 기준 크기로 굽고(원본 구도 그대로), 휴대폰 가로 화면에서만 보이는 양옆은 가장자리를 거울로 이어 붙여 넓힌다.
# 넓힌 뒤 폭은 보이는 월드(588)에 화면 흔들림 여유를 더한 값이고, backdrop.ts가 가운데를 맞춰 깐다.
FAR_SIZE = (500, 282)
MID_SIZE = (512, 288)
FLOOR_SIZE = (512, 48)
SIDE = 55


def widen(name: str) -> None:
    """굽힌 층의 양옆을 가장자리 거울로 SIDE픽셀씩 늘린다. 16:9 창에서는 잘려 안 보이는 부분이다."""
    image = np.array(Image.open(OUT / name).convert("RGBA"))
    wide = np.pad(image, ((0, 0), (SIDE, SIDE), (0, 0)), mode="symmetric")
    Image.fromarray(wide, "RGBA").save(OUT / name)


def parallax(scene: str, far_source: str, mid_source: str) -> None:
    """먼 배경(불투명)과 중간 바위(투명)를 층별 크기로 굽는다."""
    far = Image.open(ART / far_source).convert("RGB")
    fw, fh = far.size
    crop_h = round(fw * FAR_SIZE[1] / FAR_SIZE[0])
    far = far.crop((0, 0, fw, crop_h)).resize(FAR_SIZE, Image.Resampling.BOX)
    far.convert("RGBA").save(OUT / f"scene-{scene}-far.png")
    mid = np.array(Image.open(ART / mid_source).convert("RGBA"))
    mask = mid[..., 3] > 170
    mh, mw = mask.shape
    crop_h = round(mw * MID_SIZE[1] / MID_SIZE[0])
    top = mh - crop_h
    rgb = mid[top:, :, :3]
    sub = mask[top:]
    index, palette = quantize_opaque(rgb, sub, 40)
    small = despeckle(clean(downsample(index, MID_SIZE[0])), palette)
    small = small[: MID_SIZE[1]]
    out = np.zeros((small.shape[0], small.shape[1], 4), dtype=np.uint8)
    opaque = small >= 0
    out[opaque, :3] = palette[small[opaque]]
    out[opaque, 3] = 255
    canvas = np.zeros((MID_SIZE[1], MID_SIZE[0], 4), dtype=np.uint8)
    canvas[MID_SIZE[1] - out.shape[0]:] = out
    Image.fromarray(canvas, "RGBA").save(OUT / f"scene-{scene}-mid.png")


def reef_floor() -> None:
    """산호초 바다의 모래 바닥 띠는 전체 배경 그림 아래쪽에서 잘라 쓴다."""
    ground = Image.open(OUT / "background.png").convert("RGBA")
    strip = ground.crop((0, H - FLOOR_SIZE[1], W, H)).resize(FLOOR_SIZE, Image.Resampling.NEAREST)
    alpha = np.array(strip)
    rows = np.arange(FLOOR_SIZE[1])[:, None]
    # 모래 띠 위쪽 몇 줄은 단계적으로 투명하게 해 중간 바위와 자연스럽게 이어 붙인다.
    fade = np.clip(rows / 10.0, 0.0, 1.0) * np.ones((1, FLOOR_SIZE[0]))
    alpha[..., 3] = (band(fade, 4) * 255).astype(np.uint8)
    Image.fromarray(alpha, "RGBA").save(OUT / "scene-reef-floor.png")


def scene_floor(scene: str, source: str) -> None:
    """바닥 띠 원본(아래 30%만 땅)을 게임 폭으로 픽셀화하고, 땅 윗면부터 48줄을 바닥 띠로 쓴다."""
    raw = np.array(Image.open(ART / source).convert("RGBA"))
    mask = raw[..., 3] > 170
    index, palette = quantize_opaque(raw[..., :3], mask, 32)
    small = despeckle(clean(downsample(index, FLOOR_SIZE[0])), palette)
    rows = np.nonzero((small >= 0).mean(1) > 0.5)[0]
    top = max(0, rows.min() - 3)
    part = small[top: top + FLOOR_SIZE[1]]
    out = np.zeros((FLOOR_SIZE[1], FLOOR_SIZE[0], 4), dtype=np.uint8)
    opaque = part >= 0
    block = np.zeros((part.shape[0], FLOOR_SIZE[0], 4), dtype=np.uint8)
    block[opaque, :3] = palette[part[opaque]]
    block[opaque, 3] = 255
    out[: part.shape[0]] = block
    # 땅 밑이 모자라면 마지막 줄을 늘여 채운다.
    for y in range(part.shape[0], FLOOR_SIZE[1]):
        out[y] = out[part.shape[0] - 1]
    Image.fromarray(out, "RGBA").save(OUT / f"scene-{scene}-floor.png")


DEEP_SIZE = (500, 170)
KELP_SIZE = (512, 230)


def backdrop_band(source: str, name: str, size: tuple[int, int], top: float) -> None:
    """투명 배경 원본의 아래쪽 띠(`top` 비율부터 끝까지)를 층 크기로 굽는다. 먼 산맥·다시마 숲 층에 쓴다."""
    raw = np.array(Image.open(ART / source).convert("RGBA"))
    raw = raw[round(raw.shape[0] * top):]
    mask = raw[..., 3] > 170
    index, palette = quantize_opaque(raw[..., :3], mask, 24)
    small = despeckle(clean(downsample(index, size[0])), palette)
    out = np.zeros((size[1], size[0], 4), dtype=np.uint8)
    rows = min(size[1], small.shape[0])
    part = small[small.shape[0] - rows:]
    opaque = part >= 0
    block = np.zeros((rows, size[0], 4), dtype=np.uint8)
    block[opaque, :3] = palette[part[opaque]]
    block[opaque, 3] = 255
    out[size[1] - rows:] = block
    Image.fromarray(out, "RGBA").save(OUT / name)


def background() -> None:
    """원본 배경을 16:9로 자르고 게임 해상도 팔레트 픽셀로 굽는다."""
    raw = Image.open(ART / "background.png").convert("RGB")
    rw, rh = raw.size
    crop_h = round(rw * 9 / 16)
    top = min(rh - crop_h, round(rh * 0.04))
    small = raw.crop((0, top, rw, top + crop_h)).resize((W, H), Image.Resampling.BOX)
    out = np.array(small.convert("RGBA"))
    Image.fromarray(out, "RGBA").save(OUT / "background.png")


def main_body(sprite: np.ndarray) -> np.ndarray:
    """이웃 소품에서 딸려 온 작은 조각을 지우고 본체 연결 요소만 남긴 뒤 다시 자른다."""
    opaque = sprite[..., 3] > 0
    label = np.zeros(opaque.shape, dtype=np.int32)
    sizes = [0]
    for y, x in zip(*np.nonzero(opaque)):
        if label[y, x]:
            continue
        sizes.append(0)
        stack = [(y, x)]
        label[y, x] = len(sizes) - 1
        while stack:
            cy, cx = stack.pop()
            sizes[-1] += 1
            for ny in range(cy - 1, cy + 2):
                for nx in range(cx - 1, cx + 2):
                    if 0 <= ny < opaque.shape[0] and 0 <= nx < opaque.shape[1] and opaque[ny, nx] and not label[ny, nx]:
                        label[ny, nx] = len(sizes) - 1
                        stack.append((ny, nx))
    largest = max(sizes)
    keep = np.isin(label, [k for k, size in enumerate(sizes) if k and size >= largest * 0.08])
    out = sprite.copy()
    out[~keep] = 0
    rows = np.nonzero(keep.any(1))[0]
    cols = np.nonzero(keep.any(0))[0]
    return out[rows.min(): rows.max() + 1, cols.min(): cols.max() + 1]


def sway(sprite: np.ndarray, frames: int, amplitude: float) -> np.ndarray:
    """뿌리는 고정하고 위로 갈수록 크게 흔들리는 프레임을 가로로 이어 붙인다."""
    h, w = sprite.shape[:2]
    pad = math.ceil(amplitude) + 1
    out = []
    for k in range(frames):
        phase = math.tau * k / frames
        frame = np.zeros((h, w + pad * 2, 4), dtype=np.uint8)
        for y in range(h):
            rise = 1.0 - y / max(1, h - 1)
            dx = round(amplitude * rise ** 1.5 * math.sin(phase + rise * 2.2))
            frame[y, pad + dx: pad + dx + w] = sprite[y]
        out.append(frame)
    return np.concatenate(out, axis=1)


def component_groups(mask: np.ndarray) -> list[np.ndarray]:
    """마스크의 연결 요소(8방향)를 큰 덩어리별로 묶는다. 작은 조각은 가장 가까운 큰 덩어리에 붙인다. 왼쪽부터 정렬한다."""
    from collections import deque
    label = np.zeros(mask.shape, dtype=np.int32)
    areas, centers = [0], [(0.0, 0.0)]
    height, width = mask.shape
    for y, x in zip(*np.nonzero(mask)):
        if label[y, x]:
            continue
        index = len(areas)
        label[y, x] = index
        queue = deque([(y, x)])
        count, sx, sy = 0, 0, 0
        while queue:
            cy, cx = queue.popleft()
            count += 1
            sx += cx
            sy += cy
            for ny in (cy - 1, cy, cy + 1):
                for nx in (cx - 1, cx, cx + 1):
                    if 0 <= ny < height and 0 <= nx < width and mask[ny, nx] and not label[ny, nx]:
                        label[ny, nx] = index
                        queue.append((ny, nx))
        areas.append(count)
        centers.append((sx / count, sy / count))
    largest = max(areas)
    big = [k for k in range(1, len(areas)) if areas[k] >= largest * 0.05]
    owner = {k: k for k in big}
    for k in range(1, len(areas)):
        if k not in owner:
            owner[k] = min(big, key=lambda b: abs(centers[b][0] - centers[k][0]) + abs(centers[b][1] - centers[k][1]))
    lookup = np.zeros(len(areas), dtype=np.int32)
    for k, target in owner.items():
        lookup[k] = target
    grouped = lookup[label]
    big.sort(key=lambda k: centers[k][0])
    return [(grouped == k) & mask for k in big]


def split_parts(source: str, scale: float, core: int, components: bool = False) -> list[np.ndarray]:
    """원본 소품 띠를 같은 배율의 개별 픽셀 스프라이트로 자른다. 밑동이 맞닿으면 가장 얇은 열에서 나누고,
    `components`면 가로 범위가 겹쳐도 떨어져 있는 덩어리(연결 요소)별로 나눈다."""
    raw = np.array(Image.open(ART / source).convert("RGBA"))
    if (raw[..., 3] < 16).mean() > 0.2:
        mask = raw[..., 3] > 170
    else:
        mask = key_background(raw[..., :3])
    if components:
        parts = []
        scale *= raw.shape[1] / 1536
        for piece in component_groups(mask):
            rows = np.nonzero(piece.any(1))[0]
            cols = np.nonzero(piece.any(0))[0]
            y0, y1, x0, x1 = rows.min(), rows.max() + 1, cols.min(), cols.max() + 1
            sub = piece[y0:y1, x0:x1]
            index, palette = quantize_opaque(raw[y0:y1, x0:x1, :3], sub, 16)
            small = despeckle(clean(downsample(index, max(8, round((x1 - x0) / scale)))), palette)
            parts.append(main_body(to_rgba(small, palette, outline_color(palette))))
        return parts
    column = mask.sum(0)
    cores, start = [], None
    for x, dense in enumerate(list(column > core) + [False]):
        if dense and start is None:
            start = x
        elif not dense and start is not None:
            if x - start > 20:
                cores.append((start, x))
            start = None
    cuts = [0]
    for (_, end), (begin, _) in zip(cores, cores[1:]):
        cuts.append(end + int(np.argmin(column[end:begin])))
    cuts.append(mask.shape[1])
    parts = []
    scale *= raw.shape[1] / 1536
    for x0, x1 in zip(cuts, cuts[1:]):
        part = mask[:, x0:x1]
        cols = np.nonzero(part.any(0))[0]
        x0, x1 = x0 + cols.min(), x0 + cols.max() + 1
        part = mask[:, x0:x1]
        rows = np.nonzero(part.any(1))[0]
        y0, y1 = rows.min(), rows.max() + 1
        rgb = raw[y0:y1, x0:x1, :3]
        sub = mask[y0:y1, x0:x1]
        width = max(8, round((x1 - x0) / scale))
        index, palette = quantize_opaque(rgb, sub, 16)
        small = despeckle(clean(downsample(index, width)), palette)
        parts.append(main_body(to_rgba(small, palette, outline_color(palette))))
    return parts


def clam_sheet(source: str, name: str, scale: float, scenes: list[str]) -> dict:
    """닫힘·반쯤 열림·활짝 열림 세 조개를 같은 칸 크기의 3프레임 시트로 굽는다. 아래쪽 가운데를 맞춘다."""
    parts = split_parts(source, scale, 40)
    if len(parts) != 3:
        raise SystemExit(f"{source}: expected 3 clam states, got {len(parts)}")
    w = max(part.shape[1] for part in parts)
    h = max(part.shape[0] for part in parts)
    sheet = np.zeros((h, w * 3, 4), dtype=np.uint8)
    for k, part in enumerate(parts):
        ph, pw = part.shape[:2]
        x = k * w + (w - pw) // 2
        sheet[h - ph: h, x: x + pw] = part
    Image.fromarray(sheet, "RGBA").save(OUT / name)
    return {"texture": f"assets/fx/{name}", "w": w, "h": h, "frames": 3, "kind": "clam", "scenes": scenes}


def props(source: str, prefix: str, scale: float, core: int, swaying: dict[int, float],
          scenes: dict[int, list[str]] | list[str], skip: tuple[int, ...] = (), components: bool = False) -> list[dict]:
    """원본 소품 띠를 개별 스프라이트로 자르고 흔들림 프레임을 굽는다. 기록에 종류(키 큰 풀/소품)와 어울리는 배경을 붙인다."""
    records = []
    for k, sprite in enumerate(split_parts(source, scale, core, components)):
        if k in skip:
            continue
        frames = 8 if k in swaying else 1
        sheet = sway(sprite, frames, swaying[k]) if k in swaying else sprite
        name = f"{prefix}-{k:02d}.png"
        Image.fromarray(sheet, "RGBA").save(OUT / name)
        where = scenes.get(k, []) if isinstance(scenes, dict) else scenes
        records.append({
            "texture": f"assets/fx/{name}",
            "w": sheet.shape[1] // frames,
            "h": sheet.shape[0],
            "frames": frames,
            "kind": "tall" if sheet.shape[0] >= 90 else "prop",
            "scenes": where,
        })
    return records


# 배경 컨셉: (id, 먼 배경, 먼 산맥, 먼 숲·기둥, 중간 바위, 바닥 띠). 산호초는 처음 그린 원본을 쓴다.
SCENES = [
    ("reef", "bg-far.png", "bg-deep.png", "bg-kelp.png", "bg-mid.png", None),
    ("kelp", "scenes/kelp/far.png", "scenes/kelp/deep.png", "scenes/kelp/back.png", "scenes/kelp/mid.png", "scenes/kelp/floor.png"),
    ("wreck", "scenes/wreck/far.png", "scenes/wreck/deep.png", "scenes/wreck/back.png", "scenes/wreck/mid.png", "scenes/wreck/floor.png"),
    ("ruins", "scenes/ruins/far.png", "scenes/ruins/deep.png", "scenes/ruins/back.png", "scenes/ruins/mid.png", "scenes/ruins/floor.png"),
    ("ice", "scenes/ice/far.png", "scenes/ice/deep.png", "scenes/ice/back.png", "scenes/ice/mid.png", "scenes/ice/floor.png"),
]
ALL = [scene[0] for scene in SCENES]
WARM = ["reef", "wreck", "ruins"]


def scenes() -> list[str]:
    """원본이 모두 있는 배경 컨셉만 굽고 그 id 목록을 돌려준다."""
    built = []
    for scene, far, deep, back, mid, floor in SCENES:
        sources = [far, deep, back, mid] + ([floor] if floor else [])
        missing = [source for source in sources if not (ART / source).exists()]
        if missing:
            print(f"skip scene {scene}: missing {', '.join(missing)}")
            continue
        parallax(scene, far, mid)
        backdrop_band(deep, f"scene-{scene}-deep.png", DEEP_SIZE, 0.5)
        backdrop_band(back, f"scene-{scene}-back.png", KELP_SIZE, 0.2)
        if floor:
            scene_floor(scene, floor)
        else:
            reef_floor()
        for layer in ("far", "deep", "back", "mid", "floor"):
            widen(f"scene-{scene}-{layer}.png")
        caustics(scene)
        built.append(scene)
    return built


# 쓰레기 8종: 원본(art/events/trash.png)의 두 줄 네 칸 순서와 게임 폭(px)이다.
TRASH = [("can", "찌그러진 캔", 16), ("bottle", "페트병", 18), ("bag", "비닐봉지", 16), ("boot", "낡은 장화", 17),
         ("tire", "폐타이어", 15), ("glass", "유리병", 18), ("mask", "일회용 마스크", 17), ("net", "폐그물", 19)]


def trash() -> list[dict]:
    """쓰레기 원본을 연결 요소로 나눠(위 줄 왼쪽부터) 종류마다 게임 폭으로 굽는다."""
    raw = np.array(Image.open(ART / "events/trash.png").convert("RGBA"))
    mask = raw[..., 3] > 170
    pieces = component_groups(mask)
    if len(pieces) != len(TRASH):
        raise SystemExit(f"trash.png: expected {len(TRASH)} items, got {len(pieces)}")
    half = raw.shape[0] / 2
    def place(piece: np.ndarray) -> tuple[int, float]:
        rows, cols = np.nonzero(piece)
        return (0 if rows.mean() < half else 1, cols.mean())
    pieces.sort(key=place)
    records = []
    for (kind, name, width), piece in zip(TRASH, pieces):
        rows = np.nonzero(piece.any(1))[0]
        cols = np.nonzero(piece.any(0))[0]
        y0, y1, x0, x1 = rows.min(), rows.max() + 1, cols.min(), cols.max() + 1
        sub = piece[y0:y1, x0:x1]
        index, palette = quantize_opaque(raw[y0:y1, x0:x1, :3], sub, 16)
        small = despeckle(clean(downsample(index, width)), palette)
        sprite = main_body(to_rgba(small, palette, outline_color(palette)))
        file = f"trash-{kind}.png"
        Image.fromarray(sprite, "RGBA").save(OUT / file)
        records.append({"kind": kind, "name": name, "texture": f"assets/fx/{file}", "w": int(sprite.shape[1]), "h": int(sprite.shape[0])})
    return records


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    background()
    built = scenes()
    haze()
    shadow()
    lights()
    skylight()
    rays()
    surface()
    bubbles()
    vignette()
    # 소품: 종류(키 큰 풀·소품·조개)와 어울리는 배경 컨셉을 붙인다. 세워 둔 가리비(8번)는 쓰지 않는다.
    reef_scenes = {k: WARM for k in range(12)}
    for k in (1, 5, 6):
        reef_scenes[k] = ALL
    records = props("reef.png", "reef", 4.0, 60, {5: 2.0, 9: 3.0}, reef_scenes, skip=(8,))
    records += props("kelp.png", "kelp", 5.6, 30, {0: 7.0, 1: 7.0, 2: 6.0, 3: 3.0},
                     {0: ["reef", "kelp", "ice"], 1: ["reef", "kelp", "ice"], 2: ALL, 3: ALL})
    optional = [
        ("props/reef2.png", "coral", 5.2, 20, {}, WARM),
        ("props/weed2.png", "weed", 6.2, 40, {0: 5.0, 1: 3.0, 2: 5.0, 3: 2.0}, {0: ALL, 1: WARM + ["kelp"], 2: ["kelp", "wreck", "reef"], 3: WARM}),
        ("scenes/kelp/props.png", "kelp-set", 5.0, 30, {}, ["kelp"]),
        ("scenes/wreck/props.png", "wreck-set", 5.0, 30, {}, ["wreck"]),
        ("scenes/ruins/props.png", "ruins-set", 5.0, 30, {}, ["ruins"]),
        ("scenes/ice/props.png", "ice-set", 5.0, 30, {}, ["ice"]),
    ]
    for source, prefix, scale, core, swaying, where in optional:
        if (ART / source).exists():
            # 컨셉 소품은 서로 붙어 그려진 것이 많아 연결 요소로 나눈다.
            records += props(source, prefix, scale, core, swaying, where, components="-set" in prefix)
        else:
            print(f"skip props {source}")
    clams = [("hard", ALL), ("venus", WARM), ("oyster", ALL), ("scallop", ALL), ("pearl", WARM)]
    for clam, where in clams:
        source = f"props/clam-{clam}.png"
        if (ART / source).exists():
            records.append(clam_sheet(source, f"clam-{clam}.png", 14.0, where))
    data = ROOT / "src/data"
    data.mkdir(parents=True, exist_ok=True)
    (data / "props.json").write_text(json.dumps(records, indent=1) + "\n")
    (data / "scenes.json").write_text(json.dumps(built) + "\n")
    litter = trash()
    (data / "trash.json").write_text(json.dumps(litter, indent=1, ensure_ascii=False) + "\n")
    print(f"scenes: {', '.join(built)}; props: {len(records)}")
    print("FX build done")


if __name__ == "__main__":
    main()
