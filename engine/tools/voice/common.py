"""Shared paths and helpers for the voice-first pipeline (tools/voice/*.py)."""
import json
import os
import re
import subprocess
import sys

import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SR = 48000
# Dub languages: code -> (name, voice locale prefixes, default voice, primary).
# The owner picks the actual voice, speed and pitch per language on the Voices page
# (lessons/<CODE>/voice/voices.json); primary ones are switched on by default.
CATALOG = {
    "en-US": ("English (US)", ["en-US"], "en-US-AvaMultilingualNeural", True),
    "en-GB": ("English (UK)", ["en-GB"], "en-GB-SoniaNeural", True),
    "hi": ("Hindi", ["hi-IN"], "hi-IN-SwaraNeural", True),
    "de": ("German", ["de-"], "de-DE-SeraphinaMultilingualNeural", True),
    "es": ("Spanish", ["es-"], "es-ES-ElviraNeural", True),
    "fr": ("French", ["fr-"], "fr-FR-VivienneMultilingualNeural", True),
    "ar": ("Arabic", ["ar-"], "ar-SA-ZariyahNeural", True),
    "ps": ("Pashto", ["ps-"], "ps-AF-LatifaNeural", False),
    "en-AU": ("English (Australia)", ["en-AU"], "en-AU-NatashaNeural", False),
    "it": ("Italian", ["it-"], "it-IT-IsabellaNeural", False),
    "bn": ("Bengali", ["bn-"], "bn-BD-NabanitaNeural", False),
    "pt-BR": ("Portuguese (Brazil)", ["pt-BR"], "pt-BR-ThalitaMultilingualNeural", False),
    "tr": ("Turkish", ["tr-"], "tr-TR-EmelNeural", False),
    "id": ("Indonesian", ["id-"], "id-ID-GadisNeural", False),
}


def default_voices():
    # owner, 23 Oct 2026: every catalog language is on by default, so all dubs are made together
    return {code: {"enabled": True, "voice": voice, "rate": 0, "pitch": 0} for code, (_, _, voice, _) in CATALOG.items()}


def voice_config(lesson):
    """voices.json merged over the defaults (older files stored just a voice name per language)."""
    cfg = default_voices()
    for code, v in (lesson.load(lesson.path("voices.json"), {}) or {}).items():
        if isinstance(v, str):
            v = {"voice": v, "enabled": True}
        cfg.setdefault(code, {"enabled": True, "voice": v.get("voice"), "rate": 0, "pitch": 0}).update(v)
    return cfg


def line_voice(lesson, key, lang):
    """Effective voice settings for one line: the language default, with any per-line
    speed/pitch the trainer set in the recorder (voice/line-voice.json)."""
    v = dict(voice_config(lesson)[lang])
    v.update((lesson.load(lesson.path("line-voice.json"), {}) or {}).get(key, {}).get(lang, {}))
    return v


# How the dub voices should say names and jargon (TTS only; subtitles keep the real text).
# Extend per lesson in voice/pronounce.json: {"hi": {"from": "to"}}.
PRONOUNCE = {
    "hi": {"Aqsa Jamil": "अक़्सा जमील", "skillovert.com": "स्किलओवर्ट डॉट कॉम", "skillovert": "स्किलओवर्ट"},
    "bn": {"Aqsa Jamil": "আকসা জামিল", "skillovert": "স্কিলওভার্ট"},
    "ar": {"Aqsa Jamil": "أقصى جميل", "skillovert": "سكيل أوفرت"},
    "ps": {"Aqsa Jamil": "اقصی جمیل", "skillovert": "سکیل اوورټ"},
}


def for_tts(lesson, lang, text):
    out = spoken(text)
    fixes = {**PRONOUNCE.get(lang, {}), **(lesson.load(lesson.path("pronounce.json"), {}) or {}).get(lang, {})}
    for a in sorted(fixes, key=len, reverse=True):
        out = out.replace(a, fixes[a])
    return out


def dub_langs(lesson):
    return [c for c, v in voice_config(lesson).items() if v.get("enabled")]


def all_langs(lesson):
    return ["ur-Latn"] + dub_langs(lesson)


