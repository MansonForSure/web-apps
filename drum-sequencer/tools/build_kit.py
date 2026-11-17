#!/usr/bin/env python3
"""Mix the Naked Drums multi-mic recordings into web-ready stereo one-shots.

Each hit is summed from all of its recorded microphones, following the
library's own default stereo preset (Stereo/Naked Drums.sfz): every mic bus at
unity, except the hi-hat/ride close mics and the wide cymbal pair at 20 %, plus
the per-mic master/group trims declared in Data/macro.txt and the group files.
Close mics are panned with the preset's drummer-perspective pan values.

Usage: NAKED_DRUMS_DIR=/path/to/clone python3 parse_sfz.py && python3 build_kit.py ..
Output: <out>/samples/<voice>/<layer>-<rr>.mp3 and <out>/samples/kit.json
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor

import numpy as np
import soundfile as sf

# Path to a clone of https://github.com/sfzinstruments/WilkinsonAudio.NakedDrums
ROOT = os.path.join(os.environ.get("NAKED_DRUMS_DIR", "WilkinsonAudio.NakedDrums"), "Wilkinson Audio", "Naked Drums")
DATA = os.path.join(ROOT, "Data")
SAMPLES = os.path.join(ROOT, "Samples")
HERE = os.path.dirname(os.path.abspath(__file__))
SR = 44100
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "out")

MAP = json.load(open(os.path.join(HERE, "map.json")))


def parse_defines(path):
    out = {}
    with open(path, encoding="utf-8", errors="replace") as fh:
        for line in fh:
            for m in re.finditer(r"#define\s+(\$\w+)\s+(\S+)", line):
                out[m.group(1)] = m.group(2)
    return out


MACRO = parse_defines(os.path.join(DATA, "macro.txt"))

# group-file name for each (piece, mic) pair used by parse_sfz.py
def group_file(piece, mic):
    if piece == "snare" and mic in ("top1", "top2"):
        return f"snare_{mic}.txt"
    if piece == "snare" and mic == "bot":
        return "snare_bot.txt"
    if piece == "kick" and mic in ("in", "sub"):
        return f"kick_{mic}.txt"
    return f"{piece}_{mic}.txt"


def trims(piece, mic, art_key):
    """Return master_volume + group_volume (dB) for this mic/articulation."""
    path = os.path.join(DATA, "group", group_file(piece, mic))
    local = parse_defines(path)
    defs = {**MACRO, **local}
    master = 0.0
    group = 0.0
    cur_key = None
    with open(path, encoding="utf-8", errors="replace") as fh:
        lines = [l.strip() for l in fh]
    # master volume is declared before the first <group>
    for l in lines:
        if l.startswith("<group>"):
            break
        m = re.match(r"master_volume=(\$\w+|[-\d.]+)", l)
        if m:
            v = m.group(1)
            master = float(defs.get(v, v))
    block = None
    for l in lines:
        if l.startswith("<group>"):
            block = {"key": None, "vol": 0.0, "var": False}
            continue
        if block is None:
            continue
        m = re.match(r"key=\$(\w+)", l)
        if m:
            block["key"] = m.group(1)
        m = re.match(r"group_volume=(\$\w+|[-\d.]+)", l)
        if m:
            v = m.group(1)
            block["vol"] = float(defs.get(v, v))
        if "sw_var" in l:
            block["var"] = True
        if block["key"] == art_key and not block["var"] and "file/" in l:
            group = block["vol"]
            break
    return master + group


# Mic-bus level from the default stereo preset (amplitude 200 % * cc value).
def bus_db(piece, mic):
    if mic == "ch":
        return 20 * np.log10(0.2)
    if mic == "di" and piece in ("hats", "ride"):
        return 20 * np.log10(0.2)
    return 0.0


PAN = {  # close-mic pan, 0 = left, 1 = right (drummer perspective)
    "kick": 0.5, "snare": 0.5, "tom1": 0.2, "tom2": 0.35, "tom3": 0.5,
    "tom4": 0.65, "tom5": 0.8, "hats": 0.35, "ride": 0.65,
}

# A touch less far-room wash than the preset, so the kit sits tighter in a
# sequencer while staying natural; the app adds optional room ambience.
ROOM_TRIM = {"fr": -2.0, "ms": -1.0}

# voice id -> (piece, articulation key, label, layers to keep, rr count, max seconds)
VOICES = [
    ("kick", "kick", "KEY_KICK", 5, 4, 1.1),
    ("snare1", "snare", "KEY_SNR1", 5, 4, 1.35),
    ("snare2", "snare", "KEY_SNR2", 5, 4, 1.45),
    ("sidestick", "snare", "KEY_SIDE", 1, 6, 0.8),
    ("hh_closed", "hats", "KEY_HH_CLS", 3, 5, 0.8),
    ("hh_tight", "hats", "KEY_HH_TGH", 3, 4, 0.6),
    ("hh_half", "hats", "KEY_HH_HLF", 3, 3, 1.8),
    ("hh_open", "hats", "KEY_HH_OPN", 3, 3, 2.6),
    ("hh_pedal", "hats", "KEY_HH_PDL", 1, 5, 0.9),
    ("tom1", "tom1", "KEY_TOM1", 3, 3, 2.0),
    ("tom2", "tom2", "KEY_TOM2", 3, 3, 2.1),
    ("tom3", "tom3", "KEY_TOM3", 3, 3, 2.2),
    ("tom4", "tom4", "KEY_TOM4", 3, 3, 2.4),
    ("tom5", "tom5", "KEY_TOM5", 3, 3, 2.5),
    ("ride", "ride", "KEY_RD_BOW", 3, 3, 4.0),
    ("ride_bell", "ride", "KEY_RD_BEL", 1, 4, 3.6),
    ("crash1", "crash1", "KEY_CRS1_EDG", 3, 2, 4.6),
    ("crash2", "crash2", "KEY_CRS2_EDG", 3, 2, 4.6),
    ("china", "china1", "KEY_CHN1", 3, 2, 3.6),
    ("splash", "splash1", "KEY_SPL1", 2, 3, 2.8),
]

_cache = {}


def read(name):
    x, sr = sf.read(os.path.join(SAMPLES, name), always_2d=True, dtype="float64")
    assert sr == SR
    return x


def to_stereo(x, piece, mic):
    if x.shape[1] == 2:
        return x
    m = x[:, 0]
    if mic in ("di", "in", "sub", "top1", "top2", "bot"):
        p = PAN.get(piece, 0.5)
    else:
        p = 0.5
    th = p * np.pi / 2
    # constant-power pan normalised so a centred mono mic keeps unity per side
    gl, gr = np.cos(th) * np.sqrt(2), np.sin(th) * np.sqrt(2)
    return np.stack([m * gl, m * gr], axis=1)


def mix_hit(piece, art, vel, rr, mic_gain):
    parts = []
    for mic, regions in MAP[piece][art].items():
        reg = [r for r in regions if r["vel"] == vel and r["rr"] == rr]
        if not reg:
            continue
        x = to_stereo(read(reg[0]["file"]), piece, mic)
        parts.append(x * mic_gain[mic])
    n = max(len(p) for p in parts)
    out = np.zeros((n, 2))
    for p in parts:
        out[: len(p)] += p
    return out


def env_db(x, win=441):
    e = np.sqrt(np.convolve((x ** 2).max(axis=1), np.ones(win) / win, mode="same"))
    return 20 * np.log10(e + 1e-12)


def shape(x, max_s):
    """Trim leading silence, cut the inaudible tail, and fade out naturally."""
    a = np.abs(x).max(axis=1)
    pk = a.max()
    onset = int(np.argmax(a > pk * 0.01))
    start = max(0, onset - int(0.0015 * SR))
    x = x[start:]
    e = env_db(x)
    floor = e.max() - 62
    above = np.where(e > floor)[0]
    end = min(len(x), int(above[-1]) + int(0.03 * SR) if len(above) else len(x), int(max_s * SR))
    x = x[:end].copy()
    fade = min(len(x) // 3, int(0.35 * max_s * SR))
    if fade > 16:
        t = np.linspace(0, 1, fade)
        x[-fade:] *= (np.cos(t * np.pi / 2) ** 2)[:, None]
    fi = min(32, len(x))
    x[:fi] *= np.linspace(0, 1, fi)[:, None]
    return x


def pick_rrs(piece, art, mic_gain, layer, count):
    """Choose the round robins whose loudness is closest to the layer median."""
    scores = []
    for rr in range(1, 11):
        try:
            h = mix_hit(piece, art, layer, rr, mic_gain)
        except ValueError:
            continue
        seg = h[: int(0.08 * SR)]
        scores.append((rr, 10 * np.log10((seg ** 2).mean() + 1e-15)))
    med = np.median([s for _, s in scores])
    scores.sort(key=lambda t: abs(t[1] - med))
    return sorted(rr for rr, _ in scores[:count])


def layer_indices(total, keep):
    if keep >= total:
        return list(range(1, total + 1))
    idx = np.round(np.linspace(1, total, keep)).astype(int)
    return sorted(set(idx.tolist()))


def encode(wav_path, mp3_path):
    subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-y", "-i", wav_path, "-c:a", "libmp3lame",
         "-q:a", "3", "-ar", str(SR), mp3_path],
        check=True,
    )


def build_voice(spec):
    vid, piece, art, keep_layers, rr_count, max_s = spec
    mics = MAP[piece][art]
    total_layers = max(r["layers"] for rs in mics.values() for r in rs)
    mic_gain = {}
    for mic in mics:
        db = bus_db(piece, mic) + trims(piece, mic, art) + ROOM_TRIM.get(mic, 0.0)
        mic_gain[mic] = 10 ** (db / 20)
    layers = layer_indices(total_layers, keep_layers)
    hits = []
    for li, layer in enumerate(layers):
        rrs = pick_rrs(piece, art, mic_gain, layer, rr_count)
        for ri, rr in enumerate(rrs):
            x = shape(mix_hit(piece, art, layer, rr, mic_gain), max_s)
            hits.append((li, ri, layer, rr, x))
    peak = max(np.abs(h[4]).max() for h in hits)
    norm = 10 ** (-1.0 / 20) / peak
    vdir = os.path.join(OUT, "samples", vid)
    os.makedirs(vdir, exist_ok=True)
    tmp = os.path.join(tempfile.gettempdir(), "backbeat-build", vid)
    os.makedirs(tmp, exist_ok=True)
    layer_db = {}
    files = {}
    for li, ri, layer, rr, x in hits:
        y = (x * norm).astype(np.float32)
        wav = os.path.join(tmp, f"{li}-{ri}.wav")
        sf.write(wav, y, SR, subtype="PCM_24")
        encode(wav, os.path.join(vdir, f"{li}-{ri}.mp3"))
        seg = y[: int(0.1 * SR)].astype(np.float64)
        layer_db.setdefault(li, []).append(10 * np.log10((seg ** 2).mean() + 1e-15))
        files.setdefault(li, []).append(f"{li}-{ri}.mp3")
    # nominal centre velocity (0..1) of each kept layer within the SFZ ranges
    bounds = np.linspace(0, 1, total_layers + 1)
    centres = [float((bounds[l - 1] + bounds[l]) / 2) for l in layers]
    meta = {
        "id": vid,
        "piece": piece,
        "sourceLayers": layers,
        "layers": [
            {
                "vel": round(centres[li], 3),
                "db": round(float(np.mean(layer_db[li])), 2),
                "files": files[li],
            }
            for li in range(len(layers))
        ],
        # gain that restores the preset's balance after per-voice normalisation
        "gainDb": round(float(-20 * np.log10(norm)), 2),
        "seconds": round(float(max(len(h[4]) for h in hits) / SR), 2),
    }
    print(f"{vid:10s} layers={layers} rr={rr_count} gain={meta['gainDb']:+.1f}dB "
          f"lvl={[l['db'] for l in meta['layers']]}", flush=True)
    return meta


def main():
    # replace only generated voice folders; keep licence files alongside them
    for spec in VOICES:
        shutil.rmtree(os.path.join(OUT, "samples", spec[0]), ignore_errors=True)
    os.makedirs(os.path.join(OUT, "samples"), exist_ok=True)
    with ThreadPoolExecutor(max_workers=6) as ex:
        metas = list(ex.map(build_voice, VOICES))
    kit = {
        "name": "Naked Drums — Yamaha Recording Custom",
        "source": "Wilkinson Audio Naked Drums (CC BY 4.0), SFZ port by kinwie / sfzinstruments",
        "sampleRate": SR,
        "voices": {m["id"]: m for m in metas},
    }
    with open(os.path.join(OUT, "samples", "kit.json"), "w") as fh:
        json.dump(kit, fh, indent=1)
    total = 0
    for dp, _, fs in os.walk(os.path.join(OUT, "samples")):
        total += sum(os.path.getsize(os.path.join(dp, f)) for f in fs)
    print(f"total {total/1e6:.2f} MB")


if __name__ == "__main__":
    main()
