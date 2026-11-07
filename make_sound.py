"""Sound design for STAY INSIDE Episode 1: music + sound effects mixed under the narration.

Everything is synthesized here (no samples, no lyrics), so there are no licensing issues.
Scene timing follows script-ep1.md. Narration comes from audio/ep1-sceneNN.wav unchanged.

Usage: python3 make_sound.py   ->  audio/ep1-mix.mp3
"""
import subprocess
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy import signal

SR = 24000
LENGTH = 60.0
ROOT = Path(__file__).parent
AUDIO = ROOT / "audio"
rng = np.random.default_rng(7)  # fixed seed: same mix every run

# Scene start times from script-ep1.md, and where the narration starts inside each scene.
SCENE_START = [0, 6, 14, 19, 27, 35, 45, 53]
VO_OFFSET = [1.0, 3.5, 1.0, 2.0, 1.5, 1.5, 2.5, 0.6]  # scene 2 waits for the alert to land

N = int(SR * LENGTH)
t_all = np.arange(N) / SR


# ---------- helpers ----------
def secs(x):
    return int(round(x * SR))


def place(track, clip, at, gain=1.0):
    start = secs(at)
    end = min(N, start + len(clip))
    if start < N:
        track[start:end] += clip[: end - start] * gain


def env(n, attack=0.005, release=0.05):
    e = np.ones(n)
    a, r = min(n, secs(attack)), min(n, secs(release))
    if a:
        e[:a] = np.linspace(0, 1, a)
    if r:
        e[-r:] *= np.linspace(1, 0, r)
    return e


def noise(dur):
    return rng.standard_normal(secs(dur))


def bandpass(x, lo, hi, order=2):
    sos = signal.butter(order, [lo, hi], btype="band", fs=SR, output="sos")
    return signal.sosfilt(sos, x)


def lowpass(x, f, order=2):
    return signal.sosfilt(signal.butter(order, f, btype="low", fs=SR, output="sos"), x)


def highpass(x, f, order=2):
    return signal.sosfilt(signal.butter(order, f, btype="high", fs=SR, output="sos"), x)


def tone(freq, dur, kind="sine"):
    t = np.arange(secs(dur)) / SR
    if kind == "saw":
        return signal.sawtooth(2 * np.pi * freq * t)
    if kind == "square":
        return signal.square(2 * np.pi * freq * t)
    return np.sin(2 * np.pi * freq * t)


def norm(x, peak=1.0):
    m = np.max(np.abs(x)) or 1.0
    return x / m * peak


# ---------- sound effects ----------
def tap():  # phone screen tap / scroll tick
    return norm(highpass(noise(0.025), 2000) * env(secs(0.025), 0.001, 0.02), 0.25)


def buzz(dur):  # phone vibration on a surface
    t = np.arange(secs(dur)) / SR
    motor = signal.square(2 * np.pi * 150 * t) * 0.5 + np.sin(2 * np.pi * 300 * t) * 0.3
    pulse = (np.sin(2 * np.pi * 1.6 * t) > -0.2).astype(float)  # on/off rhythm
    pulse = lowpass(pulse, 30)
    return norm(lowpass(motor, 900) * pulse * env(len(t), 0.01, 0.05), 0.5)


def alert(dur):
    """Harsh emergency alarm: alternating dissonant tones (not the real broadcast EAS tones)."""
    t = np.arange(secs(dur)) / SR
    hi = np.sin(2 * np.pi * 1180 * t) + 0.5 * np.sin(2 * np.pi * 1245 * t)
    lo = np.sin(2 * np.pi * 740 * t) + 0.5 * np.sin(2 * np.pi * 785 * t)
    switch = (np.floor(t * 4) % 2).astype(float)
    switch = lowpass(switch, 80)
    x = hi * switch + lo * (1 - switch)
    x = np.tanh(x * 2.0)  # slightly distorted phone speaker
    x = bandpass(x, 500, 4000)
    return norm(x * env(len(t), 0.01, 0.3), 0.55)


def cupboard_creak():
    dur = 0.7
    t = np.arange(secs(dur)) / SR
    f = 380 + 140 * np.sin(2 * np.pi * 2.2 * t)  # wobbling hinge squeak
    x = signal.sawtooth(2 * np.pi * np.cumsum(f) / SR) * (0.5 + 0.5 * rng.random(len(t)) ** 4)
    return norm(bandpass(x, 600, 3000) * env(len(t), 0.05, 0.2), 0.18)


