#!/usr/bin/env python3
"""낮·황혼·밤·새벽 기준 캡처에서 게임 팔레트를 뽑아 `src/render/shaders/underwater.frag`의 PALETTE 블록에 굽는다.

후처리를 끈 기준 캡처(`art/palette/*.png`)를 480x270 월드 픽셀로 줄여 모으고, 색 분포를 덮는
색 N개와 발광·노을처럼 면적은 작지만 꼭 남아야 하는 기준색을 합친다.
"""

from __future__ import annotations

import re
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCES = ROOT / "art/palette"
SHADER = ROOT / "src/render/shaders/underwater.frag"
COLORS = 112
ANCHORS = [
    (255, 255, 255), (6, 10, 28), (120, 255, 240), (80, 200, 255), (255, 214, 120),
    (255, 150, 90), (230, 70, 60), (255, 120, 170),
]


def main() -> None:
    frames = []
    for path in sorted(SOURCES.glob("*.png")):
        image = Image.open(path).convert("RGB")
        frames.append(np.array(image.resize((480, 270), Image.Resampling.NEAREST)))
    assert frames, f"no palette sources in {SOURCES}"
    # 생물·소품·배경 시트 색도 넣어 고유색(노랑 탱, 파랑 탱, 붉은 산호)이 팔레트에서 빠지지 않게 한다.
    for sheet in sorted((ROOT / "public/assets/species").glob("*.png")) + sorted((ROOT / "public/assets/fx").glob("*.png")):
        if sheet.stem.endswith(("normal", "glow")) or sheet.stem in {"rays", "vignette", "haze", "skylight", "shadow", "caustics", "surface"}:
            continue
        image = np.array(Image.open(sheet).convert("RGBA"))
        opaque = image[image[..., 3] > 200][:, :3]
        if len(opaque):
            frames.append(np.repeat(opaque, 3, axis=0))
    pixels = np.concatenate([frame.reshape(-1, 3) for frame in frames])
    strip = Image.fromarray(pixels.reshape(1, -1, 3).astype(np.uint8), "RGB")
    quant = strip.quantize(colors=COLORS, method=Image.Quantize.MAXCOVERAGE, dither=Image.Dither.NONE)
    palette = [tuple(quant.getpalette()[i * 3: i * 3 + 3]) for i in range(COLORS)] + ANCHORS
    palette = sorted(set(palette), key=lambda c: 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2])
    entries = ",\n  ".join(f"vec3({r / 255:.4f}, {g / 255:.4f}, {b / 255:.4f})" for r, g, b in palette)
    block = (
        "// PALETTE_BEGIN (scripts/build_palette.py가 생성)\n"
        f"const int PALETTE_SIZE = {len(palette)};\n"
        f"const vec3 PALETTE[{len(palette)}] = vec3[{len(palette)}](\n  {entries}\n);\n"
        "// PALETTE_END"
    )
    shader = SHADER.read_text()
    shader = re.sub(r"// PALETTE_BEGIN.*?// PALETTE_END", block, shader, flags=re.S)
    SHADER.write_text(shader)
    print(f"palette: {len(palette)} colors from {len(frames)} captures")


if __name__ == "__main__":
    main()
