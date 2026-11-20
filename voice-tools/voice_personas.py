"""
پرسونای صوتی لوکال (Local Voice Personas)

این ماژول «سبک خوانش» را از خود مدل جدا می‌کند: هر پرسونا مجموعه‌ای از پارامترهای
آکوستیک، پروزودی و آهنگ جمله است که روی همان موتور لوکال (StyleTTS 2 / گوینده فارسی)
اعمال می‌شود. هیچ درخواستی به سرویس خارجی ارسال نمی‌شود و صدای هیچ شرکت ثالثی
دانلود یا کلون نمی‌شود؛ تنها «ویژگی‌های سبکی» (warmth، cadence، breath، fell) بازسازی می‌شود.

پرسونای assistant-calm:
  * طنین گرم و خنثی با حضور ملایم فرکانس‌های میانی (وضوح کلمات)
  * سرعت آرام و یکنواخت (~۰.۹۷x) با واریانس کم بین هجاها
  * مکث‌های کوتاه بین عبارات و مکث متعادل پایان جمله
  * فرود نرم آهنگ در پایان جمله‌های خبری و فراز ملایم در پرسشی‌ها
  * تراز بلندی ثابت (LUFS) برای شنیدن طولانی بدون خستگی
"""
from __future__ import annotations

from typing import Dict, List, Optional


VOICE_PERSONAS: Dict[str, dict] = {
    # پیش‌فرض: طبیعی، نزدیک به خوانش انسانی خبری
    "natural": {
        "id": "natural",
        "label_fa": "طبیعی (خوانش انسانی)",
        "speed": 1.0,
        "pitch_hz": 0,
        "alpha": 0.30,
        "beta": 0.70,
        "diffusion_steps": 8,
        "embedding_scale": 1.15,
        "cadence": {"inline": 55, "clause": 135, "sentence": 225},
        "contour": {"declination": 0.06, "final_fall": 0.985, "question_rise": 1.02},
        "timbre": {"warmth": 0.0, "presence": 0.0, "breath": 0.0},
        "loudness": {"target_rms": 0.112, "compression": 0.0},
        "hardware_profile": "neutra",
    },
    # سبک دستیار هوش مصنوعی: آرام، گرم، یکنواخت و شفاف
    "assistant-calm": {
        "id": "assistant-calm",
        "label_fa": "دستیار هوش مصنوعی (آرام و گرم)",
        "speed": 0.97,
        "pitch_hz": 0,
        "alpha": 0.30,
        "beta": 0.64,  # پروزودی خنثی‌تر و پایدارتر
        "diffusion_steps": 10,  # انتشار بیشتر = بازسازی تمیزتر
        "embedding_scale": 1.08,  # هدایت احساسی کمتر
        "cadence": {"inline": 42, "clause": 110, "sentence": 265},
        "contour": {"declination": 0.035, "final_fall": 0.972, "question_rise": 1.035},
        "timbre": {"warmth": 0.17, "presence": 0.11, "breath": 0.035},
        "loudness": {"target_rms": 0.104, "compression": 0.22},
        "hardware_profile": "assistant",
    },
}

DEFAULT_PERSONA = "natural"


def get_persona(persona_id: Optional[str]) -> dict:
    """دریافت پرسونا با شناسه؛ در صورت نامعتبر بودن، پرسونای طبیعی برگردانده می‌شود."""
    key = (persona_id or DEFAULT_PERSONA).strip().lower()
    return VOICE_PERSONAS.get(key, VOICE_PERSONAS[DEFAULT_PERSONA])


def list_personas() -> List[dict]:
    return list(VOICE_PERSONAS.values())


def sentence_contour_offset(
    persona: dict,
    sentence_index: int,
    total_sentences: int,
    is_question: bool = False,
) -> float:
    """
    محاسبه آفست زیر و بمی (Hz) برای هر جمله بر اساس منحنی آهنگ پرسونا.
    خروجی در بازه ایمن ±۶ هرتز است تا بافت صدا تغییر نکند.
    """
    contour = persona.get("contour", {})
    declination = float(contour.get("declination", 0.0))
    final_fall = float(contour.get("final_fall", 1.0))
    question_rise = float(contour.get("question_rise", 1.0))

    total = max(1, total_sentences)
    progress = min(1.0, sentence_index / max(1, total - 1)) if total > 1 else 0.0

    # افت تدریجی آهنگ در طول پاراگراف + فرود نرم در جمله آخر
    factor = 1.0 - declination * progress
    if sentence_index == total - 1:
        factor *= final_fall
    if is_question:
        factor *= question_rise

    offset = (factor - 1.0) * 120.0  # ۱٪ تغییر ≈ ۱.۲ هرتز روی گوینده ۱۲۰Hz
    return max(-6.0, min(6.0, round(offset, 2)))