def hum(dur):  # fridge / house hum
    t = np.arange(secs(dur)) / SR
    x = np.sin(2 * np.pi * 60 * t) + 0.5 * np.sin(2 * np.pi * 120 * t) + 0.2 * np.sin(2 * np.pi * 180 * t)
    return norm(x * env(len(t), 0.8, 0.8), 0.06)


def footstep(soft=1.0):
    d = 0.12
    thump = tone(70, d) * np.exp(-np.arange(secs(d)) / secs(0.03))
    scuff = bandpass(noise(d), 300, 2500) * np.exp(-np.arange(secs(d)) / secs(0.02))
    return norm(thump + 0.4 * scuff, 0.35 * soft)


def deadbolt():
    d = 0.18
    n = secs(d)
    click1 = highpass(noise(d), 1500) * np.exp(-np.arange(n) / secs(0.006))
    metal = (np.sin(2 * np.pi * 2300 * np.arange(n) / SR) + np.sin(2 * np.pi * 3700 * np.arange(n) / SR))
    metal *= np.exp(-np.arange(n) / secs(0.04))
    a = norm(click1 + 0.3 * metal, 0.7)
    out = np.zeros(secs(0.3))
    out[: len(a)] += a
    out[secs(0.09): secs(0.09) + len(a)] += a * 0.8  # "cla-CK"
    return out


def chair_drag(dur=1.8):
    t = np.arange(secs(dur)) / SR
    grain = bandpass(noise(dur), 150, 1800)
    chatter = 0.6 + 0.4 * np.sin(2 * np.pi * 23 * t + 3 * np.sin(2 * np.pi * 1.3 * t))
    return norm(grain * chatter * env(len(t), 0.08, 0.15), 0.3)


def chair_thunk():
    d = 0.35
    n = secs(d)
    x = tone(95, d) * np.exp(-np.arange(n) / secs(0.06)) + 0.3 * bandpass(noise(d), 200, 1200) * np.exp(-np.arange(n) / secs(0.03))
    return norm(x, 0.55)


def blinds_rustle():
    d = 0.9
    t = np.arange(secs(d)) / SR
    x = bandpass(noise(d), 2500, 8000) * (rng.random(len(t)) ** 6)
    x = lowpass(np.abs(x), 6000) * np.sign(x)
    return norm(x * env(len(t), 0.05, 0.3), 0.22)


def wind(dur):  # outdoor night air, heard muffled through the window
    t = np.arange(secs(dur)) / SR
    x = lowpass(noise(dur), 500)
    swell = 0.6 + 0.4 * np.sin(2 * np.pi * 0.11 * t + 1.0)
    return norm(x * swell * env(len(t), 2.0, 2.0), 0.09)


def shuffle_step():  # zombie's dragged foot: thud + long scrape
    d = 0.7
    n = secs(d)
    thud = tone(55, 0.15) * np.exp(-np.arange(secs(0.15)) / secs(0.04))
    scrape = lowpass(bandpass(noise(d), 250, 2200), 1500) * np.linspace(1, 0, n) ** 1.5
    x = np.zeros(n)
    x[: len(thud)] += thud
    x[secs(0.08):] += 0.5 * scrape[: n - secs(0.08)]
    return norm(lowpass(x, 1600), 0.25)  # muffled: it's outside


def groan(dur=1.8, pitch=85):
    """Low, wet zombie groan: wobbling sawtooth through vowel-like filters. PG-13, not gory."""
    t = np.arange(secs(dur)) / SR
    f0 = pitch * (1 + 0.06 * np.sin(2 * np.pi * 3.1 * t) + 0.04 * rng.standard_normal(len(t)).cumsum() / np.sqrt(len(t)))
    f0 *= np.linspace(1.08, 0.88, len(t))  # falls off at the end
    src = signal.sawtooth(2 * np.pi * np.cumsum(f0) / SR)
    src += 0.25 * lowpass(noise(dur), 1200)  # breath
    vowel = bandpass(src, 250, 500) + 0.6 * bandpass(src, 700, 1100) + 0.2 * bandpass(src, 2200, 2800)
    rough = 0.7 + 0.3 * np.abs(np.sin(2 * np.pi * 11 * t))
    return norm(lowpass(vowel * rough, 1800) * env(len(t), 0.25, 0.6), 0.32)


