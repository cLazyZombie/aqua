#!/usr/bin/env python3
"""생물 스프라이트·노멀·발광 시트, 빛·물 효과, 산호·해초 소품, 목록 JSON(src/data)의 계약을 확인한다."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
DATA = ROOT / "src/data"
WORLD = (480, 270)


def frames_of(path: Path, count: int) -> list[Image.Image]:
    sheet = Image.open(path)
    assert sheet.mode == "RGBA", path
    assert sheet.width % count == 0, path
    width = sheet.width // count
    return [sheet.crop((k * width, 0, (k + 1) * width, sheet.height)) for k in range(count)]


def main() -> None:
    catalog = json.loads((DATA / "catalog.json").read_text())
    visitors = json.loads((DATA / "visitors.json").read_text())
    sys.path.insert(0, str(ROOT / "scripts"))
    from species_table import NEW
    from build_sprites import VISITORS
    expected = {entry[0] for entry in NEW} | {entry[0] for entry in VISITORS} | {"clownfish", "blue-tang", "yellow-tang", "moorish-idol", "emperor-angelfish",
                                                "pufferfish", "lionfish", "mandarinfish", "sardine", "seahorse", "moon-jelly",
                                                "sea-nettle", "green-turtle", "manta-ray", "hammerhead", "dolphin", "octopus",
                                                "red-crab", "anglerfish", "firefly-squid", "whale-shark", "sunfish",
                                                "baby-turtle", "oarfish", "diver"}
    ids = [entry["id"] for entry in catalog + visitors]
    assert len(ids) == len(set(ids)), "duplicate species id"
    assert set(ids) == expected, f"missing {expected - set(ids)}, extra {set(ids) - expected}"
    assert all(entry.get("group") for entry in catalog + visitors), "every creature needs an event group"
    for entry in catalog + visitors:
        frames = frames_of(PUBLIC / entry["texture"], entry["frames"])
        assert frames[0].size == (entry["frame_w"], entry["frame_h"]), entry["id"]
        assert all(frame.getpixel((0, 0))[3] == 0 for frame in frames), entry["id"]
        assert all(frame.getchannel("A").getbbox() for frame in frames), entry["id"]
        # 실제로 헤엄치는지: 인접 프레임이 모두 같으면 정지 그림이다.
        moving = sum(bool(ImageChops.difference(a, b).getbbox()) for a, b in zip(frames, frames[1:]))
        assert moving >= len(frames) // 2, f"{entry['id']} barely animates"
        # 게임 픽셀 스케일: 사건 방문자(대형 고래)를 빼면 월드 폭의 30%를 넘지 않는다.
        if not entry.get("visitor"):
            assert entry["frame_w"] <= WORLD[0] * 0.3 and entry["frame_h"] <= WORLD[1] * 0.35, entry["id"]
        normals = frames_of(PUBLIC / entry["normal"], entry["frames"])
        assert normals[0].size == frames[0].size, f"{entry['id']} normal sheet size"
        if entry["glow"]:
            glow = frames_of(PUBLIC / entry["glow_texture"], entry["frames"])
            assert glow[0].size == frames[0].size, entry["id"]
            assert glow[0].getchannel("A").getbbox(), f"{entry['id']} glow is empty"
    for name, size in [("shadow.png", (32, 8)), ("whale.png", (196 * 8, 81)),
                       ("background.png", WORLD), ("vignette.png", (588, 270)), ("haze.png", (1, 270)),
                       ("skylight.png", (1, 270)), ("surface.png", (240 * 8, 30)), ("rays.png", (56 * 3, 250)),
                       ("bubbles.png", (21, 7))]:
        image = Image.open(PUBLIC / "assets/fx" / name)
        assert image.size == size, f"{name}: {image.size}"
    # 배경 컨셉: 층마다 크기가 맞고, 먼 배경은 불투명, 중간 바위는 가운데 위가 비어 있어야 한다.
    scenes = json.loads((DATA / "scenes.json").read_text())
    assert "reef" in scenes and len(scenes) >= 4, scenes
    for scene in scenes:
        # 층은 무대 기준 크기에 휴대폰 가로 화면용 양옆 여백(55px씩)을 거울로 이어 붙인 폭이다. 물결 빛은 보이는 월드 폭(588)이다.
        for layer, size in (("far", (610, 282)), ("deep", (610, 170)), ("back", (622, 230)), ("mid", (622, 288)),
                            ("floor", (622, 48)), ("caustics", (588 * 8, 48))):
            image = Image.open(PUBLIC / "assets/fx" / f"scene-{scene}-{layer}.png").convert("RGBA")
            assert image.size == size, f"{scene} {layer}: {image.size}"
        far = Image.open(PUBLIC / "assets/fx" / f"scene-{scene}-far.png").convert("RGBA")
        assert far.getchannel("A").getextrema() == (255, 255), f"{scene} far must be opaque"
        mid = Image.open(PUBLIC / "assets/fx" / f"scene-{scene}-mid.png").convert("RGBA")
        center = mid.crop((200, 20, 312, 140)).getchannel("A")
        assert np.asarray(center).mean() / 255 < 0.15, f"{scene} mid layer must leave the center open"
    props = json.loads((DATA / "props.json").read_text())
    assert len(props) >= 32, len(props)
    for prop in props:
        sheet = Image.open(PUBLIC / prop["texture"])
        assert sheet.size == (prop["w"] * prop["frames"], prop["h"]), prop["texture"]
        assert sheet.getpixel((0, 0))[3] == 0, prop["texture"]
        assert prop["kind"] in ("tall", "prop", "clam"), prop["texture"]
        assert prop["scenes"] and set(prop["scenes"]) <= set(scenes) | {"reef", "kelp", "wreck", "ruins", "ice"}, prop["texture"]
        if prop["kind"] == "clam":
            assert prop["frames"] == 3, prop["texture"]
    # 컨셉마다 키 큰 풀·소품·조개가 충분해야 배치가 단조롭지 않다.
    for scene in scenes:
        kinds = [prop["kind"] for prop in props if scene in prop["scenes"]]
        assert kinds.count("prop") >= 8 and kinds.count("clam") >= 3 and kinds.count("tall") >= 2, (scene, kinds)
    events = json.loads((DATA / "events.json").read_text())
    for name in ("giant-squid", "submarine", "anchor", "chest-closed", "chest-open", "bottle", "basket"):
        sheet = Image.open(PUBLIC / events[name]["texture"])
        assert sheet.size == (events[name]["w"] * events[name]["frames"], events[name]["h"]), name
        assert sheet.getpixel((0, 0))[3] == 0, name
    for name, size in (("cone.png", (120, 60)), ("spot.png", (64, 64))):
        assert Image.open(PUBLIC / "assets/fx" / name).size == size, name
    shader = (ROOT / "src/render/shaders/underwater.frag").read_text()
    size = int(shader.split("const int PALETTE_SIZE = ")[1].split(";")[0])
    assert size >= 96, f"palette too small: {size}"
    glowing = sum(entry["glow"] for entry in catalog)
    print(f"Asset QC PASS: {len(catalog)} lit species ({glowing} glowing) + {len(visitors)} visitors, "
          f"{len(scenes)} scenes, {len(events)} event sheets, {len(props)} props, {size}-color palette")


if __name__ == "__main__":
    main()
