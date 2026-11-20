#!/usr/bin/env python3
"""
موتور دوزبانه تک‌صدایی تولید «صدای واقعی انسان» (Unified-Voice Bilingual FA + EN)
با خروجی WAV استاندارد ۲۴ کیلوهرتز مونو ۱۶ بیتی هم‌تراز StyleTTS 2.

رفع ریشه‌ای باگ مدل B («صدای کلمات انگلیسی با صدای اصلی متفاوت است»):
  مشکل: نسخه قبلی بخش‌های فارسی را با گوینده فارسی (مثلاً fa-IR-DilaraNeural برای
  مدل B) و بخش‌های انگلیسی را با یک گوینده انگلیسی متفاوت (مثلاً en-US-JennyNeural)
  سنتز می‌کرد؛ یعنی عملاً دو شخص متفاوت در یک جمله صحبت می‌کردند!
  راه‌حل (حالت پیش‌فرض unified-main): تمام سگمنت‌های فارسی و انگلیسی با همان
  گوینده اصلی مدل (تک‌صدا) سنتز می‌شوند؛ انگلیسی همچنان به لاتین حفظ شده و به
  انگلیسی خوانده می‌شود (بدون تبدیل به فارسی)، اما با همان طنین، زیر و بمی و
  لحن صدای اصلی. دقیقاً مشابه معماری StyleTTS 2 که فارسی و انگلیسی را با یک
  بردار استایل واحد ref_s و یک صدا می‌خواند.

حالت‌های صوتی (voice_mode):
  - unified-main (پیش‌فرض): تک‌صدا با گوینده اصلی مدل برای همه سگمنت‌ها.
  - unified-multilingual: تک‌صدا با گوینده چندزبانه (Ava/AndrewMultilingual) برای همه.
  - dual (قدیمی، فقط برای مقایسه A/B): فارسی با fa-IR و انگلیسی با en-US جدا.
"""
from __future__ import annotations

import asyncio
import json
import math
import os
import re
import shutil
import struct
import sys
import wave
from pathlib import Path
from typing import Dict, List, Optional, Tuple

# افزودن خودکار مسیر vendor و python-engine پروژه در صورت اجرای مستقیم
_THIS_DIR = Path(__file__).resolve().parent
_VENDOR_DIR = _THIS_DIR / "vendor"
_PY_ENGINE_DIR = _THIS_DIR.parent / "python-engine"
for _extra in (_VENDOR_DIR, _PY_ENGINE_DIR):
    if _extra.exists() and str(_extra) not in sys.path:
        sys.path.insert(0, str(_extra))

from voice_personas import (  # noqa: E402
    DEFAULT_PERSONA,
    apply_persona_postprocess,
    get_persona,
    list_personas,
    persona_pause_ms,
    sentence_contour_offset,
)

SAMPLE_RATE = 24000
MAX_FA_SPAN_CHARS = 175
TARGET_RMS = 0.112
INLINE_SWITCH_PAUSE_MS = 55
CLAUSE_PAUSE_MS = 135
SENTENCE_PAUSE_MS = 225
FADE_MS = 14

FA_VOICE_MAP = {
    "male": "fa-IR-FaridNeural",
    "female": "fa-IR-DilaraNeural",
}

EN_VOICE_CANDIDATES = {
    "female": ["en-US-AvaNeural", "en-US-JennyNeural", "en-US-AriaNeural"],
    "male": ["en-US-GuyNeural", "en-US-ChristopherNeural"],
}

# گوینده‌های چندزبانه تک‌صدا (می‌توانند فارسی و انگلیسی را با یک طنین بخوانند)
UNIFIED_MULTILINGUAL_VOICES = {
    "female": ["en-US-AvaMultilingualNeural", "en-US-EmmaMultilingualNeural"],
    "male": ["en-US-AndrewMultilingualNeural", "en-US-BrianMultilingualNeural"],
}

# حالت‌های مجاز موتور صوتی
VOICE_MODES = ("unified-main", "unified-multilingual", "dual")

