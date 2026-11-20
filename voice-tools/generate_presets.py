#!/usr/bin/env python3
"""
تولید تک‌صدای دوزبانه (Unified-Voice FA + EN) فایل‌های صوتی پایه با «صدای واقعی انسان»
در مسیر public/voice/human/ با حفظ ۱۰۰٪ انگلیسی، تبدیل دقیق اعداد فارسی و
یکدستی کامل طنین صدا (رفع باگ مدل B: انگلیسی با همان صدای اصلی خوانده می‌شود).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "vendor"))
sys.path.insert(0, str(ROOT.parent / "python-engine"))

from app.core.persian_normalizer import PersianTextProcessor  # noqa: E402
from human_voice import synthesize_bilingual_to_wav  # noqa: E402

OUT_DIR = ROOT.parent / "public" / "voice" / "human"


def main() -> int:
    normalizer = PersianTextProcessor()
    config = json.loads((ROOT / "voice_presets.json").read_text(encoding="utf-8"))
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest: dict[str, dict] = {}

    for section in ("speakers", "articles"):
        for item in config[section]:
            norm_text = normalizer.normalize(item["text"])
            out_path = OUT_DIR / item["filename"]
            # حالت تک‌صدا: انگلیسی با همان گوینده اصلی (رفع باگ مدل B)
            voice_mode = item.get("voice_mode", "unified-main")
            res = synthesize_bilingual_to_wav(
                text=norm_text,
                out_path=out_path,
                fa_voice=item["voice"],
                en_voice=item.get("en_voice"),
                gender=item.get("gender", "male"),
                speed=float(item.get("speed", 1.0)),
                pitch_hz=int(item.get("pitch_hz", 0)),
                alpha=float(item.get("alpha", 0.28)),
                beta=float(item.get("beta", 0.72)),
                diffusion_steps=int(item.get("diffusion_steps", 8)),
                voice_mode=voice_mode,
                unified_voice=item.get("unified_voice"),
                persona=item.get("persona", "natural"),
            )
            if not res.get("ok"):
                raise RuntimeError(f"Failed for {item['filename']}: {res}")
            info = {
                "filename": item["filename"],
                "voice": res["voice"],
                "en_voice": res["en_voice"],
                "voice_mode": res.get("voice_mode", voice_mode),
                "unified_voice": res.get("unified_voice"),
                "voice_consistency": res.get("voice_consistency", 1.0),
                "persona": res.get("persona"),
                "persona_label": res.get("persona_label"),
                "alpha": res["alpha"],
                "beta": res["beta"],
                "diffusion_steps": res["diffusion_steps"],
                "bilingual": True,
                "english_preserved": True,
                "engine": "styletts2-human",
                "architecture": "StyleTTS 2 (Style Diffusion + PL-BERT + iSTFTNet)",
                "duration_sec": res["duration_sec"],
                "sample_rate": res["sample_rate"],
                "chunk_count": res["chunk_count"],
                "fa_spans": res["fa_spans"],
                "en_spans": res["en_spans"],
                "waveform_peaks": res["waveform_peaks"],
            }
            manifest[item["filename"]] = info
            print(
                f"[{section}] {item['filename']} -> {info['duration_sec']}s "
                f"(mode={info.get('voice_mode')} voice={info['voice']} consistency={info.get('voice_consistency')}, en_spans={info['en_spans']})"
            )

    (OUT_DIR / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"\n✓ {len(manifest)} فایل دوزبانه انسانی در {OUT_DIR} ساخته شد.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
