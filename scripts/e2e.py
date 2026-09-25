#!/usr/bin/env python3
"""빌드한 게임을 headless Chromium으로 캡처해 타이틀·낮밤·사건·창 크기·픽셀 격자를 검증한다."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageStat


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output/capture"


def load(name: str) -> tuple[Image.Image, dict]:
    image = Image.open(OUTPUT / f"{name}.png").convert("RGB")
    return image, json.loads((OUTPUT / f"{name}.json").read_text())


def diff(a: Image.Image, b: Image.Image) -> float:
    return ImageStat.Stat(ImageChops.difference(a, b)).mean[0]


def clipped(pixels: np.ndarray) -> float:
    """세 채널 모두 235 이상으로 하얗게 탄 픽셀 비율(%)이다."""
    return float((pixels.min(2) >= 235).mean() * 100)


def check_glow() -> None:
    """발광원 전수 검사: 은은하게(하얗게 타지 않게) 빛나되, 빛은 보여야 한다."""
    catalog = {entry["id"]: entry for entry in json.loads((ROOT / "src/data/catalog.json").read_text())}
    glowers = [sid for sid, entry in catalog.items() if entry["glow"]]
    assert len(glowers) >= 17
    for sid in glowers:
        peaks = []
        for suffix in ("", "-react"):
            image, report = load(f"glow-{sid}{suffix}")
            assert report["night"] > 0.9
            pixels = np.asarray(image).astype(int)
            # 포인터 자리에 부른 개체(무리면 그 둘레 무리)만 본다.
            mine = [c for c in report["active_creatures"] if c["id"] == sid]
            near = min(mine, key=lambda c: (c["x"] - 240) ** 2 + (c["y"] - 125) ** 2)
            group = [c for c in mine if (c["x"] - near["x"]) ** 2 + (c["y"] - near["y"]) ** 2 < 90 ** 2] if near["school"] else [near]
            x = int(np.mean([c["x"] for c in group]) * 2)
            y = int(np.mean([c["y"] for c in group]) * 2)
            w, h = catalog[sid]["frame_w"], catalog[sid]["frame_h"]
            crop = pixels[max(0, y - h * 2 - 40): y + h * 2 + 40, max(0, x - w * 2 - 40): x + w * 2 + 40]
            burnt = clipped(crop)
            assert burnt < 0.5, f"{sid}{suffix}: glow burns white ({burnt:.2f}%)"
            background = pixels[380:440, 420:540].mean()
            peak = float(np.percentile(crop.mean(2), 99))
            assert peak > background + 20, f"{sid}{suffix}: glow is invisible ({peak:.0f} vs {background:.0f})"
            # 번뜩임은 몸 둘레 좁은 영역의 평균 밝기로 본다(옆을 지나는 다른 발광 생물에 흔들리지 않게).
            body = pixels[max(0, y - h - 8): y + h + 8, max(0, x - w - 8): x + w + 8]
            peaks.append(float(body.mean()))
        assert peaks[1] > peaks[0], f"{sid}: right-click should make the glow flare ({peaks[0]:.1f} -> {peaks[1]:.1f})"
    # 밤 장면·손전등·잠수부 불빛·밤 사건(등불·빛나는 물결·산호 알·유성 등)은 화면 어디도 하얗게 타지 않는다.
    night_events = ["angler-lantern", "ink-escape", "jelly-bloom", "giant-squid", "coral-spawn", "glow-wave",
                    "meteor-shower", "submarine", "deep-visitors"]
    for name in ["night", "night-rings", "night-jelly", "flashlight", "event-diver", "event-coral-spawn"] + [
            f"glow-event-{event}" for event in night_events]:
        image, _ = load(name)
        burnt = clipped(np.asarray(image).astype(int))
        assert burnt < 0.1, f"{name}: light burns white ({burnt:.3f}%)"


def check_ambient() -> None:
    """소소한 볼거리: 은빛 반짝임, 수면 반사, 달, 바닥 빛 웅덩이, 바다눈, 색 변이·단골 개체, 꿈꾸는 문어, 발자국, 기포 터뜨리기."""
    # 유리를 두드려 무리가 돌아서면 은빛 반짝임(흰 점)이 생긴다.
    glint, glint_report = load("ambient-glint")
    school = [c for c in glint_report["active_creatures"] if c["id"] == "sardine"]
    x = int(np.mean([c["x"] for c in school]) * 2)
    y = int(np.mean([c["y"] for c in school]) * 2)
    crop = np.asarray(glint).astype(int)[max(0, y - 90): y + 90, max(0, x - 120): x + 120]
    sparkles = int(((crop[..., 0] > 240) & (crop[..., 1] > 240) & (crop[..., 2] > 200)).sum())
    assert sparkles >= 4, f"silver school should glint when it turns ({sparkles})"
    # 수면에 닿은 돌고래가 수면선 위에 거꾸로 옅게 비친다(그 자리 수면 띠가 옆보다 어둡다).
    mirror, mirror_report = load("ambient-mirror")
    dolphin = next(c for c in mirror_report["active_creatures"] if c["id"] == "dolphin")
    pixels = np.asarray(mirror).astype(int)
    dx = int(dolphin["x"] * 2)
    above = pixels[10:24, dx - 40: dx + 40].mean()
    beside = pixels[10:24, max(0, dx - 200): dx - 120].mean()
    assert above < beside - 3, f"surface reflection missing ({above:.0f} vs {beside:.0f})"
    # 첫 밤은 보름달이 스넬의 창 자리(오른쪽 위)에 뜬다.
    moon, _ = load("ambient-moon")
    top = np.asarray(moon).astype(int)[0:40, 680:860]
    assert int((top.min(2) > 180).sum()) >= 20, "full moon should shine through the surface"
    # 바닥 가까운 발광 해파리 아래 모래가 옆 모래보다 밝다.
    pool, pool_report = load("ambient-floor-glow")
    jelly = next(c for c in pool_report["active_creatures"] if c["id"] == "atolla-jelly")
    jx = int(jelly["x"] * 2)
    sand = np.asarray(pool).astype(int)[500:516]
    assert sand[:, jx - 16: jx + 16].mean() > sand[:, max(0, jx - 200): jx - 150].mean() + 4, "glow should pool on the sand"
    # 밤 손전등 안에서 바다눈이 하얗게 떠오른다.
    torch, torch_report = load("flashlight")
    assert torch_report["night"] > 0.5
    # 희귀 색 변이와 단골 개체는 호버 이름에 드러난다. 황금 개체는 몸이 금빛이다.
    golden, golden_report = load("ambient-golden")
    assert golden_report["hover"] == "황금 흰동가리", golden_report["hover"]
    body = np.asarray(golden).astype(int)[220:280, 440:540].reshape(-1, 3)
    gold = body[(body[:, 0] > 180) & (body[:, 1] > 120) & (body[:, 2] < 110)]
    assert len(gold) > 80, "golden variant should look golden"
    assert load("ambient-albino")[1]["hover"] == "알비노 흰동가리"
    assert load("ambient-melanistic")[1]["hover"] == "흑색 흰동가리"
    assert load("ambient-regular")[1]["hover"] == "고래상어 · 별무늬"
    # 새벽에 문어가 잠들어 꿈꾼다.
    _, dream = load("ambient-dream")
    assert any(c["id"] == "octopus" and c["mood"] == "dream" for c in dream["active_creatures"])
    # 포인터를 기포 줄기에 두면 기포가 톡 터진다. 게가 걸으면 모래에 발자국이 남는다.
    assert load("ambient-pop")[1]["popped"] > 0
    # 먼 층 생물은 불투명하게 그리고 물색 안개로 가라앉힌다(뒤 켈프가 몸을 뚫고 보이지 않게). 캡처는 눈으로 확인한다.
    _, far = load("far-shark")
    assert any(c["id"] == "leopard-shark" and c["depth"] == 0 for c in far["active_creatures"]), "far shark missing"
    assert load("whale-dusk")[1]["prints"] > 0


def check_scenes() -> None:
    """배경 컨셉 5종: 서로 다르게 보이고, 배치 시드가 바뀌면 소품 자리가 바뀌고, 밤에도 하얗게 타지 않고, 조개가 여닫힌다."""
    ids = ["reef", "kelp", "wreck", "ruins", "ice"]
    days = {}
    for scene in ids:
        image, report = load(f"scene-{scene}")
        assert report["scene"] == scene, (scene, report["scene"])
        days[scene] = image
        w, h = image.size
        for box in ((0, h // 2 - 60, 60, h // 2 + 60), (w - 60, h // 2 - 60, w, h // 2 + 60)):
            assert max(ImageStat.Stat(image.crop(box)).mean) > 30, f"{scene}: black bar at {box}"
        night, night_report = load(f"scene-{scene}-night")
        assert night_report["night"] > 0.9
        burnt = clipped(np.asarray(night).astype(int))
        assert burnt < 0.1, f"{scene} night burns white ({burnt:.3f}%)"
    for i, a in enumerate(ids):
        for b in ids[i + 1:]:
            assert diff(days[a], days[b]) > 8, f"{a} and {b} look too alike"
    shuffled, _ = load("scene-kelp-layout")
    bottom = (0, 300, 960, 540)
    assert diff(days["kelp"].crop(bottom), shuffled.crop(bottom)) > 4, "another layout seed should move the props"
    _, clams = load("scene-reef-clams")
    states = [clam["open"] for clam in clams["clams"]]
    assert 2 <= len(states) <= 4 and min(states) == 0 and max(states) >= 1, states


def check_vignettes() -> None:
    """사건 2부 31종: 찍은 순간에도 사건이 이어지고, 출연진이 남아 있고, 무대 장치가 켜져 있고, 밤 빛이 하얗게 타지 않는다."""
    listing = subprocess.run(
        ["node", "-e", "import('./scripts/scenarios.mjs').then(m => console.log(JSON.stringify(m.EXTRA_EVENT_SCENARIOS)))"],
        cwd=ROOT, check=True, capture_output=True, text=True)
    scenarios = json.loads(listing.stdout)
    assert len(scenarios) == 31, len(scenarios)
    # 사건마다 켜져 있어야 하는 무대 장치다.
    stage = {"manta-campfire": "beam", "dolphin-kelp": "toy", "pearl-night": "pearls", "octopus-garden": "trinkets",
             "goby-shrimp": "burrow", "sun-flecks": "sunflecks", "wreck-gold": "wreck_glow", "rune-glow": "runes",
             "aurora": "aurora", "shell-swap": "shell", "clown-eggs": "nest", "duck-flotilla": "floaters",
             "coral-planting": "planted"}
    for scenario in scenarios:
        event = scenario["event"]
        image, report = load(scenario["name"])
        assert report["event"] == event, f"{event}: event ended before the capture ({report['event']})"
        assert report["scene"] == scenario.get("scene", "reef"), (event, report["scene"])
        if event in stage:
            assert report["setpiece"][stage[event]], f"{event}: {stage[event]} is off"
        # 밤 사건의 빛만 본다(낮에는 흰고래처럼 원래 하얀 몸이 있다).
        if report["night"] > 0.9:
            burnt = clipped(np.asarray(image).astype(int))
            assert burnt < 0.1, f"{event}: light burns white ({burnt:.3f}%)"
    # 출연진은 사건 중에 사라지지 않는다(해녀·다이버·인어도 제자리에 있다).
    for event, species in [("haenyeo-dive", "haenyeo"), ("sumbi-chorus", "haenyeo"), ("coral-planting", "diver"),
                           ("turtle-buddy", "diver"), ("diver-rings", "diver"), ("mermaid-song", "mermaid"),
                           ("mermaid-ring", "mermaid"), ("mermaid-pearl", "mermaid"), ("penguin-dive", "adelie-penguin")]:
        _, report = load(f"vignette-{event}")
        assert any(c["id"] == species and -20 < c["x"] < 500 for c in report["cast"]), f"{event}: {species} missing"
    # 제주 돌고래는 큰돌고래가 해녀를 따른다.
    _, jeju = load("vignette-haenyeo-dolphins")
    assert sorted(c["id"] for c in jeju["cast"]) == ["dolphin", "dolphin", "haenyeo"], jeju["cast"]
    # 오로라와 불꽃은 비네트 위에서도 보인다(같은 밤 장면보다 위쪽이 밝다).
    aurora = np.asarray(load("vignette-aurora")[0]).astype(int)[0:70]
    plain = np.asarray(load("scene-ice-night")[0]).astype(int)[0:70]
    assert aurora[..., 1].mean() > plain[..., 1].mean() + 8, "aurora should glow above the ice"
    sky = np.asarray(load("vignette-fireworks")[0]).astype(int)[0:120]
    sparks = int(((sky.max(2) > 170) & (sky.max(2) - sky.min(2) > 60)).sum())
    assert sparks > 500, f"fireworks too faint ({sparks})"
    # 흰동가리 알은 모래 위에 주황빛으로 보인다.
    eggs, eggs_report = load("vignette-clown-eggs")
    ex = int(np.mean([c["x"] for c in eggs_report["cast"]]) * 2)
    patch = np.asarray(eggs).astype(int)[488:512, max(0, ex - 36): ex + 36].reshape(-1, 3)
    assert int(((patch[:, 0] > 200) & (patch[:, 1] > 100) & (patch[:, 1] < 190) & (patch[:, 2] < 140)).sum()) > 60, "clownfish eggs hidden"


def main() -> None:
    subprocess.run(["node", "scripts/capture.mjs"], cwd=ROOT, check=True)
    title, title_report = load("title")
    entered = Image.open(OUTPUT / "title-entered.png").convert("RGB")
    day, day_report = load("day")
    moving_day, moving_report = load("day-motion")
    whale, whale_report = load("whale-dusk")
    night, night_report = load("night")
    dawn, dawn_report = load("dawn")
    storm, storm_report = load("storm-flash")
    reports = [title_report, day_report, whale_report, night_report, dawn_report, storm_report]
    catalog = len(json.loads((ROOT / "src/data/catalog.json").read_text()))
    assert all(report["catalog_count"] == catalog >= 20 for report in reports)
    assert title_report["started"] is False and day_report["started"] is True
    # 타이틀에서 시작하면 글자만 사라지고 장면은 그대로다.
    assert diff(title.crop((320, 150, 640, 310)), entered.crop((320, 150, 640, 310))) > 5.0
    assert diff(title.crop((0, 0, 960, 100)), entered.crop((0, 0, 960, 100))) < 0.1
    assert title_report["school_count"] >= 20, "boids school should hold a bait ball"
    assert night_report["daylight"] < 0.1 and night_report["glowing_count"] > 0
    assert whale_report["whale"] is True, "rare whale should pass during dusk"
    assert storm_report["storm"] > 0.9 and storm_report["flash"] > 0.5, "lightning should flash"
    solo = lambda report: [c for c in report["active_creatures"] if not c["school"]]
    assert all(4 <= len(solo(report)) <= 30 for report in reports)
    assert set(day_report["active_species"]) != set(night_report["active_species"])
    assert all(image.size == (960, 540) for image in (title, day, whale, night, dawn, storm))
    assert diff(title, day) > 1.0 and diff(day, night) > 10.0 and diff(day, moving_day) > 0.15
    assert ImageStat.Stat(storm.convert("L")).mean[0] > ImageStat.Stat(dawn.convert("L")).mean[0], "flash brightens"
    paired = zip(day_report["active_creatures"], moving_report["active_creatures"])
    moved = [(a, b) for a, b in paired if a["id"] == b["id"] and abs(a["x"] - b["x"]) > 0.3]
    assert len(moved) >= 6
    # 좌우로 헤엄치는 생물은 방금 움직인 방향을 바라봐야 한다(뒤로 헤엄치기 금지).
    for a, b in moved:
        if not a["school"] and a["motion"] not in ("jelly", "octopus", "crawl", "sessile") and a["facing"] == b["facing"]:
            assert (b["x"] - a["x"]) * b["facing"] > 0, f"{a['id']} swims backwards"
    # 수중 후처리가 월드 픽셀 중심에서만 읽으므로 모든 화면 픽셀은 2x2 블록 단위로 같아야 한다.
    for image in (day, night, storm):
        halves = image.resize((480, 270), Image.Resampling.NEAREST).resize((960, 540), Image.Resampling.NEAREST)
        assert diff(image, halves) < 0.5
    # 빈 곳에 마우스를 올리면 아무것도 그리지 않고, 빈 곳에 먹이를 뿌리면 가루 먹이가 생긴다.
    hovered, hover_report = load("hover")
    if hover_report["hover"] is None:
        assert diff(hovered, whale) < 0.1, "hovering empty water must not draw anything"
    _, fed = load("feeding")
    assert fed["food_count"] > 0
    # 생물에 마우스를 올리면 연노랑 테두리와 이름이 뜬다.
    named, named_report = load("hover-name")
    assert named_report["hover"] == "흰동가리", named_report["hover"]
    crop = np.asarray(named.crop((520, 160, 720, 300)))
    yellow = int(((crop[..., 0] > 200) & (crop[..., 1] > 200) & (crop[..., 2] < 190)).sum())
    assert yellow > 40, "hover outline should be pale yellow"
    # 오른쪽 클릭 교감: 게는 집게를 들고, 복어는 부풀고, 조개는 진주를 보이고, 돌고래는 수면으로 솟구치고,
    # 무리는 하트 대형을 만든다. 왼쪽 클릭은 그 생물 먹이를 주고 먹으면 하트가 뜬다.
    moods = lambda report, sid: [c["mood"] for c in report["active_creatures"] if c["id"] == sid]
    assert "claws" in moods(load("react-crab")[1], "red-crab")
    _, puffer = load("react-puffer")
    assert any(c["id"] == "pufferfish" and c["puffed"] for c in puffer["active_creatures"])
    assert "pearl" in moods(load("react-clam")[1], "giant-clam")
    _, dolphin = load("react-dolphin")
    assert any(c["id"] == "dolphin" and c["mood"] == "leap" and c["y"] < 45 for c in dolphin["active_creatures"])
    assert moods(load("react-school")[1], "blue-green-chromis").count("heart") >= 10
    _, treat = load("treat-turtle")
    assert treat["hearts"] >= 1, "the turtle should thank for its sea-grass leaves"
    # 밤에는 강한 발광 생물이 둥근 빛 고리를 두른다(고리 바깥까지 밝아진다).
    rings, rings_report = load("night-rings")
    assert rings_report["night"] > 0.8
    angler = next(c for c in rings_report["active_creatures"] if c["id"] == "anglerfish")
    ax, ay = int(angler["x"] * 2), int(angler["y"] * 2)
    halo = ImageStat.Stat(rings.crop((ax - 40, ay - 60, ax + 60, ay + 60)).convert("L")).mean[0]
    far = ImageStat.Stat(rings.crop((ax - 40, ay + 120, ax + 60, ay + 200)).convert("L")).mean[0]
    assert halo > far + 15, f"night glow rings too faint: {halo:.1f} vs {far:.1f}"
    # 창 크기와 관계없이 월드가 창을 덮는다(검은 여백 없음). 정수배 모드도 같다.
    for name in ("size-1280x720", "size-1280x720-integer", "size-1000x800", "size-phone", "size-phone-title", "size-phone-kelp-night"):
        image, _ = load(name)
        w, h = image.size
        for box in ((0, h // 2 - 60, 60, h // 2 + 60), (w - 60, h // 2 - 60, w, h // 2 + 60),
                    (w // 2 - 80, 0, w // 2 + 80, 30), (w // 2 - 80, h - 30, w // 2 + 80, h)):
            assert max(ImageStat.Stat(image.crop(box)).mean) > 30, f"{name}: black bar at {box}"
    # 휴대폰 가로 화면(588×270 월드를 2배로): 월드 픽셀 격자가 그대로이고, 무대 양옆 여백에도 배경이 그려진다.
    phone, _ = load("size-phone")
    assert phone.size == (1176, 540)
    halves = phone.resize((588, 270), Image.Resampling.NEAREST).resize((1176, 540), Image.Resampling.NEAREST)
    assert diff(phone, halves) < 0.5, "phone view should keep the 2x2 world pixel grid"
    for box in ((0, 0, 108, 540), (1068, 0, 1176, 540)):
        assert ImageStat.Stat(phone.crop(box)).stddev[1] > 12, f"phone margin {box} looks empty"
    # 사건: 보물상자가 떨어지고, 상어가 지나가도 아무도 사라지지 않으며, 두드린 자리가 일렁이고, 바구니가 과자를 뿌린다.
    _, chest = load("event-chest")
    assert chest["debris"] == 1
    _, patrol = load("event-patrol")
    _, after = load("event-patrol-after")
    assert patrol["event"] == "shark-patrol" and patrol["banner"] == "상어의 순찰"
    assert after["school_count"] == patrol["school_count"], "nobody may be eaten during events"
    calm, _ = load("tap-before")
    rippled, _ = load("tap-ripple")
    assert diff(calm.crop((40, 180, 260, 420)), rippled.crop((40, 180, 260, 420))) > 2.0
    _, basket = load("event-basket")
    assert basket["hook"] is True and basket["food_count"] > 0
    _, diver = load("event-diver")
    assert diver["event"] == "diver" and any(c["id"] == "diver" for c in diver["active_creatures"])
    _, jelly = load("event-jelly")
    assert jelly["dex_seen"] >= 10, "sightings should fill the dex"
    check_glow()
    check_ambient()
    check_scenes()
    check_vignettes()
    print("E2E PASS: title, day motion, whale dusk, night glow, dawn, storm flash, feeding; "
          "hover outline+name, reactions (crab claws, puffer, pearl, dolphin leap, school heart), treat hearts, night rings; "
          "soft glow for every glowing species (normal + flare) and night event; "
          "ambient: silver glints, surface reflection, moon, floor glow, variants, regulars, dream, bubble pop, prints; "
          "scenes: 5 concepts day/night, random layout, clams; vignettes: 31 events (stage, cast, aurora, fireworks, eggs); "
          "all lit species, boids school, facing, pixel grid; resize cover; "
          "events: chest, shark patrol (no eating), tap ripple, treat basket, diver, dex")


if __name__ == "__main__":
    main()