def ringtone(dur):
    """Simple marimba-like ringtone (original pattern), from a phone speaker."""
    notes = [784, 988, 1175, 988, 784, 0, 1175, 988]
    step = 0.16
    pattern = np.zeros(secs(step * len(notes) + 0.6))
    for i, f in enumerate(notes):
        if not f:
            continue
        n = secs(0.3)
        tt = np.arange(n) / SR
        note = (np.sin(2 * np.pi * f * tt) + 0.3 * np.sin(2 * np.pi * 2 * f * tt)) * np.exp(-tt / 0.08)
        place_local = secs(i * step)
        pattern[place_local: place_local + n] += note
    out = np.zeros(secs(dur))
    pos = 0
    while pos < len(out):
        end = min(len(out), pos + len(pattern))
        out[pos:end] += pattern[: end - pos]
        pos += len(pattern)
    out = bandpass(out, 400, 5000)
    return norm(out * env(len(out), 0.005, 0.05), 0.4)


def heartbeat(start, end, bpm_start, bpm_end, gain):
    track = np.zeros(N)
    tpos = start
    while tpos < end:
        frac = (tpos - start) / max(1e-6, end - start)
        bpm = bpm_start + (bpm_end - bpm_start) * frac
        for k, g in ((0, 1.0), (0.22, 0.7)):  # lub-dub
            d = 0.18
            n = secs(d)
            beat = tone(52, d) * np.exp(-np.arange(n) / secs(0.05))
            place(track, beat, tpos + k, gain * g)
        tpos += 60.0 / bpm
    return track


def boom(dur=3.0):  # end-card stinger: low hit + long rumble
    n = secs(dur)
    tt = np.arange(n) / SR
    sweep = np.sin(2 * np.pi * np.cumsum(np.linspace(90, 32, n)) / SR) * np.exp(-tt / 0.9)
    rumble = lowpass(noise(dur), 120) * np.exp(-tt / 1.2)
    crack = highpass(noise(0.08), 800) * np.exp(-np.arange(secs(0.08)) / secs(0.01))
    x = sweep + 0.6 * norm(rumble)
    x[: len(crack)] += 0.4 * crack
    return norm(x, 0.9)


# ---------- music ----------
def pad_note(freq, dur, bright=600):
    t = np.arange(secs(dur)) / SR
    x = sum(signal.sawtooth(2 * np.pi * freq * (1 + d) * t) for d in (-0.004, 0.0, 0.005)) / 3
    x = lowpass(x, bright)
    return x * env(len(t), 1.5, 1.5)


def music():
    m = np.zeros(N)
    # Low D drone under the whole episode, very quiet in scene 1, growing after the alert.
    drone = pad_note(36.71, LENGTH, 220) + 0.6 * pad_note(73.42, LENGTH, 300)
    level = np.interp(t_all, [0, 6, 7, 35, 45, 57.4, 57.5, 60], [0.15, 0.15, 0.55, 0.7, 0.9, 1.0, 0.0, 0.0])
    m += norm(drone) * level * 0.5

    # Scene 1: calm, slightly uneasy major-ish pad (the "ordinary night").
    for f in (146.83, 220.0, 293.66):  # D3 A3 D4
        place(m, pad_note(f, 6.5, 900), 0.0, 0.07)

    # From the alert on: slow minor progression Dm - Bb - Gm - A (8s each), darker filter.
    chords = [(146.83, 174.61, 220.0), (116.54, 146.83, 174.61), (98.0, 116.54, 146.83), (110.0, 138.59, 164.81)]
    t0 = 7.0
    i = 0
    while t0 < 57.0:
        dur = min(8.5, 57.5 - t0)
        for f in chords[i % 4]:
            place(m, pad_note(f, dur, 500 + 60 * i), t0, 0.06)
        t0 += 8.0
        i += 1

    # High eerie tone (slowly bending) when the Slow One appears, rising in scene 7–8.
    d = 57.5 - 35.0
    tt = np.arange(secs(d)) / SR
    f = 1174.66 * (1 + 0.01 * np.sin(2 * np.pi * 0.3 * tt)) * np.linspace(1.0, 1.06, len(tt))
    eerie = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(len(tt), 4.0, 0.05)
    eerie *= np.linspace(0.3, 1.0, len(tt))
    place(m, eerie, 35.0, 0.025)

    # Hard silence for the cut to black at 57.5, then the stinger is added as an effect.
    m[secs(57.5):] = 0
    return m


