#!/usr/bin/env python3
"""
Universal broadcast audio mixer (`-14 LUFS`, 48kHz stereo):
- Reads untouched narration from `public/voice_raw.wav`
- Mixes frame-accurate physical Foley cues declared in `production/action-cues.json`
  (`events`: `[{ "time": 1.2, "sfx": "paper_rustle", "gain": 0.16, "pan": 0.0 }]`,
   `ambience`: `[{ "t0": 14.0, "t1": 20.0, "kind": "open_breeze", "gain": 0.05 }]`)
- Normalizes integrated loudness to EBU R128 `-14 LUFS` (`-1.5 dBTP`) -> `public/audio_master.wav`
"""
import json
import math
import pathlib
import subprocess
import sys
import wave
import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "vendor" / "templates" / "audio"))
import dsp  # type: ignore

SR = 48000


def read_wav_stereo(path: pathlib.Path) -> np.ndarray:
    with wave.open(str(path), "rb") as wf:
        ch = wf.getnchannels()
        sr = wf.getframerate()
        raw = np.frombuffer(wf.readframes(wf.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0
    if sr != SR:
        raise RuntimeError(f"Expected {SR}Hz wav, got {sr}Hz")
    return raw.reshape(-1, 2) if ch == 2 else np.column_stack([raw, raw])


def place_stereo(buf: np.ndarray, sig: np.ndarray, t_sec: float, gain: float = 1.0, pan: float = 0.0):
    n_total = len(buf)
    idx = int(round(t_sec * SR))
    if idx >= n_total or len(sig) == 0:
        return
    if idx < 0:
        sig = sig[-idx:]
        idx = 0
    end = min(n_total, idx + len(sig))
    seg = sig[: end - idx]
    theta = (pan + 1.0) * (math.pi / 4.0)
    buf[idx:end, 0] += seg * math.cos(theta) * gain
    buf[idx:end, 1] += seg * math.sin(theta) * gain


def sfx_paper_rustle(seed: int = 1, dur: float = 0.24) -> np.ndarray:
    rng = np.random.default_rng(seed)
    n = int(SR * dur)
    t = np.linspace(0, dur, n, endpoint=False)
    sig = dsp.bp(rng.standard_normal(n).astype(np.float32), 1400, 5200)
    env = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 1.4 * (0.55 + 0.45 * np.sin(2 * np.pi * 17 * t))
    return (sig * env).astype(np.float32)


def sfx_cloth_flap(seed: int = 2, dur: float = 0.18) -> np.ndarray:
    rng = np.random.default_rng(seed)
    n = int(SR * dur)
    t = np.linspace(0, dur, n, endpoint=False)
    sig = dsp.bp(rng.standard_normal(n).astype(np.float32), 450, 2100)
    env = np.exp(-t * 18.0) * np.sin(np.pi * np.clip(t / 0.03, 0, 1))
    return (sig * env).astype(np.float32)


def sfx_wood_slam(seed: int = 3) -> np.ndarray:
    rng = np.random.default_rng(seed)
    dur = 0.36
    n = int(SR * dur)
    t = np.linspace(0, dur, n, endpoint=False)
    body = (
        0.65 * np.sin(2 * np.pi * 168 * t) * np.exp(-t * 28)
        + 0.45 * np.sin(2 * np.pi * 342 * t) * np.exp(-t * 42)
        + 0.28 * np.sin(2 * np.pi * 790 * t) * np.exp(-t * 68)
    )
    crack = dsp.bp(rng.standard_normal(n).astype(np.float32), 900, 4200) * np.exp(-t * 85) * 0.85
    sub = np.sin(2 * np.pi * 82 * t) * np.exp(-t * 20) * 0.45
    return (body + crack + sub).astype(np.float32)


def sfx_wood_thud(seed: int = 4) -> np.ndarray:
    rng = np.random.default_rng(seed)
    dur = 0.28
    n = int(SR * dur)
    t = np.linspace(0, dur, n, endpoint=False)
    thump = np.sin(2 * np.pi * 92 * np.exp(-t * 6) * t) * np.exp(-t * 22) * 0.75
    plank = dsp.bp(rng.standard_normal(n).astype(np.float32), 220, 1100) * np.exp(-t * 34) * 0.4
    return (thump + plank).astype(np.float32)


def sfx_stamp_hit(seed: int = 5) -> np.ndarray:
    rng = np.random.default_rng(seed)
    dur = 0.22
    n = int(SR * dur)
    t = np.linspace(0, dur, n, endpoint=False)
    hit = np.sin(2 * np.pi * 135 * t) * np.exp(-t * 32) * 0.55
    snap = dsp.bp(rng.standard_normal(n).astype(np.float32), 1100, 3800) * np.exp(-t * 65) * 0.45
    return (hit + snap).astype(np.float32)


def sfx_hoof_step(seed: int = 6) -> np.ndarray:
    rng = np.random.default_rng(seed)
    dur = 0.11
    n = int(SR * dur)
    t = np.linspace(0, dur, n, endpoint=False)
    clop = dsp.bp(rng.standard_normal(n).astype(np.float32), 380, 1950) * np.exp(-t * 48)
    low = np.sin(2 * np.pi * 128 * t) * np.exp(-t * 38) * 0.35
    return (clop * 0.65 + low).astype(np.float32)


def bed_open_breeze(dur: float, seed: int = 77) -> np.ndarray:
    rng = np.random.default_rng(seed)
    n = max(1, int(SR * dur))
    t = np.linspace(0, dur, n, endpoint=False)
    air = dsp.lp(rng.standard_normal(n).astype(np.float32), 520)
    swell = 0.55 + 0.45 * np.sin(2 * np.pi * 0.22 * t)
    fade = np.minimum(np.clip(t / 0.6, 0, 1), np.clip((dur - t) / 0.5, 0, 1))
    return (air * swell * fade).astype(np.float32)


SFX_BANK = {
    "paper_rustle": sfx_paper_rustle,
    "cloth_flap": sfx_cloth_flap,
    "wood_slam": sfx_wood_slam,
    "wood_thud": sfx_wood_thud,
    "stamp_hit": sfx_stamp_hit,
    "hoof_step": sfx_hoof_step,
}


def main():
    voice = read_wav_stereo(ROOT / "public" / "voice_raw.wav")
    fx = np.zeros_like(voice)

    cues_path = ROOT / "production" / "action-cues.json"
    cues = json.loads(cues_path.read_text()) if cues_path.exists() else {}

    for idx, ev in enumerate(cues.get("events", [])):
        fn = SFX_BANK.get(ev.get("sfx", ""))
        if fn:
            place_stereo(
                fx,
                fn(seed=100 + idx),
                float(ev["time"]),
                gain=float(ev.get("gain", 0.18)),
                pan=float(ev.get("pan", 0.0)),
            )

    for idx, amb in enumerate(cues.get("ambience", [])):
        t0, t1 = float(amb["t0"]), float(amb["t1"])
        if t1 > t0 and amb.get("kind") == "open_breeze":
            b = bed_open_breeze(t1 - t0, seed=300 + idx)
            g = float(amb.get("gain", 0.045))
            place_stereo(fx, b, t0, gain=g, pan=-0.1)
            place_stereo(fx, b, t0 + 0.015, gain=g, pan=0.1)

    mix = voice + fx
    peak = float(np.max(np.abs(mix)))
    if peak > 0.96:
        mix *= 0.96 / peak

    tmp_wav = ROOT / "public" / "audio_pre.wav"
    out_wav = ROOT / "public" / "audio_master.wav"
    pcm = np.clip(mix * 32767.0, -32768, 32767).astype(np.int16)
    with wave.open(str(tmp_wav), "wb") as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(SR)
        wf.writeframes(pcm.tobytes())

    subprocess.run(
        [
            "ffmpeg", "-y", "-i", str(tmp_wav),
            "-af", "loudnorm=I=-14:TP=-1.5:LRA=11",
            "-ar", str(SR), "-ac", "2", str(out_wav),
            "-loglevel", "error",
        ],
        check=True,
    )
    tmp_wav.unlink(missing_ok=True)
    print(f"Wrote {out_wav} ({len(voice) / SR:.2f}s, {SR}Hz stereo)")


if __name__ == "__main__":
    main()
