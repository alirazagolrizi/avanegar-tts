"""
لایه تلفظ دقیق فارسی و قفل لهجه (Persian Pronunciation & Accent-Lock) — معادل پایتونی.

رفع سه باگ مدل A:
  ۱. اعراب‌گذاری هوموگراف‌ها: «کرهای» → «کُرهای» (کره‌ای/کره جنوبی) تا اشتباه خوانده نشود.
  ۲. تفکیک عبارات سرهم‌نویسی‌شده: «درمقایسه‌با» → «در مقایسه با» تا کلمات جدا سرهم خوانده نشوند.
  ۳. قفل لهجه انگلیسی: حروف لاتین حفظ می‌شوند اما بازنویسی آوانگاری سازگار با لهجه فارسی
     اعمال می‌شود تا گوینده فارسی همان‌گونه که یک فرد فارسی‌زبان انگلیسی می‌خواند تلفظ کند.
"""
from __future__ import annotations

import re
from typing import Dict, List, Tuple

PRONUNCIATION_VERSION = "fa-lex-v3-accent-lock"

PERSIAN_HOMOGRAPHS: Dict[str, str] = {
    # --- کره / کره‌ای (پرتکرارترین باگ گزارش‌شده) ---
    "کره": "کُره",
    "کرهای": "کُرهای",
    "کرهایها": "کُرهایها",
    "کرهایهای": "کُرهایهای",
    "کرهایهای": "کُرهایهای",
    # --- هوموگراف‌های رایج در مقالات فناوری ---
    "ملت": "مِلَّت",
    "حرکت": "حَرَکَت",
    "خبر": "خَبَر",
    "اخبار": "اَخبار",
    "مصرف": "مَصرَف",
    "مصرفی": "مَصرَفی",
    "جدول": "جَدوَل",
    "مرض": "مَرَض",
    "عقد": "عَقد",
    "قرض": "قَرض",
    "جگر": "جِگَر",
    "کرم": "کِرِم",
    "عسل": "عَسَل",
    "امل": "اَمَل",
    "اجل": "اَجَل",
    "مورخ": "مُوَرَّخ",
    "مورد": "مَورِد",
    "فرد": "فَرد",
    "سیل": "سِیل",
    "مهر": "مِهر",
    "سمت": "سَمت",
    "خدمت": "خِدمَت",
    "دفتر": "دَفتَر",
    "حرف": "حَرف",
    "علم": "عِلم",
    "عمل": "عَمَل",
    "عمد": "عَمد",
    "قدر": "قَدر",
    "برنج": "بِرِنج",
    "کنجد": "کُنجِد",
    "قالب": "قالَب",
    "مسیر": "مَسیر",
    "نزدیک": "نَزدیک",
    "نتیجه": "نَتیجه",
    "متوسط": "مُتَوَسِّط",
    "محاسبه": "مُحاسِبه",
    "مسئله": "مَسئَله",
    "مؤسسه": "مُؤَسِّسه",
    "پرچمدار": "پَرچَم‌دار",
    "میان‌رده": "میان‌رَده",
    "نمایشگر": "نِمایشگَر",
    "تراشه": "تِراشه",
    "نسل": "نَسل",
    "پردازنده": "پِردازَنده",
    "ضخامت": "ضَخامَت",
    "وزن": "وَزن",
    "ظرفیت": "ظَرفیَت",
    "استاندارد": "اِستاندارد",
    "فناوری": "فَنّاوری",
    "امنیت": "اَمنیَت",
    "حریم": "حَریم",
    "خصوصی": "خُصوصی",
    "مصنوعی": "مَصنوعی",
    "عصبی": "عَصَبی",
    "تولید": "تَولید",
    "پردازش": "پِردازِش",
    "مقاله": "مَقاله",
    "نویسنده": "نِویسَنده",
    "گزارش": "گِزارِش",
    "بررسی": "بَررسی",
    "قیمت": "قِیمَت",
    "رشد": "رُشد",
    "کاهش": "کاهِش",
    "افزایش": "اَفزایِش",
    "کیفیت": "کِیفیَت",
    "سرعت": "سُرعَت",
    "حافظه": "حافِظه",
    "ذخیره": "ذَخیره",
    "کاربر": "کاربَر",
    "تجربه": "تَجرُبه",
    "صفحه": "صَفحه",
    "روشنایی": "رُوشَنایی",
}

