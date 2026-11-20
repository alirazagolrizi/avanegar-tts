"""
موتور دوزبانه حفظ و خوانش بومی انگلیسی (FA + EN Code-Switching) و مبدل دقیق اعداد فارسی
برای موتور مرکزی آفلاین StyleTTS 2 (هم‌تراز ۱۰۰٪ با نسخه TypeScript پنل).

اصول مهندسی (پیاده‌سازی‌شده روی StyleTTS 2):
  ۱. حروف، واژه‌ها، سرواژه‌ها، برندها و مدل‌های انگلیسی (مانند A، B، C، StyleTTS 2، PL-BERT،
     WavLM، iSTFTNet، RTX 5090، GPT-4o، iPhone 17 Pro، Galaxy A57، S25 FE، NVMe، LTPO، USB-C،
     Wi-Fi 7، IPv6، FP8، 5G، 120Hz، 6000mAh، 32GB، -16 LUFS، Next.js، PCIe 5.0، PyTorch)
     هرگز به فارسی تبدیل نمی‌شوند؛ دقیقاً انگلیسی حفظ و با IPA بومی en-us خوانده می‌شوند.
  ۲. اعداد در بافت فارسی (اعشار با صفر ابتدایی 3.05 → «سه ممیز پنج صدم»، ممیز فارسی ۷٫۸،
     منفی -16، درصد پیشوندی/پسوندی ٪۴۰ و 32.5%، ارز $1,299، هزارگان ۳ رقمی بدون ادغام ۱،۲،۳،
     ساعت 14:30، نسخه 16.4.2، بازه 10-30، ضرب 4×64، ترتیبی ۳۰ام و اعداد تا کوادریلیون)
     با دقت کامل به حروف استاندارد فارسی تبدیل می‌شوند.
"""
from __future__ import annotations

import re
from typing import Dict, List, Optional, Tuple

_ONES = ["", "یک", "دو", "سه", "چهار", "پنج", "شش", "هفت", "هشت", "نه"]
_SINGLE_DIGITS = ["صفر", "یک", "دو", "سه", "چهار", "پنج", "شش", "هفت", "هشت", "نه"]
_TEENS = [
    "ده", "یازده", "دوازده", "سیزده", "چهارده",
    "پانزده", "شانزده", "هفده", "هجده", "نوزده",
]
_TENS = ["", "", "بیست", "سی", "چهل", "پنجاه", "شصت", "هفتاد", "هشتاد", "نود"]
_HUNDREDS = [
    "", "صد", "دویست", "سیصد", "چهارصد",
    "پانصد", "ششصد", "هفتصد", "هشتصد", "نهصد",
]
_SCALES = ["", "هزار", "میلیون", "میلیارد", "تریلیون", "کوادریلیون"]

_CURRENCY_WORDS = {"$": "دلار", "€": "یورو", "£": "پوند"}
_COMMON_FRACTIONS = {
    "1/2": "یک دوم",
    "1/3": "یک سوم",
    "2/3": "دو سوم",
    "1/4": "یک چهارم",
    "3/4": "سه چهارم",
    "1/5": "یک پنجم",
    "1/8": "یک هشتم",
    "1/10": "یک دهم",
}

_DIGITS_TRANS = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")

