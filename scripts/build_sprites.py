#!/usr/bin/env python3
"""Codex가 만든 원본 생물 그림을 게임 해상도 픽셀 스프라이트와 유영 프레임으로 굽는다.

원본(`art/species/<id>.png`)은 자홍 배경의 큰 그림이다. 이 스크립트가 배경 제거,
팔레트 축소, 게임 해상도 다운샘플, 외곽선, 종류별 프레임 변형, 발광 마스크를 결정적으로 만든다.
모든 스프라이트는 오른쪽을 바라보는 상태로 저장하고, 런타임은 왼쪽으로 갈 때만 뒤집는다.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from PIL import Image

from species_table import EXISTING_GROUPS, FLIP, NEW


ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "art/species"
OUT = ROOT / "public/assets/species"
DOC = ROOT / "doc/species"
PAD = 3

# id, 영문명, 한글명, 게임 픽셀 폭, 몸 동작, 활동 시간, 발광 규칙, 원본 좌우 반전 여부
SPECIES = [
    ("clownfish", "Clownfish", "흰동가리", 30, "fish", "day", None, False),
    ("blue-tang", "Blue tang", "블루탱", 32, "fish", "day", None, False),
    ("yellow-tang", "Yellow tang", "옐로탱", 28, "fish", "day", None, False),
    ("moorish-idol", "Moorish idol", "깃대돔", 30, "fish", "day", None, False),
    ("emperor-angelfish", "Emperor angelfish", "황제에인절피시", 36, "fish", "day", None, False),
    ("pufferfish", "Pufferfish", "복어", 26, "puff", "any", None, False),
    ("lionfish", "Lionfish", "쏠배감펭", 38, "fish", "any", None, False),
    ("mandarinfish", "Mandarinfish", "만다린피시", 32, "fish", "day", None, False),
    ("sardine", "Sardine", "정어리", 20, "school", "day", None, False),
    ("seahorse", "Seahorse", "해마", 18, "hover", "any", None, False),
    ("moon-jelly", "Moon jelly", "보름달물해파리", 32, "jelly", "any", "all", False),
    ("sea-nettle", "Sea nettle", "태평양쐐기해파리", 28, "jelly", "any", None, False),
    ("green-turtle", "Green sea turtle", "푸른바다거북", 62, "glide", "day", None, False),
    ("manta-ray", "Manta ray", "쥐가오리", 88, "flap", "any", None, False),
    ("hammerhead", "Hammerhead shark", "귀상어", 112, "giant", "any", None, False),
    ("dolphin", "Bottlenose dolphin", "큰돌고래", 84, "giant", "day", None, False),
    ("octopus", "Octopus", "문어", 36, "octopus", "night", None, False),
    ("red-crab", "Red crab", "홍게", 28, "crawl", "any", None, False),
    ("anglerfish", "Anglerfish", "초롱아귀", 42, "fish", "night", "bright", False),
    ("firefly-squid", "Firefly squid", "반딧불오징어", 27, "squid", "night", "blue", False),
]

# 사건 때만 등장하는 방문자다. 도감 20종과 같은 파이프라인으로 굽되 `visitors.json`에 따로 적는다.
VISITORS = [
    ("whale-shark", "Whale shark", "고래상어", 176, "giant"),
    ("sunfish", "Ocean sunfish", "개복치", 58, "giant"),
    ("baby-turtle", "Baby sea turtle", "새끼 바다거북", 20, "glide"),
    ("oarfish", "Giant oarfish", "산갈치", 200, "fish"),
    ("diver", "Scuba diver", "아쿠아다이버", 64, "fish"),
    ("adelie-penguin", "Adélie penguin", "아델리펭귄", 30, "glide"),
    ("haenyeo", "Haenyeo", "해녀", 58, "fish"),
    ("mermaid", "Mermaid", "인어공주", 56, "fish"),
]

# 먼 층 실루엣(동작 프레임)과 물건(한 장)이다. 조명 없이 텍스처로만 그린다.
FAR_SHEETS = [("giant-squid", 150, "squid"), ("submarine", 70, "rigid")]
ITEMS = [("anchor", 30), ("chest-closed", 30), ("chest-open", 30), ("bottle", 24), ("basket", 20), ("shell", 18), ("duck", 16)]

FRAMES = {
    "rigid": 2, "eel": 6, "creep": 4, "sessile": 8,
    "fish": 6, "puff": 6, "school": 4, "hover": 6, "jelly": 8, "glide": 8,
    "flap": 8, "giant": 8, "octopus": 8, "crawl": 4, "squid": 6,
}


def key_background(rgb: np.ndarray) -> np.ndarray:
    """자홍 배경과 그 번짐을 투명으로 판정한다."""
    r, g, b = (rgb[..., i].astype(np.int32) for i in range(3))
    magenta = (r > 150) & (b > 150) & (g < 110) & (np.abs(r - b) < 90)
    fringe = (r - g > 90) & (b - g > 90) & (np.abs(r - b) < 70)
    return ~(magenta | fringe)


def quantize_opaque(rgb: np.ndarray, mask: np.ndarray, colors: int) -> tuple[np.ndarray, np.ndarray]:
    """불투명 영역만 팔레트로 줄여 인덱스 맵과 팔레트를 돌려준다."""
    pixels = rgb[mask]
    strip = Image.fromarray(pixels.reshape(1, -1, 3).astype(np.uint8), "RGB")
    quant = strip.quantize(colors=colors, method=Image.Quantize.MAXCOVERAGE, dither=Image.Dither.NONE)
    palette = np.array(quant.getpalette()[: colors * 3], dtype=np.int32).reshape(-1, 3)
    index = np.full(mask.shape, -1, dtype=np.int32)
    index[mask] = np.array(quant).reshape(-1)
    return index, palette


def downsample(index: np.ndarray, width: int) -> np.ndarray:
    """원본 한 블록의 중앙부 최빈 팔레트 색으로 게임 픽셀 하나를 정한다."""
    h, w = index.shape
    scale = w / width
    height = max(1, round(h / scale))
    out = np.full((height, width), -1, dtype=np.int32)
    for j in range(height):
        for i in range(width):
            x0, x1 = i * scale, (i + 1) * scale
            y0, y1 = j * scale, (j + 1) * scale
            inset = scale * 0.2
            block = index[int(y0 + inset): max(int(y0 + inset) + 1, int(y1 - inset)),
                          int(x0 + inset): max(int(x0 + inset) + 1, int(x1 - inset))]
            values = block.reshape(-1)
            opaque = values[values >= 0]
            if opaque.size * 2 < values.size:
                continue
            out[j, i] = np.bincount(opaque).argmax()
    return out


def luminance(color: np.ndarray) -> float:
    return float(0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2]) / 255.0


def clean(index: np.ndarray) -> np.ndarray:
    """외톨이 픽셀을 없애고 몸 안쪽의 한 칸 구멍을 메운다."""
    opaque = index >= 0
    padded = np.pad(opaque, 1)
    neighbors = sum(np.roll(np.roll(padded, dy, 0), dx, 1)
                    for dy in (-1, 0, 1) for dx in (-1, 0, 1) if dy or dx)[1:-1, 1:-1]
    out = index.copy()
    out[opaque & (neighbors <= 1)] = -1
    holes = ~opaque & (neighbors >= 7)
    if holes.any():
        padded_index = np.pad(index, 1, constant_values=-1)
        for y, x in zip(*np.nonzero(holes)):
            around = padded_index[y: y + 3, x: x + 3].reshape(-1)
            around = around[around >= 0]
            out[y, x] = np.bincount(around).argmax()
    return out


def despeckle(index: np.ndarray, palette: np.ndarray) -> np.ndarray:
    """주변과 이어지지 않는 한 칸짜리 음영 잡티를 이웃 다수 색으로 흡수한다.

    눈동자·하이라이트처럼 주변과 명도 차가 큰 점은 특징이므로 남긴다.
    """
    h, w = index.shape
    out = index.copy()
    lum = np.array([luminance(c) for c in palette])
    for y in range(1, h - 1):
        for x in range(1, w - 1):
            value = index[y, x]
            if value < 0:
                continue
            cross = [index[y - 1, x], index[y + 1, x], index[y, x - 1], index[y, x + 1]]
            if value in cross or min(cross) < 0:
                continue
            ring = index[y - 1: y + 2, x - 1: x + 2].reshape(-1)
            ring = ring[(ring >= 0) & (ring != value)]
            major = np.bincount(ring).argmax()
            if abs(lum[major] - lum[value]) < 0.28:
                out[y, x] = major
    return out


def to_rgba(index: np.ndarray, palette: np.ndarray, outline: np.ndarray) -> np.ndarray:
    """팔레트 인덱스를 RGBA로 바꾸고 실루엣 가장자리를 한 가지 어두운 선으로 닫는다."""
    h, w = index.shape
    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    opaque = index >= 0
    rgba[opaque, :3] = palette[index[opaque]]
    rgba[opaque, 3] = 255
    padded = np.pad(opaque, 1)
    edge = opaque & ~(padded[:-2, 1:-1] & padded[2:, 1:-1] & padded[1:-1, :-2] & padded[1:-1, 2:])
    dark = np.array([luminance(c) for c in rgba[..., :3].reshape(-1, 3)]).reshape(h, w) < 0.2
    rgba[edge & ~dark, :3] = outline
    return rgba


def outline_color(palette: np.ndarray) -> np.ndarray:
    darkest = min(palette, key=luminance)
    navy = np.array([18, 14, 38])
    if luminance(darkest) < 0.18:
        return (darkest * 0.6 + navy * 0.4).astype(np.uint8)
    return navy.astype(np.uint8)


def sample(src: np.ndarray, sx: np.ndarray, sy: np.ndarray) -> np.ndarray:
    h, w = src.shape[:2]
    sx = np.rint(sx).astype(np.int32)
    sy = np.rint(sy).astype(np.int32)
    inside = (sx >= 0) & (sx < w) & (sy >= 0) & (sy < h)
    out = np.zeros(sx.shape + (4,), dtype=np.uint8)
    out[inside] = src[sy[inside], sx[inside]]
    return out


def deform(sprite: np.ndarray, motion: str, frame: int, count: int) -> np.ndarray:
    """정지 스프라이트를 종류별 규칙으로 변형해 한 프레임을 만든다. 머리는 오른쪽이다."""
    h, w = sprite.shape[:2]
    src = np.pad(sprite, ((PAD, PAD), (PAD, PAD), (0, 0)))
    H, W = src.shape[:2]
    ys, xs = np.mgrid[0:H, 0:W].astype(np.float32)
    phase = TAU * frame / count
    body_x = xs - PAD
    body_y = ys - PAD
    sx, sy = xs.copy(), ys.copy()
    if motion in ("fish", "school", "giant", "squid", "puff"):
        tail = np.clip((w * 0.78 - body_x) / (w * 0.78), 0.0, 1.0)
        amplitude = {"giant": 0.055, "school": 0.12, "squid": 0.1, "puff": 0.07}.get(motion, 0.085)
        amplitude = max(1.0, h * amplitude)
        sy = ys - amplitude * tail ** 1.6 * np.sin(phase - 2.4 * tail)
        if motion == "puff":
            breathe = 1.0 + 0.05 * math.sin(phase)
            sx = PAD + w / 2 + (sx - PAD - w / 2) / breathe
            sy = PAD + h / 2 + (sy - PAD - h / 2) / breathe
    elif motion in ("jelly", "octopus"):
        contract = (1.0 - math.cos(phase)) / 2.0
        bell = 0.42 if motion == "jelly" else 0.48
        cx = PAD + w / 2
        split = PAD + h * bell
        top = ys < split
        scale_x = 1.0 - 0.13 * contract
        sx = np.where(top, cx + (xs - cx) / scale_x, xs)
        depth = np.clip((ys - split) / max(1.0, h * (1.0 - bell)), 0.0, 1.0)
        sway = max(1.0, w * 0.06) * depth ** 1.3 * np.sin(phase - 3.0 * depth)
        pinch = (0.12 * contract) * (xs - cx) * depth
        sx = np.where(top, sx, xs - sway + pinch)
        sy = np.where(top, ys + h * 0.04 * contract * (1.0 - (ys - PAD) / max(1.0, h * bell)), ys - h * 0.05 * contract * depth)
    elif motion == "flap":
        cy = PAD + h / 2
        along = np.clip(body_x / max(1.0, w), 0.0, 1.0)
        squash = 1.0 - 0.22 * np.sin(phase - 2.0 * (1.0 - along)) ** 2
        sy = cy + (ys - cy) / squash
    elif motion == "glide":
        wing = np.clip(1.0 - np.abs(body_x - w * 0.55) / (w * 0.5), 0.0, 1.0)
        sy = ys - 1.4 * wing * np.sin(phase) * np.clip((body_y - h * 0.4) / (h * 0.6), 0.0, 1.0)
        sy = sy - np.round(0.6 * math.sin(phase))
    elif motion == "hover":
        lower = np.clip((body_y - h * 0.45) / (h * 0.55), 0.0, 1.0)
        sx = xs - 1.2 * lower ** 1.5 * np.sin(phase - 2.0 * lower)
        sy = ys - round(math.sin(phase))
    elif motion == "eel":
        # 머리부터 꼬리까지 온몸이 물결친다. 꼬리 쪽일수록 크게 흔든다.
        along = np.clip((w - body_x) / max(1.0, w), 0.0, 1.0)
        amplitude = max(1.0, h * 0.16)
        sy = ys - amplitude * (0.25 + 0.75 * along) * np.sin(phase - 5.0 * along)
    elif motion == "sessile":
        # 바닥에 붙어 있고 위로 갈수록 물살에 흔들린다.
        rise = np.clip(1.0 - body_y / max(1.0, h - 1.0), 0.0, 1.0)
        sx = xs - max(1.0, w * 0.05) * rise ** 1.5 * np.sin(phase + rise * 2.2)
    elif motion in ("crawl", "creep"):
        legs = body_y > h * 0.62
        bob = 1 if frame % 2 else 0
        sy = np.where(legs, ys, ys + bob)
        shift = np.where((xs.astype(np.int32) // 3 + frame) % 2 == 0, 1, -1)
        sx = np.where(legs, xs + shift * (frame % 2), xs)
    return sample(src, sx, sy)


def glow_mask(frame: np.ndarray, rule: str | None) -> np.ndarray:
    """밤에 가산 합성할 발광 픽셀만 남긴다."""
    out = np.zeros_like(frame)
    if rule is None:
        return out
    rgb = frame[..., :3].astype(np.float32) / 255.0
    alpha = frame[..., 3] > 0
    mx = rgb.max(-1)
    mn = rgb.min(-1)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    if rule == "all":
        keep = alpha & (mx > 0.35)
    elif rule == "bright":
        keep = alpha & (mx > 0.78) & ((sat > 0.35) | (mx > 0.95))
    else:
        keep = alpha & (rgb[..., 1] > 0.6) & (rgb[..., 2] > 0.8) & (rgb[..., 0] < 0.8)
    out[keep] = frame[keep]
    return out


TAU = math.tau
# 게임 코드가 정적으로 읽는 목록 JSON은 src/data에, 그림은 public/assets에 둔다(Vite는 public 파일을 import할 수 없다).
DATA = ROOT / "src/data"


def normal_map(frame: np.ndarray) -> np.ndarray:
    """실루엣 안쪽 거리로 만든 둥근 높이와 명도 결을 합쳐 픽셀 노멀맵을 만든다(y는 아래가 +)."""
    alpha = frame[..., 3] > 0
    distance = np.zeros(alpha.shape, dtype=np.float32)
    inside = alpha.copy()
    for step in range(1, 6):
        padded = np.pad(inside, 1)
        inside = inside & padded[:-2, 1:-1] & padded[2:, 1:-1] & padded[1:-1, :-2] & padded[1:-1, 2:]
        distance += inside
    height = np.sqrt(np.clip(distance / 5.0, 0.0, 1.0))
    luma = frame[..., :3].astype(np.float32).mean(-1) / 255.0
    height = height + luma * 0.18 * alpha
    padded = np.pad(height, 1, mode="edge")
    blur = sum(np.roll(np.roll(padded, dy, 0), dx, 1) for dy in (-1, 0, 1) for dx in (-1, 0, 1))[1:-1, 1:-1] / 9.0
    gy, gx = np.gradient(blur)
    normal = np.stack([-gx * 2.4, -gy * 2.4, np.ones_like(gx)], -1)
    normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
    out = np.zeros_like(frame)
    out[..., :3] = ((normal * 0.5 + 0.5) * 255).astype(np.uint8)
    out[..., 3] = frame[..., 3]
    return out


def subject_mask(source: str) -> tuple[np.ndarray, np.ndarray]:
    """원본 그림의 RGB와 생물 부분 마스크(투명 배경이면 알파, 아니면 배경색 제거)다."""
    raw = np.array(Image.open(RAW / f"{source}.png" if "/" not in source else ROOT / source).convert("RGBA"))
    rgb = raw[..., :3]
    if (raw[..., 3] < 16).mean() > 0.2:
        return rgb, raw[..., 3] > 170
    return rgb, key_background(rgb)


def subject_width(source: str) -> int:
    """원본 그림에서 생물이 차지하는 가로 폭(원본 픽셀)이다."""
    xs = np.nonzero(subject_mask(source)[1].any(0))[0]
    return int(xs.max() - xs.min() + 1)


def bake_sheet(sid: str, source: str, width: int, motion: str, flip: bool = False) -> tuple[list[np.ndarray], int, int]:
    """원본 한 장을 게임 폭 픽셀 스프라이트로 줄이고 동작 프레임을 만든다."""
    rgb, mask = subject_mask(source)
    ys, xs = np.nonzero(mask)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    rgb, mask = rgb[y0:y1, x0:x1], mask[y0:y1, x0:x1]
    if flip:
        rgb, mask = rgb[:, ::-1], mask[:, ::-1]
    index, palette = quantize_opaque(rgb, mask, 32)
    small = despeckle(clean(downsample(index, width)), palette)
    rows = np.nonzero((small >= 0).any(1))[0]
    cols = np.nonzero((small >= 0).any(0))[0]
    small = small[rows.min(): rows.max() + 1, cols.min(): cols.max() + 1]
    sprite = to_rgba(small, palette, outline_color(palette))
    count = FRAMES[motion]
    frames = [deform(sprite, motion, k, count) for k in range(count)]
    return frames, frames[0].shape[1], frames[0].shape[0]


def save_lit_sheet(name: str, frames: list[np.ndarray]) -> tuple[str, str]:
    """조명 셰이더(`src/render/shaders/lit.frag`)가 쓰는 색 시트와 노멀 시트를 저장하고 두 경로를 돌려준다."""
    Image.fromarray(np.concatenate(frames, axis=1), "RGBA").save(OUT / f"{name}.png")
    normals = np.concatenate([normal_map(frame) for frame in frames], axis=1)
    Image.fromarray(normals, "RGBA").save(OUT / f"{name}-normal.png")
    texture = f"assets/species/{name}.png"
    normal = f"assets/species/{name}-normal.png"
    return texture, normal


def build(entry: tuple, group: str, visitor: bool = False) -> dict:
    sid, name_en, name_ko, width, motion, activity, glow, flip = entry
    frames, fw, fh = bake_sheet(sid, sid, width, motion, flip or sid in FLIP)
    count = len(frames)
    texture, normal = save_lit_sheet(sid, frames)
    record = {
        "id": sid, "name_en": name_en, "name_ko": name_ko, "motion": motion,
        "activity": activity, "frame_w": fw, "frame_h": fh, "frames": count,
        "texture": texture, "normal": normal, "glow": False,
        "group": group, "visitor": visitor,
    }
    # 발광 규칙에 맞는 픽셀이 없으면(그림에 밝은 발광점이 없으면) 발광 없이 둔다.
    lit = glow_mask(frames[0], glow)[..., 3] > 0 if glow is not None else None
    if lit is not None and lit.sum() >= 2:
        glow_sheet = np.concatenate([glow_mask(f, glow) for f in frames], axis=1)
        Image.fromarray(glow_sheet, "RGBA").save(OUT / f"{sid}-glow.png")
        record["glow"] = True
        record["glow_texture"] = f"assets/species/{sid}-glow.png"
        gy, gx = np.nonzero(lit)
        record["glow_center"] = [float(gx.mean()) - fw / 2, float(gy.mean()) - fh / 2]
    if sid == "pufferfish":
        # 포식자가 다가오거나 교감하면 바꿔 그리는 부푼 모습. 같은 프레임 수와 노멀 시트를 쓴다.
        puffed, pw, ph = bake_sheet("pufferfish-puffed", "pufferfish-puffed", round(width * 1.3), motion)
        save_lit_sheet("pufferfish-puffed", puffed)
        record["alt"] = {"texture": "assets/species/pufferfish-puffed.png", "frame_w": pw, "frame_h": ph, "kind": "puff"}
    elif (RAW / f"{sid}-pose.png").exists():
        # 교감(오른쪽 클릭) 때 바꿔 그리는 자세(집게 들기·진주 보이기). 원본과 같은 배율로 줄여 몸 크기를 맞춘다.
        pose_width = round(width * subject_width(f"{sid}-pose") / subject_width(sid))
        posed, pw, ph = bake_sheet(f"{sid}-pose", f"{sid}-pose", pose_width, motion, flip or sid in FLIP)
        save_lit_sheet(f"{sid}-pose", posed)
        record["alt"] = {"texture": f"assets/species/{sid}-pose.png", "frame_w": pw, "frame_h": ph, "kind": "pose"}
    return record


MOTION_KO = {
    "eel": "온몸 물결 유영", "creep": "바닥 기어가기", "sessile": "바닥에 붙어 흔들림", "rigid": "고정",
    "fish": "꼬리 물결 유영", "puff": "통통 부푸는 유영", "school": "무리 유영", "hover": "제자리 부유",
    "jelly": "갓 수축 추진", "glide": "지느러미 활공", "flap": "날개 펄럭임", "giant": "느린 대형 유영",
    "octopus": "다리 물결 추진", "crawl": "바닥 옆걸음", "squid": "분사 추진",
}
ACTIVITY_KO = {"day": "낮", "night": "밤", "any": "낮·밤"}


def write_book(catalog: list[dict]) -> None:
    """첫 프레임을 4배 확대한 썸네일과 도감 표를 만든다."""
    DOC.mkdir(parents=True, exist_ok=True)
    rows = [f"# 생물 도감 ({len(catalog)}종)", "", "모든 스프라이트는 오른쪽을 바라보는 게임 해상도 원본이며, 런타임이 왼쪽으로 갈 때만 뒤집는다.", "",
            "| 그림 | ID | 이름 | 동작 | 시간대 | 프레임 | 발광 |", "|---|---|---|---|---|---|---|"]
    for entry in catalog:
        sheet = Image.open(ROOT / "public" / entry["texture"])
        first = sheet.crop((0, 0, entry["frame_w"], entry["frame_h"]))
        first.resize((entry["frame_w"] * 4, entry["frame_h"] * 4), Image.Resampling.NEAREST).save(DOC / f"{entry['id']}.png")
        rows.append(
            f"| ![{entry['name_ko']}](species/{entry['id']}.png) | `{entry['id']}` | {entry['name_ko']} ({entry['name_en']}) "
            f"| {MOTION_KO[entry['motion']]} | {ACTIVITY_KO[entry['activity']]} | {entry['frames']} "
            f"| {'예' if entry['glow'] else ''} |")
    (DOC.parent / "species.md").write_text("\n".join(rows) + "\n")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    catalog = []
    visitors = []
    entries = [(entry, EXISTING_GROUPS[entry[0]], False) for entry in SPECIES]
    entries += [((vid, name_en, name_ko, width, motion, "any", None, False), EXISTING_GROUPS[vid], True)
                for vid, name_en, name_ko, width, motion in VISITORS]
    entries += [((sid, en, ko, width, motion, activity, glow, False), group, visitor)
                for sid, en, ko, group, motion, activity, width, glow, visitor, _, _ in NEW]
    for entry, group, visitor in entries:
        if not (RAW / f"{entry[0]}.png").exists():
            print(f"skip {entry[0]}: raw art missing")
            continue
        record = build(entry, group, visitor)
        (visitors if visitor else catalog).append(record)
        print(f"{record['id']:28} {record['frame_w']}x{record['frame_h']} x{record['frames']} {group}")
    DATA.mkdir(parents=True, exist_ok=True)
    (DATA / "catalog.json").write_text(json.dumps(catalog, ensure_ascii=False, indent=1) + "\n")
    write_book(catalog + [entry for entry in visitors if entry["id"] != "diver"])
    (DATA / "visitors.json").write_text(json.dumps(visitors, ensure_ascii=False, indent=1) + "\n")
    fx = ROOT / "public/assets/fx"
    events = {}
    for name, width, motion in FAR_SHEETS:
        frames, fw, fh = bake_sheet(name, f"art/events/{name}.png", width, motion)
        Image.fromarray(np.concatenate(frames, axis=1), "RGBA").save(fx / f"{name}.png")
        events[name] = {"texture": f"assets/fx/{name}.png", "w": fw, "h": fh, "frames": len(frames)}
    for name, width in ITEMS:
        frames, fw, fh = bake_sheet(name, f"art/events/{name}.png", width, "rigid")
        Image.fromarray(frames[0], "RGBA").save(fx / f"{name}.png")
        events[name] = {"texture": f"assets/fx/{name}.png", "w": fw, "h": fh, "frames": 1}
    (DATA / "events.json").write_text(json.dumps(events, indent=1) + "\n")
    print("event sheets:", ", ".join(f"{k} {v['w']}x{v['h']}" for k, v in events.items()))
    # 희귀 이벤트 전용 먼 배경 고래. 도감 20종에는 넣지 않는다.
    whale, ww, wh = bake_sheet("humpback-whale", "art/humpback-whale.png", 190, "giant")
    Image.fromarray(np.concatenate(whale, axis=1), "RGBA").save(ROOT / "public/assets/fx/whale.png")
    print(f"whale              {ww}x{wh} x{len(whale)}")


if __name__ == "__main__":
    main()