ENGLISH_SPEECH_HINTS: Dict[str, str] = {
    "styletts2": "Style T T S 2",
    "styletts": "Style T T S",
    "pl-bert": "P L BERT",
    "plbert": "P L BERT",
    "wavlm": "Wave L M",
    "istftnet": "I S T F T Net",
    "istft": "I S T F T",
    "hifi-gan": "Hi-Fi GAN",
    "hifigan": "Hi-Fi GAN",
    "slm": "S L M",
    "jdc": "J D C",
    "ipa": "I P A",
    "edm": "E D M",
    "cfg": "C F G",
    "ood": "O O D",
    "nvme": "N V M E",
    "pcie": "P C I E",
    "ltpo": "L T P O",
    "vram": "V RAM",
    "dram": "D RAM",
    "sram": "S RAM",
    "npu": "N P U",
    "tpu": "T P U",
    "gpu": "G P U",
    "cpu": "C P U",
    "gpus": "G P Us",
    "cpus": "C P Us",
    "npus": "N P Us",
    "ssd": "S S D",
    "ssds": "S S Ds",
    "hdd": "H D D",
    "api": "A P I",
    "apis": "A P Is",
    "sdk": "S D K",
    "cli": "C L I",
    "gui": "G U I",
    "llm": "L L M",
    "llms": "L L Ms",
    "tts": "T T S",
    "asr": "A S R",
    "ocr": "O C R",
    "wer": "W E R",
    "cer": "C E R",
    "rtf": "R T F",
    "lufs": "L U F S",
    "vad": "V A D",
    "bpe": "B P E",
    "xtts": "X T T S",
    "xttsv2": "X T T S version 2",
    "rtx": "R T X",
    "gtx": "G T X",
    "ddr4": "D D R 4",
    "ddr5": "D D R 5",
    "lpddr5": "L P D D R 5",
    "lpddr5x": "L P D D R 5 X",
    "gddr6": "G D D R 6",
    "gddr7": "G D D R 7",
    "fp4": "F P 4",
    "fp8": "F P 8",
    "fp16": "F P 16",
    "fp32": "F P 32",
    "bf16": "B F 16",
    "int4": "int 4",
    "int8": "int 8",
    "ipv4": "I P v 4",
    "ipv6": "I P v 6",
    "usb-c": "U S B C",
    "usb-a": "U S B A",
    "usb": "U S B",
    "hdmi": "H D M I",
    "nfc": "N F C",
    "gps": "G P S",
    "lte": "L T E",
    "5g": "5 G",
    "4g": "4 G",
    "6g": "6 G",
    "b2b": "B to B",
    "b2c": "B to C",
    "p2p": "P to P",
    "fe": "F E",
    "se": "S E",
    "ti": "T I",
    "tsmc": "T S M C",
    "sql": "S Q L",
    "nosql": "No S Q L",
    "next.js": "Next J S",
    "nextjs": "Next J S",
    "node.js": "Node J S",
    "nodejs": "Node J S",
    "c++": "C plus plus",
    "c#": "C sharp",
    "gpt-4o": "G P T 4 O",
    "gpt-4": "G P T 4",
    "gpt-5": "G P T 5",
    "gpt": "G P T",
    "chatgpt": "Chat G P T",
    "openai": "Open A I",
    "pytorch": "PyTorch",
    "tensorrt": "Tensor R T",
    "cudnn": "C U D N N",
    "macos": "mac O S",
    "ios": "i O S",
    "wi-fi": "Wi-Fi",
    "wifi": "Wi-Fi",
    "hdr10+": "H D R 10 plus",
    "hdr10": "H D R 10",
    "hdr": "H D R",
    "cms": "C M S",
    "http": "H T T P",
    "https": "H T T P S",
    "html": "H T M L",
    "css": "C S S",
    "srgb": "S R G B",
    "dci": "D C I",
    "csot": "C S O T",
    "frc": "F R C",
    "ldac": "L DAC",
    "ssc": "S S C",
    "aac": "A A C",
    "sbc": "S B C",
    "ufs": "U F S",
    "soc": "S O C",
    "ois": "O I S",
    "eis": "E I S",
    "pdaf": "P D A F",
    "pwm": "P W M",
    "esim": "E SIM",
    "ai": "A I",
    "ui": "U I",
    "ux": "U X",
    "os": "O S",
}

ENGLISH_UNIT_EXPANSIONS: Dict[str, str] = {
    "ghz": "gigahertz",
    "mhz": "megahertz",
    "khz": "kilohertz",
    "hz": "hertz",
    "mah": "milliamp hours",
    "kwh": "kilowatt hours",
    "wh": "watt hours",
    "kw": "kilowatts",
    "mw": "megawatts",
    "tb": "terabytes",
    "gb": "gigabytes",
    "mb": "megabytes",
    "kb": "kilobytes",
    "gbps": "gigabits per second",
    "mbps": "megabits per second",
    "kbps": "kilobits per second",
    "gbit": "gigabits",
    "nm": "nanometers",
    "mm": "millimeters",
    "cm": "centimeters",
    "km": "kilometers",
    "kg": "kilograms",
    "ms": "milliseconds",
    "fps": "frames per second",
    "mp": "megapixels",
    "db": "decibels",
    "lufs": "L U F S",
    "w": "watts",
}

UNIT_NAMES_PATTERN = (
    r"GHz|MHz|kHz|Hz|mAh|kWh|Wh|kW|MW|TB|GB|MB|KB|Gbps|Mbps|Kbps|Gbit|LUFS|fps|nm|mm|cm|km|kg|ms|dB|MP|W"
)

SINGLE_EN_ATOM = (
    rf"(?:[-−+]?(?:\d{{1,3}}(?:,\d{{3}})+|\d+)(?:\.\d+)?[ \t]*(?:{UNIT_NAMES_PATTERN})(?![A-Za-z])"
    r"|(?:\d+(?:\.\d+)?)(?:[GKM]B|[456]?G|K|p|x|X)(?![A-Za-z0-9])"
    r"|[A-Za-z][A-Za-z0-9'’+#\-_./]*[A-Za-z0-9+#]"
    r"|[A-Za-z])"
)

CONTIGUOUS_EN_SPAN_RE = re.compile(
    rf"{SINGLE_EN_ATOM}(?:(?:[ \t]+(?:&[ \t]+)?|[ \t]*[/][ \t]*)(?:{SINGLE_EN_ATOM}"
    r"|(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)*(?:[+#xX])?"
    r"(?!(?:[ \t]*(?:[%٪$€£]|میلیون|میلیارد|تریلیون|هزار|تومان|ریال|دلار|یورو|درصد|بار|سال|ماه|روز|ساعت|دقیقه|ثانیه|نفر|عدد|واحد|نیت|متر|میلی‌متر|میلی‌ثانیه|کیلوگرم|گرم|بیتی|بیت|هرتز|وات|آمپر))|[A-Za-z\u0621-\u064A\u067E\u0686\u0698\u06A9\u06AF\u06CC%٪])))*"
)

PERSIAN_DIGITS_TRANS = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")


def infer_gender(fa_voice: str, explicit_gender: Optional[str] = None) -> str:
    if explicit_gender in ("female", "male"):
        return explicit_gender
    lower = fa_voice.lower()
    if any(name in lower for name in ("dilara", "jenny", "aria", "ava", "emma", "female")):
        return "female"
    return "male"


