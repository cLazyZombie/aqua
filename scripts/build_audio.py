#!/usr/bin/env python3
"""배경 음악·물속 소리를 출처에서 받아 음량을 맞추고 웹용 mp3로 굽는다.

원본은 커서(수십 MB) 저장소에 두지 않고 `.cache/audio/`에 받아 둔다. 이미 받은 파일은 다시 받지 않는다.
결과는 `public/assets/audio/<id>.mp3`다. 음량은 ffmpeg loudnorm 두 번 돌리기(측정 → 선형 보정)로 맞춘다.
사용: pnpm audio   (ffmpeg 필요)
"""

from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / ".cache/audio"
OUT = ROOT / "public/assets/audio"

# (id, 원본 URL, zip이면 꺼낼 파일 확장자, 목표 음량 LUFS, 비트레이트 kbps, 채널)
# 라이선스와 표기는 LICENSE의 Third-party assets와 README의 소리 절에 적는다.
TRACKS = [
    # 낮 배경 음악
    ("underwater-theme-ii", "https://opengameart.org/sites/default/files/underwater_theme_ii.zip", ".ogg", -20, 112, 2),
    ("aquaria", "https://opengameart.org/sites/default/files/TylerSong3_Normal.wav", None, -20, 112, 2),
    ("underwater-bells", "https://opengameart.org/sites/default/files/Cleyton%20RX%20-%20Underwater_0.mp3", None, -20, 112, 2),
    ("ice-cave-lofi", "https://opengameart.org/sites/default/files/8_bit_ice_cave_lofi_0.mp3", None, -21, 96, 2),
    # 밤 배경 음악
    ("starlight", "https://opengameart.org/sites/default/files/star_light_looping.ogg", None, -21, 112, 2),
    ("gentle-lullaby", "https://opengameart.org/sites/default/files/lullaby_1.ogg", None, -22, 112, 2),
    # 물속 소리(Freesound 미리듣기 hq mp3, 모두 CC0)
    ("underwater-bed", "https://cdn.freesound.org/previews/366/366159_6725579-hq.mp3", None, -24, 64, 2),
    ("surface-lapping", "https://cdn.freesound.org/previews/838/838025_11519060-hq.mp3", None, -24, 64, 2),
    ("bubbles", "https://cdn.freesound.org/previews/192/192351_770707-hq.mp3", None, -20, 96, 2),
]


def fetch(track_id: str, url: str, member: str | None) -> Path:
    """원본을 캐시에 받아 두고 경로를 돌려준다. zip이면 원하는 확장자의 첫 파일을 꺼낸다."""
    CACHE.mkdir(parents=True, exist_ok=True)
    suffix = member or Path(url.split("?")[0]).suffix
    target = CACHE / f"{track_id}{suffix}"
    if target.exists():
        return target
    print(f"download {track_id} <- {url}")
    request = urllib.request.Request(url, headers={"User-Agent": "aqua-build-audio"})
    with urllib.request.urlopen(request) as response, tempfile.NamedTemporaryFile(delete=False) as temp:
        shutil.copyfileobj(response, temp)
    if member is None:
        shutil.move(temp.name, target)
        return target
    with zipfile.ZipFile(temp.name) as archive:
        name = next(entry for entry in sorted(archive.namelist()) if entry.lower().endswith(member))
        with archive.open(name) as source, target.open("wb") as sink:
            shutil.copyfileobj(source, sink)
    Path(temp.name).unlink()
    return target


def measure(source: Path, lufs: int) -> dict:
    """loudnorm 첫 번째 돌리기: 원본의 음량·피크를 잰다."""
    result = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", str(source), "-af", f"loudnorm=I={lufs}:TP=-2:LRA=11:print_format=json", "-f", "null", "-"],
        check=True, capture_output=True, text=True,
    )
    text = result.stderr
    return json.loads(text[text.rindex("{"): text.rindex("}") + 1])


def encode(source: Path, target: Path, lufs: int, kbps: int, channels: int) -> None:
    """loudnorm 두 번째 돌리기: 잰 값으로 선형 보정해 mp3로 굽는다(루프 이음새가 흔들리지 않게 동적 압축은 쓰지 않는다)."""
    m = measure(source, lufs)
    loudnorm = (
        f"loudnorm=I={lufs}:TP=-2:LRA=11:measured_I={m['input_i']}:measured_TP={m['input_tp']}:"
        f"measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true"
    )
    subprocess.run(
        # 원본 태그(옛 gapless 정보 등)는 새 파일과 맞지 않으므로 떼어 낸다.
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(source), "-map_metadata", "-1", "-af", loudnorm, "-ar", "44100",
         "-ac", str(channels), "-c:a", "libmp3lame", "-b:a", f"{kbps}k", str(target)],
        check=True,
    )


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    total = 0
    for track_id, url, member, lufs, kbps, channels in TRACKS:
        source = fetch(track_id, url, member)
        target = OUT / f"{track_id}.mp3"
        encode(source, target, lufs, kbps, channels)
        size = target.stat().st_size
        total += size
        print(f"{track_id}: {size / 1024:.0f} KB")
    print(f"audio: {len(TRACKS)} files, {total / 1024 / 1024:.1f} MB")


if __name__ == "__main__":
    main()