PERSIAN_ACCENT_ENGLISH_RESPELL: Dict[str, str] = {
    "openai": "Open AI",
    "chatgpt": "Chat GPT",
    "pytorch": "Py Torch",
    "tensorflow": "Tensor Flow",
    "tensorrt": "Tensor RT",
    "github": "Git Hub",
    "gitlab": "Git Lab",
    "youtube": "You Tube",
    "javascript": "Java Script",
    "typescript": "Type Script",
    "postgresql": "Postgres Q L",
    "postgres": "Postgres",
    "gif": "G I F",
    "jpeg": "J P E G",
    "png": "P N G",
    "pdf": "P D F",
    "url": "U R L",
    "oauth": "O Auth",
    "nginx": "Engine X",
    "jquery": "J Query",
    "node.js": "Node J S",
    "nextjs": "Next J S",
    "iphone": "iPhone",
    "ipad": "iPad",
    "imac": "iMac",
    "macbook": "Mac Book",
    "macos": "mac O S",
    "ios": "i O S",
    "ipados": "iPad O S",
    "wifi": "Wi Fi",
    "wi-fi": "Wi Fi",
    "bluetooth": "Bluetooth",
    "usb": "U S B",
    "hdmi": "H D M I",
    "nvme": "N V M E",
    "pcie": "P C I E",
    "ssd": "S S D",
    "hdd": "H D D",
    "vram": "V RAM",
    "ddr": "D D R",
    "lpddr": "L P D D R",
    "amoled": "A M O L E D",
    "oled": "OLED",
    "ltpo": "L T P O",
    "hdr": "H D R",
    "rgb": "R G B",
    "nfc": "N F C",
    "gps": "G P S",
    "lte": "L T E",
    "esim": "E SIM",
    "soc": "S O C",
    "apu": "A P U",
    "ipu": "I P U",
    "npu": "N P U",
    "gpu": "G P U",
    "cpu": "C P U",
    "tpu": "T P U",
    "api": "A P I",
    "sdk": "S D K",
    "cli": "C L I",
    "iot": "I O T",
    "vpn": "V P N",
    "dns": "D N S",
    "sql": "S Q L",
    "html": "H T M L",
    "css": "C S S",
    "http": "H T T P",
    "https": "H T T P S",
    "xml": "X M L",
    "json": "Jason",
    "ipv4": "I P v 4",
    "ipv6": "I P v 6",
    "dlss": "D L S S",
    "fsr": "F S R",
    "raytracing": "Ray Tracing",
    "firmware": "Firm Ware",
    "blockchain": "Block Chain",
    "smartphone": "Smart Phone",
    "laptop": "Lap Top",
    "desktop": "Desk Top",
    "browser": "Browser",
    "firefox": "Fire Fox",
    "benchmark": "Benchmark",
    "kernel": "Kernel",
    "drivers": "Drivers",
    "startup": "Start Up",
    "podcast": "Podcast",
}

