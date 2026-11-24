#!/usr/bin/env python3
"""
Master broadcast audio builder for the 19.80s Lineless 3D General Test:
- Untouched human-paced narration (`public/voice_raw.wav`, 48kHz)
- Sparse, frame-locked physical Foley SFX ONLY (paper rustle, cloth pocket turn,
  walnut gavel slam, boot-kneel thud, crisp parchment handoff, subtle distant
  open-air cavalry leather/hoof rhythm on the Montana bluff)
- Clean voice-first mix normalized to -14 LUFS.
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
DUR = 19.80
N = int(SR * DUR)


def read_wav_stereo(path: pathlib.Path) -> np.ndarray:
    with wave.open(str(path), "rb") as wf:
        ch = wf.getnchannels()
        sr = wf.getframerate()
        raw = np.frombuffer(wf.readframes(wf.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0
    if ch == 2:
        arr = raw.reshape(-1, 2)
    else:
        arr = np.column_stack([raw, raw])
    if sr != SR:
        raise RuntimeError(f"Expected {SR}Hz wav, got {sr}Hz")
    out = np.zeros((N, 2), dtype=np.float32)
    m = min(N, len(arr))
    out[:m] = arr[:m]
    return out


def place_stereo(buf: np.ndarray, sig: np.ndarray, t_sec: float, gain: float = 1.0, pan: float = 0.0):
    idx = int(round(t_sec * SR))
    if idx >= N or len(sig) == 0:
        return
    if idx < 0:
        sig = sig[-idx:]
        idx = 0
    end = min(N, idx + len(sig))
    seg = sig[: end - idx]
    theta = (pan + 1.0) * (math.pi / 4.0)
    gl, gr = math.cos(theta) * gain, math.sin(theta) * gain
    buf[idx:end, 0] += seg * gl
    buf[idx:end, 1] += seg * gr


def paper_rustle(seed: int = 1, dur: float = 0.24) -> np.ndarray:
    rng = np.random.default_rng(seed)
    n = int(SR * dur)
    t = np.linspace(0, dur, n, endpoint=False)
    noise = rng.standard_normal(n).astype(np.float32)
    # Crisp mid-high paper crinkle band
    sig = dsp.bp(noise, 1400, 5200)
    env = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 1.4 * (0.55 + 0.45 * np.sin(2 * np.pi * 17 * t))
    return (sig * env).astype(np.float32)


def cloth_flap(seed: int = 2, dur: float = 0.18) -> np.ndarray:
    rng = np.random.default_rng(seed)
    n = int(SR * dur)
    t = np.linspace(0, dur, n, endpoint=False)
    noise = rng.standard_normal(n).astype(np.float32)
    sig = dsp.bp(noise, 450, 2100)
    env = np.exp(-t * 18.0) * np.sin(np.pi * np.clip(t / 0.03, 0, 1))
    return (sig * env).astype(np.float32)


def gavel_slam(seed: int = 3) -> np.ndarray:
    rng = np.random.default_rng(seed)
    dur = 0.36
    n = int(SR * dur)
    t = np.linspace(0, dur, n, endpoint=False)
    # Hardwood resonant knock + crisp transient crack
    body = (
        0.65 * np.sin(2 * np.pi * 168 * t) * np.exp(-t * 28)
        + 0.45 * np.sin(2 * np.pi * 342 * t) * np.exp(-t * 42)
        + 0.28 * np.sin(2 * np.pi * 790 * t) * np.exp(-t * 68)
    )
    crack = dsp.bp(rng.standard_normal(n).astype(np.float32), 900, 4200) * np.exp(-t * 85) * 0.85
    sub = np.sin(2 * np.pi * 82 * t) * np.exp(-t * 20) * 0.45
    return (body + crack + sub).astype(np.float32)


def wood_kneel_thud(seed: int = 4) -> np.ndarray:
    rng = np.random.default_rng(seed)
    dur = 0.28
    n = int(SR * dur)
    t = np.linspace(0, dur, n, endpoint=False)
    thump = np.sin(2 * np.pi * 92 * np.exp(-t * 6) * t) * np.exp(-t * 22) * 0.75
    plank = dsp.bp(rng.standard_normal(n).astype(np.float32), 220, 1100) * np.exp(-t * 34) * 0.4
    return (thump + plank).astype(np.float32)


def stamp_thud(seed: int = 5) -> np.ndarray:
    rng = np.random.default_rng(seed)
    dur = 0.22
    n = int(SR * dur)
    t = np.linspace(0, dur, n, endpoint=False)
    hit = np.sin(2 * np.pi * 135 * t) * np.exp(-t * 32) * 0.55
    snap = dsp.bp(rng.standard_normal(n).astype(np.float32), 1100, 3800) * np.exp(-t * 65) * 0.45
    return (hit + snap).astype(np.float32)


def hoof_step(seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    dur = 0.11
    n = int(SR * dur)
    t = np.linspace(0, dur, n, endpoint=False)
    # Packed sandy-earth cavalry hoof clip
    clop = dsp.bp(rng.standard_normal(n).astype(np.float32), 380, 1950) * np.exp(-t * 48)
    low = np.sin(2 * np.pi * 128 * t) * np.exp(-t * 38) * 0.35
    return (clop * 0.65 + low).astype(np.float32)


def montana_breeze(dur: float) -> np.ndarray:
    rng = np.random.default_rng(77)
    n = int(SR * dur)
    t = np.linspace(0, dur, n, endpoint=False)
    air = dsp.lp(rng.standard_normal(n).astype(np.float32), 520)
    swell = 0.55 + 0.45 * np.sin(2 * np.pi * 0.22 * t)
    fade = np.minimum(np.clip(t / 0.6, 0, 1), np.clip((dur - t) / 0.5, 0, 1))
    return (air * swell * fade).astype(np.float32)


def main():
    cues = json.loads((ROOT / "production" / "action-cues.json").read_text())["sfx"]
    voice = read_wav_stereo(ROOT / "public" / "voice_raw.wav")
    fx = np.zeros((N, 2), dtype=np.float32)

    # S01: Custer waves accusation papers in Congress
    place_stereo(fx, paper_rustle(11, 0.26), cues["paperWave"], gain=0.16, pan=-0.12)

    # S02: Custer turns empty pockets inside-out ("couldn't prove")
    place_stereo(fx, cloth_flap(21, 0.19), cues["pocketsTurn"], gain=0.17, pan=-0.20)
    place_stereo(fx, cloth_flap(22, 0.16), cues["pocketsTurn"] + 0.11, gain=0.13, pan=-0.15)

    # S03: Grant slams gavel revoking command
    place_stereo(fx, gavel_slam(31), cues["gavelSlam"], gain=0.30, pan=0.18)
    place_stereo(fx, paper_rustle(32, 0.20), cues["gavelSlam"] + 0.08, gain=0.10, pan=0.05)

    # S04: Custer drops to his knee begging Gen. Terry
    place_stereo(fx, wood_kneel_thud(41), cues["kneelThud"], gain=0.22, pan=-0.18)

    # S05: Terry hands over sealed probation order + probation stamp accent
    place_stereo(fx, paper_rustle(51, 0.24), cues["orderHandoff"], gain=0.17, pan=0.12)
    place_stereo(fx, stamp_thud(52), cues["probationStamp"], gain=0.19, pan=-0.10)

    # S06-S07: Open-air Montana bluff breeze + rhythmic cavalry hoofbeats + playbook lift
    m_start = cues["cavalryStart"]
    m_dur = DUR - m_start
    breeze = montana_breeze(m_dur)
    place_stereo(fx, breeze, m_start, gain=0.045, pan=-0.08)
    place_stereo(fx, breeze, m_start + 0.015, gain=0.045, pan=0.12)

    t_hoof = m_start + 0.08
    step_i = 0
    while t_hoof < DUR - 0.18:
        # 3-beat canter/trot cluster softened as crane pulls high in S07
        dist_atten = 1.0 if t_hoof < 17.0 else max(0.48, 1.0 - (t_hoof - 17.0) * 0.18)
        for sub_off, sub_g in [(0.0, 1.0), (0.11, 0.72), (0.23, 0.84)]:
            if t_hoof + sub_off < DUR - 0.12:
                place_stereo(
                    fx,
                    hoof_step(100 + step_i),
                    t_hoof + sub_off,
                    gain=0.105 * sub_g * dist_atten,
                    pan=-0.15 + 0.30 * ((step_i % 3) / 2.0),
                )
                step_i += 1
        t_hoof += 0.52

    place_stereo(fx, paper_rustle(81, 0.22), cues["playbookLift"], gain=0.14, pan=0.08)

    # Combine untouched narration + subtle physical Foley
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

    # Normalize integrated loudness to -14 LUFS true-peak -1.5 dBTP
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
    print(f"Wrote {out_wav} ({DUR:.2f}s, {SR}Hz stereo)")


if __name__ == "__main__":
    main()