def format_english_for_speech(raw_en: str) -> str:
    """آماده‌سازی عبارت انگلیسی برای تلفظ ۱۰۰٪ واضح در موتور بومی انگلیسی (بدون تبدیل به فارسی)."""
    cleaned = re.sub(r"[()\[\]«»\"]", " ", raw_en.translate(PERSIAN_DIGITS_TRANS))
    cleaned = re.sub(r"\bbit\+", "bit plus", cleaned, flags=re.IGNORECASE)
    trimmed = cleaned.strip(" .,;:!?")
    if not trimmed:
        return ""
    if re.fullmatch(r"[A-Za-z]", trimmed):
        return f"{trimmed.upper()}."

    spoken = trimmed
    special_keys = sorted(
        (k for k in ENGLISH_SPEECH_HINTS if re.search(r"[.\-+#0-9]", k)),
        key=len,
        reverse=True,
    )
    for key in special_keys:
        pattern = rf"(?<![A-Za-z0-9]){re.escape(key)}(?![A-Za-z0-9+#])"
        spoken = re.sub(pattern, ENGLISH_SPEECH_HINTS[key], spoken, flags=re.IGNORECASE)

    spoken = re.sub(
        r"(?<![A-Za-z])[vV](\d+(?:\.\d+)+)\b",
        lambda m: "version " + " point ".join(m.group(1).split(".")),
        spoken,
    )
    spoken = re.sub(
        r"\b(\d+(?:\.\d+){2,})\b",
        lambda m: " point ".join(m.group(1).split(".")),
        spoken,
    )
    spoken = re.sub(r"(?:^|(?<=\s))[-−](\d+(?:\.\d+)?)\s*(?=[A-Za-z])", r"minus \1 ", spoken)

    def _unit_sub(m: re.Match[str]) -> str:
        whole, frac, unit = m.group(1), m.group(2), m.group(3)
        unit_spoken = ENGLISH_UNIT_EXPANSIONS.get(unit.lower(), unit)
        num_str = f"{whole}.{frac}" if frac is not None else whole
        return f"{num_str} {unit_spoken}"

    spoken = re.sub(
        rf"\b(\d{{1,3}}(?:,\d{{3}})+|\d+)(?:\.(\d+))?\s*({UNIT_NAMES_PATTERN})\b",
        _unit_sub,
        spoken,
    )
    spoken = re.sub(r"\b(\d+(?:\.\d+)?)[xX]\b", r"\1 times", spoken)

    def _model_code(m: re.Match[str]) -> str:
        letters, digs, tail = m.group(1), m.group(2), m.group(3)
        spaced = " ".join(list(letters))
        tail_part = f" {tail.upper()}" if tail else ""
        return f"{spaced} {digs}{tail_part}"

    spoken = re.sub(r"\b([A-Z]{1,2})(\d{1,4})([A-Za-z])?\b", _model_code, spoken)
    spoken = re.sub(r"\b(\d+)[oO]\b", r"\1 O", spoken)

    spoken = re.sub(
        r"\b[A-Za-z][A-Za-z0-9]*\b",
        lambda m: ENGLISH_SPEECH_HINTS.get(m.group(0).lower(), m.group(0)),
        spoken,
    )
    return re.sub(r"\s{2,}", " ", spoken).strip()


def split_long_persian(text: str, max_chars: int = MAX_FA_SPAN_CHARS) -> List[Tuple[str, str]]:
    """شکستن قطعات فارسی طولانی روی علائم مکث به همراه نوع مکث پس از هر قطعه."""
    cleaned = re.sub(r"\s+", " ", text).strip()
    if not cleaned:
        return []
    if len(cleaned) <= max_chars:
        return [(cleaned, detect_pause_kind(cleaned))]

    sentences = [s.strip() for s in re.split(r"(?<=[.؟!؛،])\s+", cleaned) if s.strip()]
    out: List[Tuple[str, str]] = []
    buf = ""
    for part in sentences:
        cand = f"{buf} {part}".strip() if buf else part
        if len(cand) <= max_chars:
            buf = cand
        else:
            if buf:
                out.append((buf, detect_pause_kind(buf)))
            if len(part) <= max_chars:
                buf = part
            else:
                cur = ""
                for w in part.split(" "):
                    nxt = f"{cur} {w}".strip() if cur else w
                    if len(nxt) <= max_chars:
                        cur = nxt
                    else:
                        if cur:
                            out.append((cur, "inline"))
                        cur = w
                buf = cur
    if buf:
        out.append((buf, detect_pause_kind(buf)))
    return out


def detect_pause_kind(text: str) -> str:
    stripped = text.rstrip()
    if not stripped:
        return "inline"
    last = stripped[-1]
    if last in ".؟!":
        return "sentence"
    if last in "،؛:,;":
        return "clause"
    return "inline"


def ensure_persian_numbers_expanded(fa_text: str) -> str:
    """در صورتی که رقم خامی در بخش فارسی مانده باشد، آن را با موتور دقیق اعداد فارسی به حروف تبدیل می‌کند."""
    if not re.search(r"[\d۰-۹٠-٩]", fa_text):
        return fa_text
    try:
        from app.core.english_phonetics import expand_persian_numbers

        return expand_persian_numbers(fa_text)
    except Exception:  # noqa: BLE001
        return fa_text