# ---------- build ----------
def build():
    # Narration track (unchanged voice files).
    vo = np.zeros(N)
    for i, (start, off) in enumerate(zip(SCENE_START, VO_OFFSET), 1):
        clip, sr = sf.read(AUDIO / f"ep1-scene{i:02d}.wav", dtype="float64")
        assert sr == SR, f"expected {SR} Hz voice files"
        place(vo, clip, start + off)

    fx = np.zeros(N)
    # Scene 1 — couch: soft scroll taps, room hum.
    place(fx, hum(6.2), 0.0, 1.0)
    for at in (0.6, 2.4, 4.6, 5.3):
        place(fx, tap(), at)
    # Scene 2 — the alert: alarm + violent buzz, then thumb taps OK.
    place(fx, alert(3.2), 6.0, 1.0)
    place(fx, buzz(3.2), 6.0, 0.9)
    place(fx, tap(), 12.6, 1.6)
    # Scene 3 — kitchen: cupboard, fridge hum.
    place(fx, cupboard_creak(), 14.4)
    place(fx, hum(5.0), 14.0, 1.4)
    # Scene 4 — door: quick steps, deadbolt, chair drag, wedge.
    for k in range(4):
        place(fx, footstep(), 19.1 + 0.28 * k)
    place(fx, deadbolt(), 20.6)
    place(fx, chair_drag(1.6), 22.0)
    place(fx, chair_thunk(), 23.7)
    # Scene 5 — blinds open, outside air.
    place(fx, blinds_rustle(), 27.4)
    place(fx, wind(30.0), 27.8, 1.0)
    # Scene 6 — the Slow One: dragging steps, groan, your heartbeat starts.
    for at in (35.3, 36.6, 37.9, 39.2):
        place(fx, shuffle_step(), at)
    place(fx, groan(2.0, 82), 40.2)
    fx += heartbeat(38.5, 45.0, 62, 80, 0.35)
    # Scene 7 — ringtone + buzz; it turns, groans, steps closer.
    ring = np.zeros(N)  # kept separate so it can dip further under the voice
    place(ring, ringtone(12.3), 45.2, 1.0)
    place(ring, buzz(12.3), 45.2, 0.7)
    place(fx, groan(1.6, 95), 47.2, 1.1)
    place(fx, shuffle_step(), 48.9, 1.3)
    fx += heartbeat(45.0, 57.4, 85, 125, 0.45)
    # Scene 8 — keeps ringing; hard cut to black at 57.5 with a stinger.
    fx[secs(57.5):] = 0
    ring[secs(57.5):] = 0
    place(fx, boom(2.5), 57.5, 1.0)

    # Ducking: lower music and effects while the narrator speaks so the voice stays clear.
    voice_env = np.abs(vo)
    voice_env = lowpass(voice_env, 8, order=1)
    voice_env = np.convolve(voice_env > 0.003, np.ones(secs(0.25)) / secs(0.25), mode="same")  # small lookahead/hold
    voice_env = np.clip(lowpass(voice_env, 4, order=1) * 1.5, 0, 1)
    music_gain = 1 - 0.65 * voice_env  # about -9 dB under voice
    fx_gain = 1 - 0.5 * voice_env  # about -6 dB under voice
    ring_gain = 1 - 0.8 * voice_env  # ringtone shares the voice's range: about -14 dB under voice

    mus = music()
    bed = mus * music_gain * 0.9 + fx * fx_gain + ring * ring_gain
    mix = vo * 1.0 + bed * 0.55
    mix = np.tanh(mix * 1.1) / 1.1  # gentle safety limiter
    return mix, vo, bed


def main():
    mix, vo, bed = build()
    tmp = AUDIO / "ep1-mix.tmp.wav"
    sf.write(tmp, mix.astype(np.float32), SR)
    out = AUDIO / "ep1-mix.mp3"
    # Normalize to a standard online-video loudness, then encode MP3.
    subprocess.run(
        ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(tmp),
         "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "44100", "-ac", "2",
         "-codec:a", "libmp3lame", "-b:a", "192k", str(out)],
        check=True,
    )
    tmp.unlink()

    # Report how much louder the voice is than the bed while the narrator speaks.
    speaking = np.abs(vo) > 0.02
    rms = lambda x: np.sqrt(np.mean(x[speaking] ** 2))
    print(f"wrote {out}  ({LENGTH:.0f}s)")
    print(f"voice vs. music+fx while speaking: {20 * np.log10(rms(vo) / rms(bed * 0.55)):.1f} dB")


if __name__ == "__main__":
    main()