ENGLISH_SPEECH_HINTS: Dict[str, str] = {
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
    "bpe": "B P E",
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

_NUM_CORE = r"(?:\d{1,3}(?:[,٬]\d{3})+|\d+)(?:[.٫]\d+)?"
_SIGNED_NUM = rf"[-−+]?{_NUM_CORE}"


def normalize_digits_to_ascii(text: str) -> str:
    return (text or "").translate(_DIGITS_TRANS)


def _three_digits(n: int) -> str:
    parts: List[str] = []
    h, rem = divmod(n, 100)
    if h:
        parts.append(_HUNDREDS[h])
    if 10 <= rem < 20:
        parts.append(_TEENS[rem - 10])
    else:
        t, o = divmod(rem, 10)
        if t:
            parts.append(_TENS[t])
        if o:
            parts.append(_ONES[o])
    return " و ".join(parts)


def digits_to_persian_words(raw_digits: str) -> str:
    trimmed = normalize_digits_to_ascii(raw_digits).strip()
    if not trimmed:
        return ""
    is_neg = bool(re.match(r"^[-−]", trimmed))
    unsigned = re.sub(r"[,٬]", "", re.sub(r"^[-−+]", "", trimmed))
    if not unsigned.isdigit():
        return raw_digits
    stripped = unsigned.lstrip("0")
    if not stripped:
        return "صفر"
    if len(stripped) > len(_SCALES) * 3:
        spelled = " ".join(_SINGLE_DIGITS[int(c)] for c in stripped)
        return f"منفی {spelled}" if is_neg else spelled

    groups: List[str] = []
    cursor = len(stripped)
    scale_idx = 0
    while cursor > 0 and scale_idx < len(_SCALES):
        start = max(0, cursor - 3)
        chunk = int(stripped[start:cursor])
        if chunk > 0:
            words = _three_digits(chunk)
            scale = _SCALES[scale_idx]
            if chunk == 1 and scale_idx == 1:
                groups.insert(0, "هزار")
            else:
                groups.insert(0, f"{words} {scale}".strip())
        cursor = start
        scale_idx += 1

    joined = " و ".join(groups) if groups else "صفر"
    return f"منفی {joined}" if is_neg else joined


def number_to_persian_words(value: int) -> str:
    if value == 0:
        return "صفر"
    if value < 0:
        return f"منفی {digits_to_persian_words(str(abs(value)))}"
    return digits_to_persian_words(str(value))


def decimal_to_persian_words(whole_raw: str, frac_raw: str, negative: bool = False) -> str:
    clean_whole = re.sub(r"[,٬]", "", re.sub(r"^[-−+]", "", whole_raw)) or "0"
    is_neg = negative or bool(re.match(r"^[-−]", whole_raw.strip()))
    whole_words = digits_to_persian_words(clean_whole)

    ascii_frac = re.sub(r"\D", "", normalize_digits_to_ascii(frac_raw))
    if not ascii_frac:
        return f"منفی {whole_words}" if is_neg else whole_words

    trimmed_frac = ascii_frac.rstrip("0")
    if not trimmed_frac:
        base = f"{whole_words} ممیز صفر"
        return f"منفی {base}" if is_neg else base

    if len(trimmed_frac) == 1:
        frac_words = f"{digits_to_persian_words(trimmed_frac)} دهم"
    elif len(trimmed_frac) == 2:
        frac_words = f"{digits_to_persian_words(trimmed_frac)} صدم"
    elif len(trimmed_frac) == 3:
        frac_words = f"{digits_to_persian_words(trimmed_frac)} هزارم"
    else:
        frac_words = " ".join(_SINGLE_DIGITS[int(d)] for d in trimmed_frac)

    base = f"{whole_words} ممیز {frac_words}"
    return f"منفی {base}" if is_neg else base


def numeric_token_to_persian(raw_token: str) -> str:
    token = normalize_digits_to_ascii(raw_token).strip()
    if not token:
        return ""
    is_neg = bool(re.match(r"^[-−]", token))
    is_pos = token.startswith("+")
    unsigned = re.sub(r"[,٬]", "", re.sub(r"^[-−+]", "", token))
    if re.search(r"[.٫]", unsigned):
        parts = re.split(r"[.٫]", unsigned, maxsplit=1)
        words = decimal_to_persian_words(parts[0], parts[1] if len(parts) > 1 else "", False)
    else:
        words = digits_to_persian_words(unsigned)
    if is_neg and words != "صفر":
        return f"منفی {words}"
    if is_pos:
        return f"مثبت {words}"
    return words


def ordinal_to_persian_words(num_str: str) -> str:
    clean = re.sub(r"\D", "", normalize_digits_to_ascii(num_str))
    if not clean:
        return num_str
    if int(clean) == 1:
        return "اول"
    base = digits_to_persian_words(clean)
    if base.endswith("سه"):
        return f"{base[:-2]}سوم"
    if base.endswith("سی"):
        return f"{base}\u200cام"
    return f"{base}م"


def version_to_persian_words(ver: str) -> str:
    parts = [p for p in normalize_digits_to_ascii(ver).split(".") if p]
    return " نقطه ".join(digits_to_persian_words(p) for p in parts)


def time_to_persian_words(hh: str, mm: str, ss: Optional[str] = None) -> str:
    h, m = int(hh), int(mm)
    s = int(ss) if ss else 0
    h_w = digits_to_persian_words(str(h))
    if m == 0 and s == 0:
        return h_w
    m_w = digits_to_persian_words(str(m))
    if s == 0:
        return f"{h_w} و {m_w} دقیقه"
    return f"{h_w} و {m_w} دقیقه و {digits_to_persian_words(str(s))} ثانیه"


def expand_persian_numbers(persian_text: str) -> str:
    """بازنویسی دقیق تمام اعداد در بافت فارسی بدون دست زدن به عبارات انگلیسی."""
    if not persian_text:
        return ""
    text = normalize_digits_to_ascii(persian_text)

    # ارز پیشوندی و پسوندی
    text = re.sub(
        rf"([$€£])\s*({_SIGNED_NUM})(?![\d.,٫])",
        lambda m: f" {numeric_token_to_persian(m.group(2))} {_CURRENCY_WORDS.get(m.group(1), '')} ",
        text,
    )
    text = re.sub(
        rf"(?<![\dA-Za-z])({_SIGNED_NUM})\s*([$€£])",
        lambda m: f" {numeric_token_to_persian(m.group(1))} {_CURRENCY_WORDS.get(m.group(2), '')} ",
        text,
    )
    # درصد پیشوندی و پسوندی (٪۴۰، %32.5، 40%، -5%)
    text = re.sub(
        rf"[%٪]\s*({_SIGNED_NUM})(?![\d.,٫])",
        lambda m: f" {numeric_token_to_persian(m.group(1))} درصد ",
        text,
    )
    text = re.sub(
        rf"(?<![\dA-Za-z])({_SIGNED_NUM})\s*[%٪]",
        lambda m: f" {numeric_token_to_persian(m.group(1))} درصد ",
        text,
    )
    # زمان
    text = re.sub(
        r"(?<!\d)([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?(?!\d)",
        lambda m: f" {time_to_persian_words(m.group(1), m.group(2), m.group(3))} ",
        text,
    )
    # نسخه چندنقطه‌ای
    text = re.sub(
        r"(?<!\d)\d+(?:\.\d+){2,}(?!\d)",
        lambda m: f" {version_to_persian_words(m.group(0))} ",
        text,
    )
    # تاریخ اسلش‌دار
    text = re.sub(
        r"(?<!\d)(\d{4})/(0?[1-9]|1[0-2])/(0?[1-9]|[12]\d|3[01])(?!\d)",
        lambda m: (
            f" {digits_to_persian_words(m.group(1))}، "
            f"{digits_to_persian_words(str(int(m.group(2))))}، "
            f"{digits_to_persian_words(str(int(m.group(3))))} "
        ),
        text,
    )
    # کسرها
    text = re.sub(
        r"(?<!\d)([1-9]/(?:[2-9]|10))(?!\d)",
        lambda m: f" {_COMMON_FRACTIONS[m.group(1)]} " if m.group(1) in _COMMON_FRACTIONS else m.group(0),
        text,
    )
    # ضرب و برابری
    text = re.sub(
        rf"({_NUM_CORE})\s*×\s*({_NUM_CORE})",
        lambda m: f" {numeric_token_to_persian(m.group(1))} در {numeric_token_to_persian(m.group(2))} ",
        text,
    )
    text = re.sub(
        rf"({_NUM_CORE})\s*×",
        lambda m: f" {numeric_token_to_persian(m.group(1))} برابر ",
        text,
    )
    # ترتیبی
    text = re.sub(
        r"(?<!\d)(\d+)\u200c?(?:ام|وم|م)(?=\s|[،؛.؟!)\]]|$)",
        lambda m: f" {ordinal_to_persian_words(m.group(1))} ",
        text,
    )
    # بازه عددی
    text = re.sub(
        rf"(?<![\dA-Za-z\-−])({_NUM_CORE})\s*[–—-]\s*({_NUM_CORE})(?![\dA-Za-z])",
        lambda m: f" {numeric_token_to_persian(m.group(1))} تا {numeric_token_to_persian(m.group(2))} ",
        text,
    )
    # اعشاری و صحیح (با یا بدون علامت منفی/مثبت)
    text = re.sub(
        r"(?:(?<=^)|(?<=[\s(«\[،؛:=]))([-−+])?(\d{1,3}(?:[,٬]\d{3})+|\d+)[.٫](\d+)(?![\d.٫])",
        lambda m: f" {numeric_token_to_persian((m.group(1) or '') + m.group(2) + '.' + m.group(3))} ",
        text,
    )
    text = re.sub(
        r"(\d{1,3}(?:[,٬]\d{3})+|\d+)[.٫](\d+)(?![\d.٫])",
        lambda m: f" {numeric_token_to_persian(m.group(1) + '.' + m.group(2))} ",
        text,
    )
    text = re.sub(
        r"(?:(?<=^)|(?<=[\s(«\[،؛:=]))([-−+])?(\d{1,3}(?:[,٬]\d{3})+|\d+)(?!\d)",
        lambda m: f" {numeric_token_to_persian((m.group(1) or '') + m.group(2))} ",
        text,
    )
    text = re.sub(
        r"(\d{1,3}(?:[,٬]\d{3})+|\d+)",
        lambda m: f" {numeric_token_to_persian(m.group(1))} ",
        text,
    )
    text = (
        text.replace("%", " درصد ")
        .replace("٪", " درصد ")
        .replace("$", " دلار ")
        .replace("€", " یورو ")
        .replace("£", " پوند ")
    )
    return re.sub(r"[ \t]{2,}", " ", text).strip()


def normalize_inline_english_digits(text: str) -> str:
    if not text:
        return ""
    out = re.sub(
        r"([A-Za-z][-+]?\s*)([۰-۹٠-٩]+(?:[.,٫][۰-۹٠-٩]+)*)",
        lambda m: m.group(1) + normalize_digits_to_ascii(m.group(2)).replace("٫", "."),
        text,
    )
    out = re.sub(
        r"([-−+]?[۰-۹٠-٩]+(?:[.,٫][۰-۹٠-٩]+)*)(\s*[A-Za-z])",
        lambda m: normalize_digits_to_ascii(m.group(1)).replace("٫", ".") + m.group(2),
        out,
    )
    return out


def format_english_for_speech(raw_en: str) -> str:
    """تولید فرم خوانش ۱۰۰٪ انگلیسی برای واج‌نگار بومی en-us در StyleTTS 2 (بدون تبدیل به فارسی)."""
    cleaned = re.sub(r"[()\[\]«»\"]", " ", normalize_digits_to_ascii(raw_en))
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
    spoken = re.sub(
        r"\b([A-Z]{1,2})(\d{1,4})([A-Za-z])?\b",
        lambda m: f"{' '.join(list(m.group(1)))} {m.group(2)}"
        + (f" {m.group(3).upper()}" if m.group(3) else ""),
        spoken,
    )
    spoken = re.sub(r"\b(\d+)[oO]\b", r"\1 O", spoken)
    spoken = re.sub(
        r"\b[A-Za-z][A-Za-z0-9]*\b",
        lambda m: ENGLISH_SPEECH_HINTS.get(m.group(0).lower(), m.group(0)),
        spoken,
    )
    # قفل لهجه فارسی روی عبارت انگلیسی (حروف لاتین حفظ می‌شوند)
    try:
        from app.core.persian_pronunciation import persian_accent_english

        spoken = persian_accent_english(spoken)
    except Exception:  # noqa: BLE001
        pass
    return re.sub(r"\s{2,}", " ", spoken).strip()


def mask_english_spans(raw_text: str) -> Tuple[str, List[str]]:
    prepared = normalize_inline_english_digits(raw_text)
    spans: List[str] = []

    def _repl(match: re.Match[str]) -> str:
        full = match.group(0)
        trail_m = re.search(r"([.,;:!?]+)$", full)
        core = full[: -len(trail_m.group(1))] if trail_m else full
        trail = trail_m.group(1) if trail_m else ""
        clean = core.strip()
        if not clean or not re.search(r"[A-Za-z]", clean):
            return full
        marker = chr(0xE100 + len(spans))
        spans.append(clean)
        return f" \uE000{marker}\uE001{trail} "

    return CONTIGUOUS_EN_SPAN_RE.sub(_repl, prepared), spans


def unmask_english_spans(masked_text: str, spans: List[str]) -> str:
    return re.sub(
        r"\uE000([\uE100-\uF7FF])\uE001",
        lambda m: spans[ord(m.group(1)) - 0xE100] if (ord(m.group(1)) - 0xE100) < len(spans) else "",
        masked_text,
    )


def segment_bilingual_text(text: str) -> List[dict]:
    """تقطیع دوزبانه به سگمنت‌های فارسی (lang='fa') و انگلیسی بومی (lang='en')."""
    if not text or not text.strip():
        return []
    prepared = normalize_inline_english_digits(text)
    result: List[dict] = []
    last_idx = 0

    for match in CONTIGUOUS_EN_SPAN_RE.finditer(prepared):
        full = match.group(0)
        trail_m = re.search(r"([.,;:!?]+)$", full)
        core = full[: -len(trail_m.group(1))] if trail_m else full
        core_end = match.start() + len(core)
        if not core.strip() or not re.search(r"[A-Za-z]", core):
            continue

        if match.start() > last_idx:
            fa_part = prepared[last_idx : match.start()].strip()
            if fa_part and re.search(r"[\u0600-\u06FF\d]", fa_part):
                result.append({"lang": "fa", "text": fa_part, "spoken": fa_part})
            elif fa_part and result:
                result[-1]["text"] += fa_part
                result[-1]["spoken"] += fa_part

        en_clean = core.strip()
        result.append(
            {
                "lang": "en",
                "text": en_clean,
                "spoken": format_english_for_speech(en_clean),
            }
        )
        last_idx = core_end

    if last_idx < len(prepared):
        tail = prepared[last_idx:].strip()
        if tail and re.search(r"[\u0600-\u06FF\d]", tail):
            result.append({"lang": "fa", "text": tail, "spoken": tail})
        elif tail and result:
            result[-1]["text"] += tail
            result[-1]["spoken"] += tail

    return result