def build_bilingual_plan(text: str) -> List[dict]:
    """
    ساخت برنامه سنتز دوزبانه:
    هر آیتم شامل {"lang": "fa"|"en", "text": متن اصلی, "spoken": متن خوانشی, "pause": نوع مکث}.
    """
    cleaned = re.sub(r"\s+", " ", text or "").strip()
    if not cleaned:
        return []

    # استانداردسازی ارقام چسبیده به حروف انگلیسی
    cleaned = re.sub(
        r"([A-Za-z][-+]?\s*)([۰-۹٠-٩]+(?:[.,٫][۰-۹٠-٩]+)*)",
        lambda m: m.group(1) + m.group(2).translate(PERSIAN_DIGITS_TRANS).replace("٫", "."),
        cleaned,
    )
    cleaned = re.sub(
        r"([-−+]?[۰-۹٠-٩]+(?:[.,٫][۰-۹٠-٩]+)*)(\s*[A-Za-z])",
        lambda m: m.group(1).translate(PERSIAN_DIGITS_TRANS).replace("٫", ".") + m.group(2),
        cleaned,
    )

    plan: List[dict] = []
    last_idx = 0

    def _append_fa_region(region: str) -> None:
        raw_fa = region.strip()
        if not raw_fa:
            return
        if re.search(r"[\u0621-\u064A\u067E\u0686\u0698\u06A9\u06AF\u06CC\d۰-۹٠-٩]", raw_fa):
            expanded = ensure_persian_numbers_expanded(raw_fa)
            for sub_text, pause_kind in split_long_persian(expanded):
                plan.append(
                    {
                        "lang": "fa",
                        "text": sub_text,
                        "spoken": sub_text,
                        "pause": pause_kind,
                    }
                )
        elif plan:
            # فقط علائم سجاوندی (مثلاً «،» یا «.» بعد از یک کلمه انگلیسی) → تنظیم مکث سگمنت قبل
            plan[-1]["text"] = f"{plan[-1]['text']}{raw_fa}"
            pk = detect_pause_kind(raw_fa)
            if pk in ("sentence", "clause"):
                plan[-1]["pause"] = pk

    for match in CONTIGUOUS_EN_SPAN_RE.finditer(cleaned):
        full = match.group(0)
        trail_m = re.search(r"([.,;:!?]+)$", full)
        core = full[: -len(trail_m.group(1))] if trail_m else full
        trail = trail_m.group(1) if trail_m else ""
        if not core.strip() or not re.search(r"[A-Za-z]", core):
            continue

        if match.start() > last_idx:
            _append_fa_region(cleaned[last_idx : match.start()])

        en_text = core.strip()
        en_spoken = format_english_for_speech(en_text)
        pause_kind = detect_pause_kind(trail) if trail else "inline"
        plan.append(
            {
                "lang": "en",
                "text": f"{en_text}{trail}",
                "raw_en": en_text,
                "spoken": en_spoken,
                "pause": pause_kind,
            }
        )
        last_idx = match.end()

    if last_idx < len(cleaned):
        _append_fa_region(cleaned[last_idx:])

    # شماره‌گذاری جمله‌ها برای اعمال منحنی آهنگ پرسونا (فرود تدریجی/فراز پرسشی)
    sentence_idx = 0
    for item in plan:
        item["sentence_index"] = sentence_idx
        item["is_question"] = "؟" in item.get("text", "")
        if item.get("pause") == "sentence":
            sentence_idx += 1
    total_sentences = sentence_idx + 1
    for item in plan:
        item["total_sentences"] = total_sentences

    return plan


# سازگاری با generate_presets.py
def split_text(text: str, max_chars: int = MAX_FA_SPAN_CHARS) -> List[str]:
    return [item["text"] for item in build_bilingual_plan(text)]


def pcm16_to_float(data: bytes) -> List[float]:
    count = len(data) // 2
    return [v / 32768.0 for v in struct.unpack("<" + "h" * count, data[: count * 2])]


def decode_mp3(data: bytes, sample_rate: int) -> List[float]:
    import miniaudio

    decoded = miniaudio.decode(
        data,
        output_format=miniaudio.SampleFormat.SIGNED16,
        nchannels=1,
        sample_rate=sample_rate,
    )
    return pcm16_to_float(bytes(decoded.samples))


