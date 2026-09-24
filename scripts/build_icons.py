#!/usr/bin/env python3
"""PWA·홈 화면 아이콘을 굽는다. 64x64 픽셀 격자에 물빛 띠·기포·모래·흰동가리를 그린 뒤 정수배로 키운다.

- icon-192.png, icon-512.png: 둥근 모서리(모서리 밖은 투명) 일반 아이콘
- icon-maskable-512.png: 가장자리까지 채운 마스크용 아이콘(흰동가리는 가운데 안전 영역 안)
- apple-touch-icon.png(180): iOS 홈 화면용, 가장자리까지 채움
- favicon.png(32)
"""

from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public/icons"
GRID = 64

# 위에서 아래로 짙어지는 물빛 띠(평평한 몇 단계, 디더링 없음).
BANDS = [(38, 196, 214), (26, 160, 196), (20, 124, 178), (16, 92, 150), (12, 64, 118)]
SAND = [(226, 204, 150), (196, 170, 116)]


def scene() -> np.ndarray:
    """64x64 RGBA 한 장면이다."""
    canvas = np.zeros((GRID, GRID, 4), dtype=np.uint8)
    band_h = 52 // len(BANDS)
    for index, color in enumerate(BANDS):
        top = index * band_h
        bottom = 52 if index == len(BANDS) - 1 else top + band_h
        canvas[top:bottom, :, :3] = color
    canvas[:52, :, 3] = 255
    # 수면 반짝임 한 줄과 비스듬한 빛줄기.
    canvas[2, 8:56:3, :3] = (190, 246, 250)
    for y in range(0, 50):
        x0 = 14 + y // 3
        canvas[y, x0:x0 + 4, :3] = np.minimum(canvas[y, x0:x0 + 4, :3].astype(int) + 22, 255)
    # 모래 두 줄 띠.
    canvas[52:58, :, :3] = SAND[0]
    canvas[58:, :, :3] = SAND[1]
    canvas[52:, :, 3] = 255
    # 기포: 테두리만 있는 작은 원 둘.
    for cx, cy, r in ((48, 14, 2), (52, 7, 1)):
        for y in range(cy - r - 1, cy + r + 2):
            for x in range(cx - r - 1, cx + r + 2):
                d = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
                if r - 0.5 <= d <= r + 0.6:
                    canvas[y, x, :3] = (220, 250, 255)
    # 흰동가리(게임 스프라이트 첫 프레임)를 가운데에 놓는다.
    sheet = Image.open(ROOT / "public/assets/species/clownfish.png").convert("RGBA")
    fish = np.array(sheet.crop((0, 0, 36, 25)))
    fy, fx = 18, (GRID - fish.shape[1]) // 2
    alpha = fish[..., 3:4] / 255.0
    region = canvas[fy:fy + fish.shape[0], fx:fx + fish.shape[1], :3].astype(float)
    canvas[fy:fy + fish.shape[0], fx:fx + fish.shape[1], :3] = (fish[..., :3] * alpha + region * (1 - alpha)).astype(np.uint8)
    return canvas


def rounded(canvas: np.ndarray, radius: int) -> np.ndarray:
    """모서리를 격자 단위로 둥글게 깎는다(깎인 곳은 투명)."""
    out = canvas.copy()
    for y in range(GRID):
        for x in range(GRID):
            dx = max(radius - x - 0.5, x + 0.5 - (GRID - radius), 0)
            dy = max(radius - y - 0.5, y + 0.5 - (GRID - radius), 0)
            if dx * dx + dy * dy > radius * radius:
                out[y, x, 3] = 0
    return out


def scaled(canvas: np.ndarray, factor: int) -> Image.Image:
    return Image.fromarray(canvas, "RGBA").resize((GRID * factor, GRID * factor), Image.Resampling.NEAREST)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    full = scene()
    round_icon = rounded(full, 12)
    scaled(round_icon, 3).save(OUT / "icon-192.png")
    scaled(round_icon, 8).save(OUT / "icon-512.png")
    scaled(full, 8).save(OUT / "icon-maskable-512.png")
    # 180은 64의 정수배가 아니므로 가장자리 2칸씩 잘라 60x60을 3배로 키운다.
    Image.fromarray(full[2:62, 2:62], "RGBA").resize((180, 180), Image.Resampling.NEAREST).convert("RGB").save(OUT / "apple-touch-icon.png")
    Image.fromarray(round_icon, "RGBA").resize((32, 32), Image.Resampling.BOX).save(OUT / "favicon.png")
    print("icons:", ", ".join(sorted(path.name for path in OUT.iterdir())))


if __name__ == "__main__":
    main()
