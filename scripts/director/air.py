#!/usr/bin/env python3
"""Put air into a narration take: the editor decides where the film breathes, not the TTS.

    python3 air.py <shooting.txt> <narration.wav> <words.json> --out-wav narration_air.wav --out-words words_air.json
                   [--tighten 0.45] [--min-silence-db -42]

<shooting.txt> is the spoken text of this take (one beat per line; anything after " | " is a visual hint and is
ignored) with pause marks where the picture needs time:

    The scout raises his field glasses, squints into the morning haze, [air 0.5] and sees nothing. [air 1.1]

[air N] means "the pause here lasts at least N seconds" (it is measured in the audio, so a pause the voice
already made is only topped up). --tighten X trims every unmarked pause longer than X seconds down to X, so
the take stays tight everywhere the director did not ask for room.

Words are matched to the script with a sequence alignment, so numbers the recogniser wrote as digits and a
mis-heard name do not matter; words the recogniser invented after the last script word are dropped.
Output: the edited WAV (cuts are cross-faded, inserted air is digital silence: the mix fills it with ambience),
words.json with every time shifted, and a table of what changed. Standard library only.
"""
import argparse, array, difflib, json, math, pathlib, re, sys, wave

ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
ap.add_argument("script"); ap.add_argument("wav"); ap.add_argument("words")
ap.add_argument("--out-wav", required=True); ap.add_argument("--out-words", required=True)
ap.add_argument("--tighten", type=float, default=0.0, help="cap unmarked pauses at this many seconds (0 = leave them)")
ap.add_argument("--force", action="store_true", help="insert air even where the voice does not pause")
ap.add_argument("--min-silence-db", type=float, default=-42.0, help="frames below this level count as pause")
a = ap.parse_args()

norm = lambda s: re.sub(r"[^a-z0-9']", "", s.lower())

# ---- script -> tokens + air marks (mark k sits after token index k-1; k = 0 would be before the first word)
tokens, marks = [], {}
for raw in pathlib.Path(a.script).read_text().splitlines():
    line = raw.split(" | ")[0].strip()
    if not line or line.startswith(("#", ">", "(", "<!--")):
        continue
    for part in re.split(r"(\[air\s+[0-9.]+\])", line):
        m = re.fullmatch(r"\[air\s+([0-9.]+)\]", part)
        if m:
            marks[len(tokens)] = max(marks.get(len(tokens), 0.0), float(m.group(1)))
        else:
            tokens += [t for t in (norm(w) for w in part.split()) if t]
if not tokens:
    sys.exit("no spoken text found in " + a.script)

# ---- words + alignment
words = json.loads(pathlib.Path(a.words).read_text())
wtok = [norm(w["w"]) for w in words]
sm = difflib.SequenceMatcher(None, tokens, wtok, autojunk=False)
s2w = {}
for blk in sm.get_matching_blocks():
    for k in range(blk.size):
        s2w[blk.a + k] = blk.b + k
if len(s2w) < 0.6 * len(tokens):
    sys.exit(f"only {len(s2w)}/{len(tokens)} script words were found in words.json: wrong take or wrong script?")
last = max(s2w.values())
tail_end = words[last]["end"]
dropped = [w["w"] for w in words[last + 1:] if w["start"] >= tail_end - 0.05 and not norm(w["w"]) in tokens[-3:]]
if dropped and len(words) - (last + 1) == len(dropped):
    words = words[:last + 1]          # recogniser hallucination after the last script word
else:
    dropped = []

# ---- audio -> 10 ms level frames
with wave.open(a.wav, "rb") as f:
    nch, sw, sr, nfr = f.getnchannels(), f.getsampwidth(), f.getframerate(), f.getnframes()
    pcm = f.readframes(nfr)
if sw != 2:
    sys.exit("16-bit PCM WAV expected")
smp = array.array("h"); smp.frombytes(pcm)
hop = sr // 100
nfrm = nfr // hop
lvl = []
for i in range(nfrm):
    seg = smp[i * hop * nch:(i + 1) * hop * nch]
    lvl.append(10 * math.log10(sum(x * x for x in seg) / (len(seg) * 32768.0 ** 2) + 1e-12))
quiet = [v < a.min_silence_db for v in lvl]


def pause_at(j):
    """Longest quiet run around the boundary after word j -> (start_s, end_s). Never reaches past the middle of
    either neighbouring word, so two boundaries can not claim the same pause. Falls back to the word gap."""
    end = nfr / sr
    nxt = words[j + 1] if j + 1 < len(words) else dict(start=end, end=end)
    lo = max(words[j]["end"] - 0.18, (words[j]["start"] + words[j]["end"]) / 2)
    hi = min(nxt["start"] + 0.18, (nxt["start"] + nxt["end"]) / 2) if j + 1 < len(words) else end
    i0, i1 = max(0, int(lo * 100)), min(nfrm, int(hi * 100) + 1)
    best, cur = None, None
    for i in range(i0, i1):
        if quiet[i]:
            cur = [i, i + 1] if cur is None else [cur[0], i + 1]
            if best is None or cur[1] - cur[0] > best[1] - best[0]:
                best = cur[:]
        else:
            cur = None
    if best is None:
        mid = (words[j]["end"] + nxt["start"]) / 2
        return mid, mid
    return best[0] / 100, best[1] / 100


