#!/usr/bin/env python3
"""Lint a universal narration script BEFORE voicing: ensures every beat gives the 3D camera concrete action.

    python3 script_lint.py <script.md | shooting.txt> [--wpm 178] [--strict] [--export DIR]

Checks universal visual storytelling rules:
  NUMBERS    3+ statistics inside 10 s: turns the film into a spreadsheet. Keep one contrast, stage the rest.
  ROLL-CALL  "First: ... Second: ... Third: ..." enumerations: rewrite as physical action with consequences.
  ARGUMENT   abstract reasoning > 6 s with no concrete staging cue (`playlet:`, `cutaway:`, `tabletop:`, `scene:`).
  TEXT       more than 45% of hinted beats rely on on-screen text labels/badges instead of physical props/actions.
  AIR        short punchlines or chapter endings without `[air N]` breathing room.
"""
import argparse
import pathlib
import re
import sys

ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
ap.add_argument("script")
ap.add_argument("--wpm", type=float, default=178.0)
ap.add_argument("--strict", action="store_true", help="exit 1 when anything is flagged")
ap.add_argument("--export", metavar="DIR", help="write clean per-chapter .txt for narrate.py --texts")
a = ap.parse_args()

AIR = re.compile(r"\[air\s+([0-9.]+)\]")
src = pathlib.Path(a.script)
lines = src.read_text().splitlines()
piped = any(" | " in l and not l.lstrip().startswith("|") for l in lines)

chapters, cur = [], None
for raw in lines:
    line = raw.strip()
    m = re.match(r"^#{1,6}\s*(\d+)[.)]?\s+(.+)$", line)
    if m:
        cur = dict(n=int(m.group(1)), title=re.sub(r"[（(].*$", "", m.group(2)).strip(), beats=[])
        chapters.append(cur)
        continue
    if not line or line.startswith(("#", ">", "|", "(", "<!--", "- ", "*")):
        continue
    if piped and " | " not in line:
        continue
    spoken, hint = (line.split(" | ", 1) + [""])[:2]
    if cur is None:
        if piped:
            continue
        cur = dict(n=1, title=src.stem, beats=[])
        chapters.append(cur)
    spoken = re.sub(r"[*_`]", "", spoken).strip()
    if spoken:
        cur["beats"].append(dict(raw=spoken, hint=hint.strip()))

chapters = [c for c in chapters if c["beats"]]
if not chapters:
    sys.exit("no spoken beats found in " + a.script)
has_air = any(AIR.search(b["raw"]) for c in chapters for b in c["beats"])
has_hints = any(b["hint"] for c in chapters for b in c["beats"])

for c in chapters:
    t = 0.0
    for b in c["beats"]:
        b["air"] = sum(float(x) for x in AIR.findall(b["raw"]))
        b["text"] = " ".join(AIR.sub(" ", b["raw"]).split())
        b["words"] = len(b["text"].split())
        b["t0"], b["dur"] = t, b["words"] / a.wpm * 60 + b["air"]
        t += b["dur"]
    c["dur"], c["words"], c["flags"] = t, sum(b["words"] for b in c["beats"]), []

clock = lambda s: f"{int(s // 60)}:{int(s % 60):02d}"
NUMW = set(
    "two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen "
    "eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand million billion dozen".split()
)
MONTHS = set("january february march april may june july august september october november december".split())
LABELS = set("chapter part piece step number page act scene".split())


def is_num(tok):
    if re.fullmatch(r"\d[\d,]*(\.\d+)?", tok):
        return not (re.fullmatch(r"\d{4}", tok) and 1000 <= int(tok) <= 2100)
    return bool(tok) and all(p in NUMW for p in tok.split("-"))


def figures(c):
    out = []
    for b in c["beats"]:
        toks = [re.sub(r"^\W+|\W+$", "", w.lower()) for w in b["text"].split()]
        i = 0
        while i < len(toks):
            if not is_num(toks[i]):
                i += 1
                continue
            j = i
            while j + 1 < len(toks) and (
                is_num(toks[j + 1])
                or (toks[j + 1] == "and" and j + 2 < len(toks) and is_num(toks[j + 2]) and toks[j] in ("hundred", "thousand"))
            ):
                j += 1
            prev = toks[max(0, i - 2) : i]
            if not (set(prev) & MONTHS) and not (prev and prev[-1] in LABELS):
                out.append((b["t0"] + b["dur"] * i / max(1, len(toks)), " ".join(toks[i : j + 1])))
            i = j + 1
    return out


def clusters(figs, win=10.0, need=3):
    out, i = [], 0
    while i < len(figs):
        j = i
        while j + 1 < len(figs) and figs[j + 1][0] - figs[i][0] <= win:
            j += 1
        if j - i + 1 >= need:
            while j + 1 < len(figs) and figs[j + 1][0] - figs[j][0] <= win / 2:
                j += 1
            out.append(figs[i : j + 1])
            i = j + 1
        else:
            i += 1
    return out