def persona_pause_ms(persona: dict, pause_kind: str) -> int:
    cadence = persona.get("cadence", {})
    if pause_kind == "sentence":
        return int(cadence.get("sentence", 225))
    if pause_kind == "clause":
        return int(cadence.get("clause", 135))
    return int(cadence.get("inline", 55))


def apply_timbre(samples: List[float], sample_rate: int, persona: dict) -> List[float]:
    """
    اعمال امضای آکوستیک پرسونا با فیلترهای IIR ساده (بدون وابستگی به numpy/scipy):
      * warmth: تقویت ملایم باند پایین (۱۲۰–۴۰۰Hz) برای طنین گرم
      * presence: تقویت ملایم ۲–۵kHz برای وضوح کلمات
      * breath: افزودن ته‌رنگ تنفس ملایم در سکوت‌های کوتاه
    """
    timbre = persona.get("timbre", {})
    warmth = float(timbre.get("warmth", 0.0))
    presence = float(timbre.get("presence", 0.0))
    breath = float(timbre.get("breath", 0.0))
    if warmth <= 0 and presence <= 0 and breath <= 0:
        return samples

    n = len(samples)
    if n == 0:
        return samples

    out = list(samples)

    # فیلتر پایین‌گذر یک‌قطبی برای جدا کردن باند پایین (warmth)
    if warmth > 0:
        alpha = 1.0 - pow(2.718281828, -2.0 * 3.14159265359 * 320.0 / sample_rate)
        low = 0.0
        for i in range(n):
            low += alpha * (out[i] - low)
            out[i] = out[i] + warmth * low

    # فیلتر بالاگذر برای جدا کردن باند حضور (presence)
    if presence > 0:
        alpha_hp = 1.0 - pow(2.718281828, -2.0 * 3.14159265359 * 2400.0 / sample_rate)
        low2 = 0.0
        for i in range(n):
            low2 += alpha_hp * (out[i] - low2)
            high = out[i] - low2
            out[i] = out[i] + presence * high

    # ته‌رنگ تنفس ملایم روی فریم‌های کم‌انرژی (بدون کلیک)
    if breath > 0 and n > sample_rate // 4:
        window = max(1, int(sample_rate * 0.02))
        peak = max((abs(v) for v in out), default=0.0) or 1.0
        threshold = peak * 0.02
        seed = 12345
        for start in range(0, n - window, window):
            frame_peak = 0.0
            for i in range(start, start + window, 4):
                a = abs(out[i])
                if a > frame_peak:
                    frame_peak = a
            if frame_peak < threshold:
                for i in range(start, min(n, start + window)):
                    seed = (1103515245 * seed + 12345) & 0x7FFFFFFF
                    noise = ((seed / 0x7FFFFFFF) * 2.0 - 1.0) * breath * peak * 0.08
                    out[i] += noise

    # محدودکننده نرم برای جلوگیری از کلیپینگ پس از فیلترها
    final_peak = max((abs(v) for v in out), default=0.0)
    if final_peak > 0.95:
        scale = 0.95 / final_peak
        out = [v * scale for v in out]
    return out


def apply_compression(samples: List[float], sample_rate: int, persona: dict) -> List[float]:
    """
    فشرده‌سازی دامنه ملایم (envelope follower) برای تراز یکنواخت شنیداری؛
    مشخصه اصلی صدای دستیارهای صوتی که در طول متن بلند باعث خستگی نمی‌شود.
    """
    ratio = float(persona.get("loudness", {}).get("compression", 0.0))
    if ratio <= 0 or not samples:
        return samples

    threshold = 0.16
    attack = 1.0 - pow(2.718281828, -1.0 / (0.008 * sample_rate))
    release = 1.0 - pow(2.718281828, -1.0 / (0.120 * sample_rate))

    out = list(samples)
    env = 0.0
    for i, value in enumerate(out):
        level = abs(value)
        coeff = attack if level > env else release
        env += coeff * (level - env)
        if env > threshold:
            over = env / threshold
            gain = pow(over, -ratio * 0.35)
            out[i] = value * gain
    return out


def apply_persona_postprocess(
    samples: List[float], sample_rate: int, persona: dict
) -> List[float]:
    """اعمال کامل زنجیره پرسونا روی موج نهایی (timbre + compression)."""
    out = apply_timbre(samples, sample_rate, persona)
    out = apply_compression(out, sample_rate, persona)
    return out