# ---- measure every pause once, then pull the recogniser's word edges out of the silence (it tends to stretch a
# word across the pause next to it, which would leave a cut on the wrong side of a word)
PAUSE = [pause_at(j) for j in range(len(words))]
for j, (p0, p1) in enumerate(PAUSE[:-1]):
    if p1 - p0 >= 0.20:
        if p0 + 0.03 > words[j]["start"] + 0.05:
            words[j]["end"] = min(words[j]["end"], p0 + 0.03)
        if p1 - 0.03 < words[j + 1]["end"] - 0.05:
            words[j + 1]["start"] = max(words[j + 1]["start"], p1 - 0.03)

# ---- decide the edits: (time, +seconds inserted | -seconds removed, label)
matched = sorted(s2w)
edits, rows, marked_bounds = [], [], set()
for k, want in sorted(marks.items()):
    if k == 0:
        continue
    if k >= len(tokens):                                  # after the last word: tail room for the last image
        have = nfr / sr - words[-1]["end"]
        if want > have:
            edits.append((nfr / sr, want - have, "tail"))
        rows.append(("(end)", have, max(have, want)))
        continue
    lo = max((i for i in matched if i <= k - 1), default=None)
    hi = min((i for i in matched if i >= k), default=None)
    if lo is None or hi is None:
        print(f"! could not place [air {want}] after script word {k} ('{tokens[k - 1]}')", file=sys.stderr)
        continue
    cands = [(PAUSE[j], j) for j in range(s2w[lo], s2w[hi])] or [(PAUSE[s2w[lo]], s2w[lo])]
    (p0, p1), j = max(cands, key=lambda c: c[0][1] - c[0][0])
    marked_bounds.add(j)
    have = p1 - p0
    if have < 0.06 and not a.force:
        print(f"! [air {want}] after '{words[j]['w']}': the voice does not pause there, a cut would be heard. "
              f"Move the mark to a real pause or pass --force.", file=sys.stderr)
        rows.append((f"SKIPPED {words[j]['w']} | {words[j + 1]['w']}", have, have))
        continue
    if want > have:
        edits.append(((p0 + p1) / 2, want - have, f"air {want}"))
    rows.append((f"{words[j]['w']} | {words[j + 1]['w'] if j + 1 < len(words) else ''}", have, max(have, want)))
if a.tighten > 0:
    for j in range(len(words) - 1):
        if j in marked_bounds:
            continue
        p0, p1 = PAUSE[j]
        if p1 - p0 > a.tighten + 0.03:
            edits.append(((p0 + p1) / 2, -(p1 - p0 - a.tighten), "tighten"))
edits.sort()
for (t0, d0, _), (t1, d1, _) in zip(edits, edits[1:]):
    if t1 - max(0.0, -d1) / 2 < t0 + max(0.0, -d0) / 2:
        sys.exit(f"internal error: edits overlap at {t0:.2f} s and {t1:.2f} s")

# ---- apply to the audio (10 ms raised-cosine fades at every cut)
fade = int(0.010 * sr)
out = array.array("h")


def append(seg, fade_in, fade_out):
    seg = array.array("h", seg)
    n = len(seg) // nch
    f = min(fade, n // 2)
    for i in range(f):
        gI = 0.5 - 0.5 * math.cos(math.pi * i / f) if fade_in else 1.0
        gO = 0.5 - 0.5 * math.cos(math.pi * i / f) if fade_out else 1.0
        for c in range(nch):
            if fade_in:
                seg[i * nch + c] = int(seg[i * nch + c] * gI)
            if fade_out:
                seg[(n - 1 - i) * nch + c] = int(seg[(n - 1 - i) * nch + c] * gO)
    out.extend(seg)


pos, first = 0, True
for t, d, _ in edits:
    if d >= 0:
        cut = min(nfr, int(t * sr))
        append(smp[pos * nch:cut * nch], not first, True)
        out.extend(array.array("h", [0]) * (int(d * sr) * nch))
        pos = cut
    else:
        c0, c1 = int((t + d / 2) * sr), int((t - d / 2) * sr)
        append(smp[pos * nch:c0 * nch], not first, True)
        pos = c1
    first = False
append(smp[pos * nch:], not first, False)
with wave.open(a.out_wav, "wb") as f:
    f.setnchannels(nch); f.setsampwidth(2); f.setframerate(sr); f.writeframes(out.tobytes())


# ---- shift the words
def shift(t):
    s = 0.0
    for et, d, _ in edits:
        if d >= 0:
            if et <= t:
                s += d
        else:
            c0, c1 = et + d / 2, et - d / 2
            if t >= c1:
                s += d
            elif t > c0:
                s += c0 - t                      # inside a removed span: snap to the cut
    return round(t + s, 3)


new = [dict(w=w["w"], start=shift(w["start"]), end=shift(w["end"])) for w in words]
for x, y in zip(new, new[1:]):
    if y["start"] < x["start"]:
        sys.exit(f"internal error: word order broke near '{x['w']} {y['w']}'")
pathlib.Path(a.out_words).write_text(json.dumps(new, indent=0, ensure_ascii=False))

added = sum(d for _, d, _ in edits if d > 0)
cut = -sum(d for _, d, _ in edits if d < 0)
print(f"{len(tokens)} script words, {len(s2w)} aligned, {len(words)} words kept" + (f", dropped {dropped}" if dropped else ""))
for label, have, got in rows:
    print(f"  air  {have:4.2f} -> {got:4.2f} s   {label}")
print(f"air added {added:.2f} s, tightened {cut:.2f} s: {nfr / sr:.2f} s -> {len(out) / nch / sr:.2f} s")
print("->", a.out_wav, "+", a.out_words)
