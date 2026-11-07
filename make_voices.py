"""Generate per-scene narration for a STAY INSIDE episode script with Kokoro TTS.

Narration = each scene's "On-screen captions" lines, read in order.
A "(beat)" line becomes a pause. Settings come from audio/narrator.json.

Usage: python3 make_voices.py script-ep1.md ep1 MODEL_DIR
"""
import json, re, sys
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

script_path, episode, model_dir = sys.argv[1], sys.argv[2], Path(sys.argv[3])
root = Path(__file__).parent
cfg = json.loads((root / "audio" / "narrator.json").read_text())
tts = Kokoro(str(model_dir / "kokoro-v1.0.onnx"), str(model_dir / "voices-v1.0.bin"))
sr = cfg["sample_rate"]

text = Path(script_path).read_text()
scenes = re.split(r"^## SCENE ", text, flags=re.M)[1:]
for chunk in scenes:
    num = int(re.match(r"(\d+)", chunk).group(1))
    title = chunk.split("\n", 1)[0].split("—", 1)[1].strip()
    block = re.search(r"\*\*On-screen captions:\*\*\n((?:>.*\n)+)", chunk).group(1)
    lines = [l.lstrip("> ").strip() for l in block.splitlines() if l.strip(">").strip()]
    parts = []
    for line in lines:
        if line.lower() == "(beat)":
            parts.append(np.zeros(int(sr * cfg["beat_pause_seconds"]), dtype=np.float32))
            continue
        audio, rate = tts.create(line, voice=cfg["voice"], speed=cfg["speed"], lang=cfg["lang"])
        assert rate == sr
        if parts:
            parts.append(np.zeros(int(sr * cfg["line_gap_seconds"]), dtype=np.float32))
        parts.append(audio.astype(np.float32))
    out = root / "audio" / f"{episode}-scene{num:02d}.wav"
    sf.write(out, np.concatenate(parts), sr)
    print(f"{out.name}\t{len(np.concatenate(parts))/sr:.1f}s\t{title}\t| " + " / ".join(lines))