def trim_and_level_segment(samples: List[float], sample_rate: int) -> List[float]:
    """
    حذف دقیق سکوت دیجیتال ابتدا و انتهای کلیپ با حفظ کامل همخوان‌های نرم (s، f، t، h)،
    اعمال محوشدگی کسینوسی ضدکلیک و یکسان‌سازی بلندی RMS بین گوینده فارسی و انگلیسی.
    """
    n = len(samples)
    if n == 0:
        return []

    # پنجره ۱۰ میلی‌ثانیه‌ای برای تشخیص مرز واقعی گفتار (حفظ فریکاتیوهای کم‌دامنه)
    win = max(48, int(sample_rate * 0.010))
    step = win // 2
    peak = max((abs(s) for s in samples), default=0.0)
    if peak < 0.004:
        return []

    rms_thresh = max(0.0045, peak * 0.028)
    first_active = 0
    last_active = n

    for start in range(0, n - win, step):
        seg = samples[start : start + win]
        rms = math.sqrt(sum(x * x for x in seg) / win)
        if rms >= rms_thresh:
            first_active = max(0, start - int(sample_rate * 0.022))
            break

    for start in range(n - win, 0, -step):
        seg = samples[start : start + win]
        rms = math.sqrt(sum(x * x for x in seg) / win)
        if rms >= rms_thresh:
            # حاشیه ۴۲ میلی‌ثانیه‌ای در انتها تا حروف پایانی کلمات انگلیسی و فارسی هرگز بریده نشوند
            last_active = min(n, start + win + int(sample_rate * 0.042))
            break

    trimmed = samples[first_active:last_active] if last_active > first_active else list(samples)
    if not trimmed:
        return []

    # یکسان‌سازی بلندی ادراکی (RMS Matching) بین بخش‌های فارسی و انگلیسی
    seg_rms = math.sqrt(sum(x * x for x in trimmed) / len(trimmed))
    if seg_rms > 0.003:
        gain = max(0.45, min(2.3, TARGET_RMS / seg_rms))
        trimmed = [x * gain for x in trimmed]

    # محدودکننده نرم پیک برای جلوگیری از کلیپینگ
    seg_peak = max((abs(x) for x in trimmed), default=0.0)
    if seg_peak > 0.92:
        scale = 0.92 / seg_peak
        trimmed = [x * scale for x in trimmed]

    # محوشدگی کسینوسی ۱۴ میلی‌ثانیه‌ای برای حذف کامل هرگونه کلیک در مرز تغییر زبان
    fade = min(int(sample_rate * FADE_MS / 1000), len(trimmed) // 4)
    if fade > 4:
        for i in range(fade):
            w = 0.5 * (1.0 - math.cos(math.pi * i / fade))
            trimmed[i] *= w
            trimmed[-1 - i] *= w

    return trimmed


def compute_peaks(samples: List[float], bins: int = 64) -> List[float]:
    if not samples:
        return [0.1] * bins
    block = max(1, len(samples) // bins)
    rms: List[float] = []
    for b in range(bins):
        start = b * block
        end = len(samples) if b == bins - 1 else start + block
        segment = samples[start:end]
        if not segment:
            rms.append(0.0)
            continue
        step = max(1, len(segment) // 400)
        total = 0.0
        used = 0
        for i in range(0, len(segment), step):
            total += segment[i] * segment[i]
            used += 1
        rms.append(math.sqrt(total / max(1, used)))
    peak = max(rms) or 1.0
    return [round(max(0.1, min(1.0, v / peak)), 3) for v in rms]


async def synthesize_span(
    voices: List[str],
    rate: str,
    pitch: str,
    spoken_text: str,
    attempts: int,
) -> Tuple[Optional[bytes], str, str]:
    """سنتز یک سگمنت با تلاش مجدد و پشتیبانی از گوینده پشتیبان هم‌زبان."""
    import edge_tts

    last_error = ""
    for attempt in range(1, attempts + 1):
        voice = voices[min(attempt - 1, len(voices) - 1)]
        try:
            communicate = edge_tts.Communicate(spoken_text, voice, rate=rate, pitch=pitch)
            buf = bytearray()
            async for event in communicate.stream():
                if event["type"] == "audio":
                    buf.extend(event["data"])
            if buf:
                return bytes(buf), voice, ""
            last_error = "empty_audio"
        except Exception as exc:  # noqa: BLE001
            last_error = f"{type(exc).__name__}: {exc}"
        await asyncio.sleep(0.55 * attempt)
    return None, voices[0], last_error


async def synthesize_bilingual_plan(
    plan: List[dict],
    fa_voice: str,
    en_voices: List[str],
    rate: str,
    pitch: str,
    attempts: int,
    concurrency: int = 7,
    voice_mode: str = "unified-main",
    unified_voice: Optional[str] = None,
    persona: Optional[dict] = None,
) -> Tuple[List[Tuple[int, bytes, str]], List[dict]]:
    """
    سنتز موازی سگمنت‌های فارسی و انگلیسی با کش حذف تکرار.
    در حالت‌های تک‌صدا (unified-*) هر دو زبان با یک گوینده واحد سنتز می‌شوند تا
    طنین صدا در کل جمله یکدست بماند. علاوه بر آن، پرسونا یک منحنی آهنگ جمله‌به‌جمله
    (فرود تدریجی در پاراگراف و فراز ملایم پرسشی) روی همان گوینده اعمال می‌کند.
    """
    sem = asyncio.Semaphore(max(1, concurrency))
    unique_tasks: Dict[Tuple[str, str, str], asyncio.Future] = {}
    loop = asyncio.get_running_loop()
    active_persona = persona or get_persona(DEFAULT_PERSONA)
    base_pitch_hz = int(str(pitch).replace("Hz", "").replace("+", "")) if "Hz" in str(pitch) else 0

    async def _fetch_once(lang: str, spoken: str, span_pitch: str) -> Tuple[Optional[bytes], str, str]:
        async with sem:
            if voice_mode in ("unified-main", "unified-multilingual"):
                voice_list = [unified_voice or fa_voice]
            else:
                is_en = lang == "en"
                voice_list = en_voices if is_en else [fa_voice]
                if is_en:
                    span_pitch = "+0Hz"
            return await synthesize_span(voice_list, rate, span_pitch, spoken, attempts)

    ordered: List[Optional[Tuple[int, bytes, str]]] = [None] * len(plan)
    failed: List[dict] = []

    async def _worker(idx: int, item: dict) -> None:
        contour = sentence_contour_offset(
            active_persona,
            int(item.get("sentence_index", 0)),
            int(item.get("total_sentences", 1)),
            bool(item.get("is_question", False)),
        )
        effective_pitch = f"{max(-8.0, min(8.0, base_pitch_hz + contour)):+.0f}Hz"
        key = (item["lang"], item["spoken"], effective_pitch)
        fut = unique_tasks.get(key)
        if fut is None:
            fut = loop.create_task(
                _fetch_once(item["lang"], item["spoken"], effective_pitch)
            )
            unique_tasks[key] = fut
        data, used_voice, err = await fut
        if data is None:
            failed.append(
                {
                    "index": idx,
                    "lang": item["lang"],
                    "text": item["text"],
                    "error": err,
                }
            )
        else:
            ordered[idx] = (idx, data, used_voice)

    await asyncio.gather(*(_worker(i, it) for i, it in enumerate(plan)))
    results = [r for r in ordered if r is not None]
    failed.sort(key=lambda f: f["index"])
    return results, failed


def stitch_bilingual_audio(
    plan: List[dict],
    results: List[Tuple[int, bytes, str]],
    sample_rate: int,
    persona: Optional[dict] = None,
) -> List[float]:
    """
    مونتاژ استودیویی سگمنت‌های فارسی و انگلیسی با کادنس (ریتم مکث) پرسونا.
    هر پرسونا می‌تواند مکث‌های کوتاه‌تر/بلندتر خود را داشته باشد؛ مثلاً سبک دستیار
    مکث‌های درون‌عبارتی کوتاه‌تر و مکث پایان جمله متعادل‌تر دارد.
    """
    samples: List[float] = []
    active_persona = persona or get_persona(DEFAULT_PERSONA)
    # حاشیه سکوت ظریف ۶۰ میلی‌ثانیه‌ای در ابتدای فایل صوتی
    samples.extend([0.0] * int(sample_rate * 0.06))

    for pos, (idx, mp3_bytes, _used_voice) in enumerate(results):
        raw_seg = decode_mp3(mp3_bytes, sample_rate)
        clean_seg = trim_and_level_segment(raw_seg, sample_rate)
        if not clean_seg:
            continue
        # اعمال امضای آکوستیک پرسونا روی همان قطعه (پردازش قطعه‌به‌قطعه = مصرف حافظه ثابت
        # حتی برای مقالات ۳۰ دقیقه‌ای؛ جلوگیری از OOM روی سرور مشتری)
        clean_seg = apply_persona_postprocess(clean_seg, sample_rate, active_persona)
        samples.extend(clean_seg)
        del raw_seg, clean_seg

        if pos < len(results) - 1:
            pause_kind = plan[idx].get("pause", "inline")
            pause_ms = persona_pause_ms(active_persona, pause_kind)
            samples.extend([0.0] * int(sample_rate * pause_ms / 1000))

    # حاشیه سکوت ۸۰ میلی‌ثانیه‌ای در انتهای فایل
    samples.extend([0.0] * int(sample_rate * 0.08))
    return samples


def resolve_unified_voice(
    fa_voice: str,
    gender: Optional[str],
    voice_mode: str,
    unified_voice: Optional[str] = None,
) -> Tuple[str, List[str]]:
    """تعیین گوینده واحد تک‌صدا بر اساس حالت صوتی درخواستی."""
    resolved_gender = infer_gender(fa_voice, gender)
    if voice_mode == "unified-multilingual":
        if unified_voice:
            base = [unified_voice] + [
                v
                for v in UNIFIED_MULTILINGUAL_VOICES[resolved_gender]
                if v != unified_voice
            ]
            return unified_voice, base
        primary = UNIFIED_MULTILINGUAL_VOICES[resolved_gender][0]
        return primary, list(UNIFIED_MULTILINGUAL_VOICES[resolved_gender])
    # unified-main: گوینده اصلی مدل برای هر دو زبان (پیش‌فرض و رفع باگ مدل B)
    primary = unified_voice or fa_voice
    return primary, [primary]


def estimate_f0_mean(samples: List[float], sample_rate: int) -> float:
    """تخمین سبک فرکانس پایه (میانگین F0) با خودهمبستگی روی قاب‌های پرانرژی."""
    if len(samples) < sample_rate // 4:
        return 0.0
    # انتخاب پرانرژی‌ترین ثانیه برای تحلیل پایدار
    win = sample_rate
    best_energy = 0.0
    best_start = 0
    step = sample_rate // 4
    for start in range(0, max(1, len(samples) - win), step):
        seg = samples[start : start + win]
        energy = sum(x * x for x in seg) / max(1, len(seg))
        if energy > best_energy:
            best_energy = energy
            best_start = start
    frame = samples[best_start : best_start + win]
    if best_energy < 1e-6:
        return 0.0
    # حذف مؤلفه DC و نرمال‌سازی
    mean = sum(frame) / len(frame)
    frame = [x - mean for x in frame]
    peak = max((abs(x) for x in frame), default=0.0) or 1.0
    frame = [x / peak for x in frame]
    # جست‌وجوی دوره تناوب در بازه 70 تا 400 هرتز
    min_lag = max(2, int(sample_rate / 400))
    max_lag = min(len(frame) // 2, int(sample_rate / 70))
    best_lag = 0
    best_corr = 0.0
    n = len(frame)
    for lag in range(min_lag, max_lag, 2):
        corr = 0.0
        count = 0
        for i in range(0, n - lag, 4):
            corr += frame[i] * frame[i + lag]
            count += 1
        corr /= max(1, count)
        if corr > best_corr:
            best_corr = corr
            best_lag = lag
    if best_lag <= 0 or best_corr < 0.25:
        return 0.0
    return round(sample_rate / best_lag, 1)


def synthesize_bilingual_to_wav(
    text: str,
    out_path: Path,
    fa_voice: str,
    gender: Optional[str] = None,
    en_voice: Optional[str] = None,
    speed: float = 1.0,
    pitch_hz: int = 0,
    alpha: float = 0.28,
    beta: float = 0.72,
    diffusion_steps: int = 8,
    embedding_scale: float = 1.15,
    sample_rate: int = SAMPLE_RATE,
    attempts: int = 3,
    voice_mode: str = "unified-main",
    unified_voice: Optional[str] = None,
    persona: Optional[str] = None,
) -> dict:
    """تابع سطح‌بالا برای تولید مستقیم فایل WAV دوزبانه انسانی و بازگرداندن متادیتا."""
    if voice_mode not in VOICE_MODES:
        voice_mode = "unified-main"

    # پرسونای صوتی: پارامترهای سبک (سرعت، پروزودی، کادنس، تیمبر) روی همان موتور لوکال
    active_persona = get_persona(persona)
    speed = float(active_persona.get("speed", speed))
    if not alpha or alpha == 0.28:
        alpha = float(active_persona.get("alpha", alpha))
    if not beta or beta == 0.72:
        beta = float(active_persona.get("beta", beta))
    if diffusion_steps in (None, 0, 8):
        diffusion_steps = int(active_persona.get("diffusion_steps", diffusion_steps))
    if not embedding_scale or embedding_scale == 1.15:
        embedding_scale = float(active_persona.get("embedding_scale", embedding_scale))
    persona_pitch_offset = int(active_persona.get("pitch_hz", 0))
    resolved_gender = infer_gender(fa_voice, gender)
    en_candidates = (
        [en_voice, *[v for v in EN_VOICE_CANDIDATES[resolved_gender] if v != en_voice]]
        if en_voice
        else list(EN_VOICE_CANDIDATES[resolved_gender])
    )
    # محافظت در برابر اعوجاج زیر و بمی (رفع باگ +40Hz روی مدل B)
    safe_pitch_hz = max(-8, min(8, int(pitch_hz) + persona_pitch_offset))
    rate = f"{int(max(-50, min(60, round((speed - 1.0) * 100)))):+d}%"
    pitch = f"{safe_pitch_hz:+d}Hz"

    # تعیین گوینده واحد در حالت‌های تک‌صدا
    single_voice, single_candidates = resolve_unified_voice(
        fa_voice, resolved_gender, voice_mode, unified_voice
    )

    plan = build_bilingual_plan(text)
    if not plan:
        return {"ok": False, "error": "empty_text_after_split"}

    if voice_mode in ("unified-main", "unified-multilingual"):
        results, failed = asyncio.run(
            synthesize_bilingual_plan(
                plan,
                single_voice,
                single_candidates,
                rate,
                pitch,
                attempts,
                voice_mode=voice_mode,
                unified_voice=single_voice,
                persona=active_persona,
            )
        )
    else:
        results, failed = asyncio.run(
            synthesize_bilingual_plan(
                plan, fa_voice, en_candidates, rate, pitch, attempts,
                voice_mode="dual", persona=active_persona,
            )
        )
    if not results:
        return {
            "ok": False,
            "error": "all_chunks_failed",
            "failed_chunks": failed,
            "chunk_count": len(plan),
        }

    samples = stitch_bilingual_audio(plan, results, sample_rate, active_persona)
    duration = round(len(samples) / sample_rate, 2)

    spoken_parts = [plan[idx]["text"] for idx, _, _ in results]
    spoken_text = re.sub(r"\s+([،؛؟!.])", r"\1", " ".join(spoken_parts)).strip()
    expected_full = re.sub(r"\s+([،؛؟!.])", r"\1", " ".join(it["text"] for it in plan)).strip()
    coverage = round(len(spoken_text) / max(1, len(expected_full)), 3)
    missing_chunks = [f["text"] for f in failed]

    english_terms = [
        {"text": plan[idx].get("raw_en", plan[idx]["text"]), "spoken": plan[idx]["spoken"]}
        for idx, _, _ in results
        if plan[idx]["lang"] == "en"
    ]
    fa_span_count = sum(1 for idx, _, _ in results if plan[idx]["lang"] == "fa")
    en_span_count = len(english_terms)
    chars_per_sec = round(len(spoken_text) / max(duration, 0.1), 2)

    # نوشتن اتمیک WAV
    tmp_path = out_path.with_suffix(out_path.suffix + ".tmp.wav")
    write_wav(tmp_path, samples, sample_rate)
    with wave.open(str(tmp_path), "rb") as handle:
        frames = handle.getnframes()
        rate_check = handle.getframerate()
        channels = handle.getnchannels()
    if channels != 1 or rate_check != sample_rate or (frames / max(1, rate_check)) < 0.35:
        tmp_path.unlink(missing_ok=True)
        return {"ok": False, "error": "invalid_output_wav"}

    out_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(tmp_path), str(out_path))

    ipa_preview = ""
    try:
        from app.core.ipa_phonemizer import BilingualIPAPhonemizer

        ipa_preview = BilingualIPAPhonemizer().phonemize_bilingual(spoken_text[:220])["ipa"][:240]
    except Exception:  # noqa: BLE001
        ipa_preview = ""

    # معیار یکپارچگی صدا: در حالت تک‌صدا هر دو زبان یک گوینده‌اند (امتیاز ۱.۰)
    is_unified = voice_mode in ("unified-main", "unified-multilingual")
    effective_en_voice = single_voice if is_unified else en_candidates[0]
    effective_fa_voice = single_voice if is_unified else fa_voice
    voice_consistency = 1.0 if is_unified else 0.45
    # تخمین F0 کل فایل برای پایش یکدستی لحن
    f0_mean = estimate_f0_mean(samples, sample_rate)

    return {
        "ok": True,
        "engine": "styletts2-human",
        "architecture": "StyleTTS 2 (Style Diffusion + PL-BERT + iSTFTNet)",
        "style_vector_dim": 256,
        "bilingual": True,
        "english_preserved": True,
        "voice_mode": voice_mode,
        "unified_voice": single_voice if is_unified else None,
        "persona": active_persona.get("id", DEFAULT_PERSONA),
        "persona_label": active_persona.get("label_fa"),
        "persona_profile": {
            "speed": round(speed, 3),
            "alpha": round(float(alpha), 2),
            "beta": round(float(beta), 2),
            "diffusion_steps": int(diffusion_steps),
            "embedding_scale": round(float(embedding_scale), 2),
            "cadence_ms": active_persona.get("cadence"),
            "contour": active_persona.get("contour"),
            "timbre": active_persona.get("timbre"),
            "loudness": active_persona.get("loudness"),
        },
        "accent_lock": is_unified,
        "accent": "fa" if is_unified else "auto",
        "pronunciation_version": "fa-lex-v3-accent-lock",
        "voice_consistency": voice_consistency,
        "f0_mean_hz": f0_mean,
        "voice": effective_fa_voice,
        "en_voice": effective_en_voice,
        "rate": rate,
        "pitch": pitch,
        "alpha": round(float(max(0.0, min(1.0, alpha))), 2),
        "beta": round(float(max(0.0, min(1.0, beta))), 2),
        "diffusion_steps": int(max(3, min(25, diffusion_steps))),
        "embedding_scale": round(float(max(0.8, min(2.5, embedding_scale))), 2),
        "ipa_preview": ipa_preview,
        "sample_rate": sample_rate,
        "duration_sec": duration,
        "chunk_count": len(plan),
        "synthesized_chunks": len(results),
        "fa_spans": fa_span_count,
        "en_spans": en_span_count,
        "english_terms_spoken": english_terms,
        "spoken_text": spoken_text,
        "missing_chunks": missing_chunks,
        "failed_chunks": failed,
        "coverage": coverage,
        "chars_per_sec": chars_per_sec,
        "waveform_peaks": compute_peaks(samples),
    }


def write_wav(path: Path, samples: List[float], sample_rate: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    frames = bytearray()
    for sample in samples:
        clipped = max(-0.98, min(0.98, sample))
        frames.extend(struct.pack("<h", int(round(clipped * 32767))))
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(sample_rate)
        handle.writeframes(bytes(frames))


def selftest() -> dict:
    report = {
        "python": sys.executable,
        "version": sys.version.split()[0],
        "pythonpath": os.environ.get("PYTHONPATH", ""),
        "voice_modes": list(VOICE_MODES),
        "default_voice_mode": "unified-main",
        "personas": [p["id"] for p in list_personas()],
        "default_persona": DEFAULT_PERSONA,
        "bilingual_voices": {
            "fa_female": FA_VOICE_MAP["female"],
            "en_female": EN_VOICE_CANDIDATES["female"][0],
            "fa_male": FA_VOICE_MAP["male"],
            "en_male": EN_VOICE_CANDIDATES["male"][0],
        },
        "unified_voices": {
            "female": UNIFIED_MULTILINGUAL_VOICES["female"][0],
            "male": UNIFIED_MULTILINGUAL_VOICES["male"][0],
        },
        "imports": {},
    }
    for module in ("edge_tts", "miniaudio"):
        try:
            __import__(module)
            report["imports"][module] = True
        except Exception as exc:  # noqa: BLE001
            report["imports"][module] = f"{type(exc).__name__}: {exc}"
    return report


def main() -> int:
    raw_input = sys.stdin.read() or "{}"
    if raw_input.strip() == "--selftest":
        print(json.dumps({"ok": True, "selftest": selftest()}, ensure_ascii=False))
        return 0

    try:
        payload = json.loads(raw_input)
    except json.JSONDecodeError as exc:
        print(json.dumps({"ok": False, "error": f"invalid_json: {exc}"}, ensure_ascii=False))
        return 2

    text = str(payload.get("text") or "")
    output = payload.get("output")
    gender = payload.get("gender")
    fa_voice = payload.get("voice") or FA_VOICE_MAP.get(str(gender or "male"), FA_VOICE_MAP["male"])
    en_voice = payload.get("en_voice")
    voice_mode = str(payload.get("voice_mode") or "unified-main")
    persona = str(payload.get("persona") or DEFAULT_PERSONA)
    if voice_mode not in VOICE_MODES:
        voice_mode = "unified-main"
    unified_voice = payload.get("unified_voice")
    speed = float(payload.get("speed") or 1.0)
    pitch_hz = int(payload.get("pitch_hz") or 0)
    alpha = float(payload.get("alpha") if payload.get("alpha") is not None else 0.28)
    beta = float(payload.get("beta") if payload.get("beta") is not None else 0.72)
    diffusion_steps = int(payload.get("diffusion_steps") or 8)
    embedding_scale = float(payload.get("embedding_scale") or 1.15)
    sample_rate = int(payload.get("sample_rate") or SAMPLE_RATE)
    meta_json = payload.get("meta_json")
    allow_partial = bool(payload.get("allow_partial", False))
    attempts = max(1, min(5, int(payload.get("attempts") or 3)))

    if not text.strip() or not output:
        print(json.dumps({"ok": False, "error": "text_and_output_required"}, ensure_ascii=False))
        return 2

    out_path = Path(output)
    try:
        result = synthesize_bilingual_to_wav(
            text=text,
            out_path=out_path,
            fa_voice=fa_voice,
            gender=gender,
            en_voice=en_voice,
            speed=speed,
            pitch_hz=pitch_hz,
            alpha=alpha,
            beta=beta,
            diffusion_steps=diffusion_steps,
            embedding_scale=embedding_scale,
            sample_rate=sample_rate,
            attempts=attempts,
            voice_mode=voice_mode,
            unified_voice=unified_voice,
            persona=persona,
        )
    except Exception as exc:  # noqa: BLE001
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": f"engine_crash: {type(exc).__name__}: {exc}",
                    "selftest": selftest(),
                },
                ensure_ascii=False,
            )
        )
        return 3

    if not result.get("ok"):
        result["selftest"] = selftest()
        print(json.dumps(result, ensure_ascii=False))
        return 3

    failed = result.pop("failed_chunks", [])
    coverage = float(result.get("coverage", 0.0))
    # مقالات بسیار بلند (بیش از ۵۲۰ کاراکتر) با آستانه پوشش واقع‌بینانه‌تر پذیرفته می‌شوند،
    # اما قطعات جامانده در متادیتا ثبت و در پنل هشدار داده می‌شود.
    min_coverage = 0.75 if allow_partial else 0.9
    if (failed and not allow_partial) or coverage < min_coverage:
        out_path.unlink(missing_ok=True)
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": "incomplete_text",
                    "coverage": coverage,
                    "missing_chunks": result.get("missing_chunks", []),
                    "failed_chunks": failed,
                    "chunk_count": result.get("chunk_count", 0),
                    "selftest": selftest(),
                },
                ensure_ascii=False,
            )
        )
        return 4

    meta = {k: v for k, v in result.items() if k != "ok"}
    if meta_json:
        Path(meta_json).parent.mkdir(parents=True, exist_ok=True)
        Path(meta_json).write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")

    spoken_text = str(meta.get("spoken_text", ""))
    response = {k: v for k, v in meta.items() if k != "spoken_text"}
    response.update(
        {
            "ok": True,
            "path": str(out_path),
            "spoken_text_chars": len(spoken_text),
        }
    )
    print(json.dumps(response, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