LANGS = ["ur-Latn"] + [c for c, v in CATALOG.items() if v[3]]
FFMPEG = os.path.join(ROOT, "node_modules", "@remotion", "compositor-win32-x64-msvc", "ffmpeg.exe")
if not os.path.exists(FFMPEG):  # macOS / Linux builds of the same package, or a system ffmpeg
    import glob
    found = glob.glob(os.path.join(ROOT, "node_modules", "@remotion", "compositor-*", "ffmpeg*"))
    FFMPEG = found[0] if found else "ffmpeg"


class Lesson:
    def __init__(self, code):
        self.code = code.upper()
        self.src = os.path.join(ROOT, "src", "lessons", self.code.lower())
        self.dir = os.path.join(ROOT, "lessons", self.code)
        self.voice = os.path.join(self.dir, "voice")
        os.makedirs(self.voice, exist_ok=True)

    def path(self, *p):
        return os.path.join(self.voice, *p)

    def load(self, p, fallback=None):
        return json.load(open(p, encoding="utf-8")) if os.path.exists(p) else fallback

    def save(self, p, data):
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p + ".tmp", "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=1)
        os.replace(p + ".tmp", p)

    def timeline(self):
        return self.load(os.path.join(self.src, "timeline.json"))

    def base_timeline(self):
        """The script's estimated timeline, kept once as timeline.estimated.json (retime starts from it)."""
        est = os.path.join(self.src, "timeline.estimated.json")
        if not os.path.exists(est):
            self.save(est, self.timeline())
        return self.load(est)

    def lines(self):
        return self.load(self.path("lines.json"), {})

    def i18n(self, lang):
        return self.load(os.path.join(self.dir, "script", "i18n", f"{lang}.json"), {})

    def segments(self):
        """[(key, scene_id, index, base_segment)] in video order."""
        out = []
        for sc in self.base_timeline()["scenes"]:
            for i, g in enumerate(sc["segments"]):
                out.append((f"{sc['id']}/{i}", sc["id"], i, g))
        return out

    def text(self, lang, scene, i, base_vo):
        """Line text for a language: the trainer's edited Urdu for ur-Latn, else the translation."""
        if lang == "ur-Latn":
            return self.lines().get(f"{scene}/{i}", {}).get("text") or base_vo
        segs = self.i18n(lang).get("segments", {}).get(scene, [])
        return segs[i] if i < len(segs) else None


def spoken(text):
    """Text as it should be spoken/subtitled: drop the jargon quote marks."""
    return re.sub(r'["“”]', "", text or "").strip()


def decode(path, start=None, end=None):
    """Any audio file -> mono float32 at SR."""
    cmd = [FFMPEG, "-v", "error"]
    if start is not None:
        cmd += ["-ss", f"{start:.3f}"]
    if end is not None:
        cmd += ["-to", f"{end:.3f}"]
    # this ffmpeg build can only write WAV to a pipe, so read 16-bit PCM back from it
    cmd += ["-i", path, "-f", "wav", "-acodec", "pcm_s16le", "-ac", "1", "-ar", str(SR), "-"]
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    i = raw.find(b"data")
    return np.frombuffer(raw[i + 8 :], dtype=np.int16).astype(np.float32) / 32768


def trim_silence(x, th_db=-45):
    """Cut leading/trailing silence (keeps 60 ms padding)."""
    if len(x) == 0:
        return x
    win = int(SR * 0.02)
    n = len(x) // win
    if n == 0:
        return x
    rms = np.sqrt((x[: n * win].reshape(n, win) ** 2).mean(1))
    th = max(10 ** (th_db / 20), rms.max() * 0.03)
    idx = np.where(rms > th)[0]
    if len(idx) == 0:
        return x
    a = max(0, idx[0] * win - int(SR * 0.06))
    b = min(len(x), (idx[-1] + 1) * win + int(SR * 0.06))
    return x[a:b]


def write_wav(path, x, stereo=True):
    import wave
    x = np.clip(x, -1, 1)
    data = (np.stack([x, x], 1) if stereo else x[:, None]) * 32767
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with wave.open(path, "wb") as w:
        w.setnchannels(2 if stereo else 1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data.astype(np.int16).tobytes())


def arg_code():
    if len(sys.argv) < 2:
        sys.exit(f"usage: python {os.path.basename(sys.argv[0])} L01")
    return sys.argv[1]
