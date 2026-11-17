#!/usr/bin/env python3
"""Resolve the Naked Drums SFZ include tree into a JSON sample map.

Output structure:
  { piece: { articulation_key: { mic: [ {vel: 1..N, layers: N, rr: 1..10, file: name} ] } } }
"""
import json
import os
import re
import sys
from collections import defaultdict

# Path to a clone of https://github.com/sfzinstruments/WilkinsonAudio.NakedDrums
ROOT = os.path.join(os.environ.get("NAKED_DRUMS_DIR", "WilkinsonAudio.NakedDrums"), "Wilkinson Audio", "Naked Drums")
DATA = os.path.join(ROOT, "Data")
SAMPLES = os.path.join(ROOT, "Samples")
RR_WORDS = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"]


def parse_defines(path):
    out = {}
    with open(path, encoding="utf-8", errors="replace") as fh:
        for line in fh:
            for m in re.finditer(r"#define\s+(\$\w+)\s+(\S+)", line):
                out[m.group(1)] = m.group(2)
    return out


def resolve_file(code, template):
    d = parse_defines(os.path.join(DATA, "file", f"{code}.txt"))
    mic, art = d["$MIC"], d["$ART"]
    layers = int(template[1:])
    vels = [d.get(f"$VEL{i}") for i in range(1, layers + 1)]
    regions = []
    for pos in range(1, 11):
        for vi in range(1, layers + 1):
            idx = (pos - 1) * layers + vi
            c = d.get(f"$CODE_{idx:02d}")
            if c is None:
                continue
            name = f"{mic}_{art}_{vels[vi-1]}_{RR_WORDS[pos-1]}-{c}.flac"
            if not os.path.exists(os.path.join(SAMPLES, name)):
                print("MISSING", name, file=sys.stderr)
                continue
            regions.append({"vel": vi, "layers": layers, "rr": pos, "file": name})
    return regions


def parse_group(path):
    blocks = []
    cur = None
    with open(path, encoding="utf-8", errors="replace") as fh:
        for raw in fh:
            line = raw.strip()
            if line.startswith("<group>"):
                cur = {"key": None, "label": None, "file": None, "tpl": None, "var": False}
                blocks.append(cur)
                continue
            if cur is None:
                continue
            m = re.match(r"key=\$(\w+)", line)
            if m:
                cur["key"] = m.group(1)
            m = re.match(r"group_label=\$(\w+)", line)
            if m:
                cur["label"] = m.group(1)
            m = re.search(r'file/(\w+)\.txt', line)
            if m:
                cur["file"] = m.group(1)
            m = re.search(r'region/(v\d)\.txt', line)
            if m:
                cur["tpl"] = m.group(1)
            if "sw_var" in line:
                cur["var"] = True
    return blocks


def main():
    result = defaultdict(lambda: defaultdict(dict))
    gdir = os.path.join(DATA, "group")
    for fn in sorted(os.listdir(gdir)):
        base = fn[:-4]
        piece, mic = base.rsplit("_", 1)
        if piece == "snare" and mic in ("top1", "top2", "bot"):
            mic = {"top1": "top1", "top2": "top2", "bot": "bot"}[mic]
        if piece == "snare_top":
            pass
        # names like snare_top1 -> piece 'snare', mic 'top1'
        if base.startswith("snare_top"):
            piece, mic = "snare", base.split("_", 1)[1]
        if base == "snare_bot":
            piece, mic = "snare", "bot"
        if base in ("kick_in", "kick_sub"):
            piece, mic = "kick", base.split("_")[1]
        for b in parse_group(os.path.join(gdir, fn)):
            if b["var"] or not b["file"] or not b["tpl"]:
                continue
            art = b["key"]
            if art in result[piece] and mic in result[piece][art]:
                continue
            result[piece][art][mic] = resolve_file(b["file"], b["tpl"])
    json.dump(result, open(os.path.join(os.path.dirname(__file__), "map.json"), "w"), indent=1)
    for piece in sorted(result):
        for art in sorted(result[piece]):
            mics = result[piece][art]
            desc = ", ".join(f"{m}:{len(r)}" for m, r in sorted(mics.items()))
            layers = {r["layers"] for rs in mics.values() for r in rs}
            print(f"{piece:8s} {art:14s} layers={sorted(layers)} {desc}")


if __name__ == "__main__":
    main()
