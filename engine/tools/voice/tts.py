"""edge-tts helpers for the Voices page.

    python tools/voice/tts.py list                     -> tools/voice/edge-voices.json (all voices)
    python tools/voice/tts.py say VOICE RATE PITCH OUT [CODE LANG]  (text on stdin; RATE/PITCH as numbers, % and Hz)
    python tools/voice/tts.py config L01                -> JSON: language catalog, current choices, sample lines
"""
import asyncio
import json
import os
import sys

import edge_tts

HERE = os.path.dirname(os.path.abspath(__file__))


def main():
    if sys.argv[1] == "list":
        voices = asyncio.run(edge_tts.list_voices())
        slim = [
            {"name": v["ShortName"], "locale": v["Locale"], "gender": v["Gender"], "label": v["FriendlyName"].replace("Microsoft ", "").replace(" Online (Natural)", ""),
             "multilingual": "Multilingual" in v["ShortName"], "styles": v.get("VoiceTag", {}).get("VoicePersonalities", [])}
            for v in voices
        ]
        with open(os.path.join(HERE, "edge-voices.json"), "w", encoding="utf-8") as f:
            json.dump(slim, f, ensure_ascii=False)
        print(len(slim))
    elif sys.argv[1] == "config":
        sys.path.insert(0, HERE)
        from common import CATALOG, Lesson, spoken, voice_config
        lesson = Lesson(sys.argv[2])
        segs = lesson.segments()
        samples = {}
        for code in CATALOG:
            picks = [lesson.text(code, sc, i, g["vo"]) for _, sc, i, g in segs[:12]]
            picks = [spoken(p) for p in picks if p]
            samples[code] = max(picks, key=len) if picks else ""
        out = {"catalog": {c: {"name": n, "prefixes": p, "default": d, "primary": pr} for c, (n, p, d, pr) in CATALOG.items()},
               "config": voice_config(lesson), "samples": samples}
        sys.stdout.buffer.write(json.dumps(out, ensure_ascii=False).encode("utf-8"))
    elif sys.argv[1] == "say":
        voice, rate, pitch, out = sys.argv[2], int(float(sys.argv[3])), int(float(sys.argv[4])), sys.argv[5]
        text = sys.stdin.buffer.read().decode("utf-8")
        if len(sys.argv) > 7:
            sys.path.insert(0, HERE)
            from common import Lesson, for_tts
            text = for_tts(Lesson(sys.argv[6]), sys.argv[7], text)
        asyncio.run(edge_tts.Communicate(text, voice, rate=f"{rate:+d}%", pitch=f"{pitch:+d}Hz").save(out))


if __name__ == "__main__":
    main()