GLUED_PERSIAN_PHRASES: Dict[str, str] = {
    "درمقایسهبا": "در مقایسه با",
    "درمقایسه": "در مقایسه",
    "بیشاز": "بیش از",
    "کماز": "کم از",
    "درحالیکه": "در حالی که",
    "درحالی": "در حالی",
    "بهراحتی": "به راحتی",
    "بجای": "به جای",
    "رویهمرفته": "روی هم رفته",
    "توجهبه": "توجه به",
    "مربوطبه": "مربوط به",
    "منجربه": "منجر به",
    "باعثمیشود": "باعث می‌شود",
    "باعثمیشوند": "باعث می‌شوند",
    "انجاممیشود": "انجام می‌شود",
    "استفادهکرد": "استفاده کرد",
    "استفادهکردند": "استفاده کردند",
    "نشاننمیدهد": "نشان نمی‌دهد",
    "نشانمیدهد": "نشان نمی‌دهد",
    "نشانمیدهند": "نشان نمی‌دهند",
    "همزمان": "هم‌زمان",
    "بهمرور": "به مرور",
    "درنتیجه": "در نتیجه",
    "درنهایت": "در نهایت",
    "درضمن": "در ضمن",
    "بارشد": "با رشد",
    "باافت": "با افت",
    "براساس": "بر اساس",
    "برخلاف": "بر خلاف",
    "باعنوان": "با عنوان",
    "بهمنظور": "به منظور",
    "درمورد": "در مورد",
    "بهعنوان": "به عنوان",
    "صرفا": "صرفاً",
    "تقریبا": "تقریباً",
    "معمولا": "معمولاً",
    "کاملا": "کاملاً",
    "دقیقا": "دقیقاً",
    "مثلا": "مثلاً",
    "خیلیها": "خیلی‌ها",
}


def _zwnj_tolerant_pattern(key: str) -> str:
    """ساخت الگوی تحمل‌کننده نیم‌فاصله برای تطبیق هر دو نگارش «کره‌ای» و «کرهای»."""
    return "\u200c?".join(re.escape(ch) for ch in key)


def persian_accent_english(english_spoken: str) -> str:
    """قفل لهجه: بازنویسی آوانگاری انگلیسی متناسب با خوانش فارسی، با حفظ حروف لاتین."""
    if not english_spoken or not english_spoken.strip():
        return ""
    out = english_spoken
    for key in sorted(PERSIAN_ACCENT_ENGLISH_RESPELL, key=len, reverse=True):
        pattern = rf"(?<![A-Za-z0-9]){re.escape(key)}(?![A-Za-z0-9])"
        out = re.sub(pattern, PERSIAN_ACCENT_ENGLISH_RESPELL[key], out, flags=re.IGNORECASE)
    return re.sub(r"\s{2,}", " ", out).strip()


def apply_persian_pronunciation(text: str) -> Tuple[str, List[str]]:
    """اعمال اعراب هوموگراف‌ها و تفکیک عبارات سرهم؛ خروجی: (متن اصلاح‌شده، فهرست قواعد)."""
    if not text:
        return "", []
    out = text
    applied: List[str] = []

    for key in sorted(GLUED_PERSIAN_PHRASES, key=len, reverse=True):
        pattern = _zwnj_tolerant_pattern(key)
        if not re.search(pattern, out):
            continue
        out = re.sub(pattern, GLUED_PERSIAN_PHRASES[key], out)
        applied.append(f"تفکیک:{key}")

    for key in sorted(PERSIAN_HOMOGRAPHS, key=len, reverse=True):
        pattern = _zwnj_tolerant_pattern(key)
        regex = re.compile(rf"(?<![\u0600-\u06FF]){pattern}(?![\u0600-\u06FF])")
        if not regex.search(out):
            continue
        replacement = PERSIAN_HOMOGRAPHS[key]
        out = regex.sub(replacement, out)
        if replacement != key:
            applied.append(f"اعراب:{key}")

    return out, applied


PERSIAN_PRONUNCIATION_SUITE = [
    ("کُرهای (Korean) با اعراب صحیح", "شرکت‌های کره‌ای و کرهای‌ها آمدند.", "کُرهای"),
    ("تفکیک «درمقایسه‌با»", "ضخامت آن درمقایسه‌با نسل قبل کمتر است.", "در مقایسه با"),
    ("تفکیک «بیش‌از» و «درحالیکه»", "بیش‌از حد داغ است درحالیکه مصرف کمی دارد.", "بیش از"),
    ("اعراب «مصرف»", "مصرف باتری بهینه شد.", "مَصرَف"),
    ("اعراب «ملت» و «حرکت»", "این حرکت ملت را همراه کرد.", "مِلَّت"),
]