def sentences(raw):
    out = []
    raw = re.sub(r"\b([A-Z])\.([A-Z])\.", r"\1\2", raw)
    for part in re.split(r"(\[air\s+[0-9.]+\])", raw):
        m = AIR.fullmatch(part.strip())
        if m:
            if out:
                out[-1][1] += float(m.group(1))
        else:
            out += [[s.strip(), 0.0] for s in re.findall(r"[^.!?]+(?:[.!?]+[\"”’')]*|$)", part) if s.strip()]
    return out


ROLL = re.compile(r"^(first|second|third|fourth|fifth|sixth)\b[:,]", re.I)
ARG = re.compile(
    r"^[\"“]?(if |when do you |look at |that's exactly why|that's why|here's the bet|the only way|which means|in other words)",
    re.I,
)
STAGED = re.compile(r"playlet|cutaway|tabletop|scene|小剧场|剖面|沙盘", re.I)
LETTER = re.compile(r"[「『“]|LABEL|TITLE|字幕|时间牌|时间卡|计数|旁注|标注|引文卡|\bcard\b|\blabel\b|counter|caption|stamp|badge", re.I)

rep = {k: [] for k in ("NUMBERS", "ROLL-CALL", "ARGUMENT", "TEXT", "AIR")}
punch = []
for c in chapters:
    tag = f"ch{c['n']}"
    for cl in clusters(figures(c)):
        rep["NUMBERS"].append(f"{tag} ~{clock(cl[0][0])}-{clock(cl[-1][0])}  " + " · ".join(f[1] for f in cl))
    roll = [b for b in c["beats"] if ROLL.match(b["text"])]
    if len(roll) >= 3:
        rep["ROLL-CALL"].append(
            f"{tag} ~{clock(roll[0]['t0'])}  {len(roll)} items, {sum(b['dur'] for b in roll):.0f} s: "
            + " / ".join(b["text"].split(",")[0][:28] for b in roll)
        )
    run = []
    for b in c["beats"] + [None]:
        if b and any(ARG.match(s) for s, _ in sentences(b["raw"])):
            run.append(b)
            continue
        if run and sum(x["dur"] for x in run) > 6 and not any(STAGED.search(x["hint"]) for x in run):
            rep["ARGUMENT"].append(f"{tag} ~{clock(run[0]['t0'])}  {sum(x['dur'] for x in run):.0f} s: \"{run[0]['text'][:70]}...\"")
        run = []
    sents = [(s, air, b) for b in c["beats"] for s, air in sentences(b["raw"])]
    for k, (s, air, b) in enumerate(sents):
        if (len(s.split()) <= 2 and re.search(r"[.!?]", s)) or k == len(sents) - 1:
            punch.append((tag, b["t0"], s, air))
    for key in rep:
        if any(x.startswith(tag + " ") for x in rep[key]):
            c["flags"].append(key)

hinted = [b for c in chapters for b in c["beats"] if b["hint"]]
lettered = [b for b in hinted if LETTER.search(b["hint"])]
if hinted and len(lettered) / len(hinted) > 0.45:
    rep["TEXT"].append(f"film  {len(lettered)} of {len(hinted)} beats ({100 * len(lettered) / len(hinted):.0f}%) rely on screen lettering")
if has_air:
    rep["AIR"] = [f"{tag} ~{clock(t)}  \"{s}\" has {air:.1f} s of air" for tag, t, s, air in punch if air < 0.5]
elif punch:
    rep["AIR"] = [
        f"film  no [air] marks yet; {len(punch)} places want breathing room, e.g. "
        + " ".join(f"\"{s}\"" for _, _, s, _ in punch if len(s.split()) <= 2)[:150]
    ]

total_w, total_t = sum(c["words"] for c in chapters), sum(c["dur"] for c in chapters)
print(
    f"script_lint: {src.name} · {len(chapters)} chapter(s) · {total_w} words · ~{clock(total_t)} at {a.wpm:g} wpm"
    + (" incl. marked air" if has_air else "")
    + ("" if has_hints else " · no visual hints: TEXT not checked")
)
for c in chapters:
    print(f"  ch{c['n']:<2} {c['title'][:44]:<44} {c['words']:>4} w  {clock(c['dur']):>5}  {' '.join(c['flags']) or 'ok'}")
bad = 0
for key, items in rep.items():
    if items:
        bad += 1
        print(f"\n{key} ({len(items)})")
        for it in items:
            print("  " + it)
print("\n" + ("clean: nothing flagged." if not bad else f"{bad} kind(s) of flag. See references/script.md for rewrites."))
if a.export:
    out = pathlib.Path(a.export)
    out.mkdir(parents=True, exist_ok=True)
    for c in chapters:
        slug = re.sub(r"[^A-Za-z0-9]+", "_", c["title"]).strip("_")[:40] or "chapter"
        (out / f"{c['n']:02d}_{slug}.txt").write_text(" ".join(b["text"] for b in c["beats"]) + "\n")
    print(f"exported {len(chapters)} clean chapter text(s) -> {out}")
sys.exit(1 if (a.strict and bad) else 0)
