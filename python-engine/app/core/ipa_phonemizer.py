"""
واج‌نگار دوزبانه آفلاین IPA (Bilingual FA + EN Phonemizer) و جدول رسمی ۱۷۸ نماد
واجی StyleTTS 2 (TextCleaner).

مزیت معماری کلیدی StyleTTS 2 نسبت به XTTS v2:
مدل StyleTTS 2 به‌جای توکن‌های املایی BPE مستقیماً روی الفبای آوایی بین‌المللی (IPA)
با انکودر واجی PL-BERT کار می‌کند. به همین دلیل، بخش‌های فارسی مقاله (به‌همراه اعداد
تبدیل‌شده به حروف) با موتور واج‌نگار فارسی (fa) به IPA فارسی و بخش‌های انگلیسی
(حروف منفرد A/B/C، سرواژه‌ها NVMe/LTPO/GPU، مدل‌ها RTX 5090/GPT-4o/Galaxy A57)
بدون تبدیل به فارسی، مستقیماً با واج‌نگار انگلیسی آمریکایی (en-us) به IPA اصیل
انگلیسی تبدیل شده و در یک دنباله واحد با صدای یکسان گوینده (ref_s) خوانده می‌شوند!
"""
from __future__ import annotations

import re
from typing import Dict, List, Optional

from app.core.english_phonetics import segment_bilingual_text

# جدول رسمی ۱۷۸ نماد واجی StyleTTS 2 (پشتیبانی کامل از واج‌های فارسی، انگلیسی، تکیه و مکث)
_PAD = "$"
_PUNCTUATION = ';:,.!?¡¿—…"«»“” '
_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
_LETTERS_IPA = (
    "ɑɐɒæɓʙβɔɕçɗɖðʤəɘɚɛɜɝɞɟʄɡɠɢʛɦɧħɥʜɨɪʝɭɬɫɮʟɱɯɰŋɳɲɴøɵɸθœɶʘɹɺɾɻʀʁɽʂʃʈʧʉʊʋⱱʌɣɤʍχʎʏʑʐʒʔʡʕʢǀǁǂǃˈˌːˑʼʴʰʱʲʷˠˤ˞↓↑→↗↘'̩'ᵻ"
)

STYLETTS2_SYMBOLS: List[str] = [_PAD, *list(_PUNCTUATION), *list(_LETTERS), *list(_LETTERS_IPA)]

# نگاشت واجی پایه برای محیط‌های تست بدون باینری espeak-ng (در پروداکشن espeak-ng فعال است)
_FA_CHAR_IPA: Dict[str, str] = {
    "آ": "ɒː", "ا": "ɒ", "ب": "b", "پ": "p", "ت": "t", "ث": "s", "ج": "ʤ",
    "چ": "ʧ", "ح": "h", "خ": "x", "د": "d", "ذ": "z", "ر": "ɾ", "ز": "z",
    "ژ": "ʒ", "س": "s", "ش": "ʃ", "ص": "s", "ض": "z", "ط": "t", "ظ": "z",
    "ع": "ʔ", "غ": "ɣ", "ف": "f", "ق": "ɢ", "ک": "k", "گ": "ɡ", "ل": "l",
    "م": "m", "ن": "n", "و": "v", "ه": "h", "ی": "iː", "ئ": "ʔ", "ؤ": "ʔ",
    "ء": "ʔ", "\u064e": "æ", "\u0650": "e", "\u064f": "o", "\u0654": "je",
    "،": ",", "؛": ";", "؟": "?", ".": ".", "!": "!", ":": ":", "\u200c": " ",
}

_EN_LETTER_IPA: Dict[str, str] = {
    "A": "ˈeɪ", "B": "ˈbiː", "C": "ˈsiː", "D": "ˈdiː", "E": "ˈiː", "F": "ˈɛf",
    "G": "ˈʤiː", "H": "ˈeɪʧ", "I": "ˈaɪ", "J": "ˈʤeɪ", "K": "ˈkeɪ", "L": "ˈɛl",
    "M": "ˈɛm", "N": "ˈɛn", "O": "ˈoʊ", "P": "ˈpiː", "Q": "ˈkjuː", "R": "ˈɑːɹ",
    "S": "ˈɛs", "T": "ˈtiː", "U": "ˈjuː", "V": "ˈviː", "W": "ˈdʌbəljuː",
    "X": "ˈɛks", "Y": "ˈwaɪ", "Z": "ˈziː",
}

_EN_WORD_IPA: Dict[str, str] = {
    "nvidia": "ɛnˈvɪdiə",
    "blackwell": "ˈblækwɛl",
    "styletts": "ˈstaɪl tiː tiː ˈɛs",
    "plbert": "piː ɛl ˈbɜːɹt",
    "wavlm": "ˈweɪv ɛl ˈɛm",
    "istftnet": "aɪ ɛs tiː ɛf tiː ˈnɛt",
    "hifigan": "ˈhaɪfaɪ ɡæn",
    "pytorch": "ˈpaɪtɔːɹʧ",
    "tensor": "ˈtɛnsɚ",
    "openai": "ˈoʊpən eɪ ˈaɪ",
    "open": "ˈoʊpən",
    "chat": "ˈʧæt",
    "iphone": "ˈaɪfoʊn",
    "pro": "ˈpɹoʊ",
    "galaxy": "ˈɡæləksi",
    "snapdragon": "ˈsnæpdɹæɡən",
    "elite": "ɪˈliːt",
    "oled": "ˈoʊlɛd",
    "amoled": "ˈæmoʊlɛd",
    "mac": "ˈmæk",
    "wi-fi": "ˈwaɪfaɪ",
    "wifi": "ˈwaɪfaɪ",
    "hertz": "ˈhɜːɹts",
    "gigahertz": "ˈɡɪɡəhɜːɹts",
    "megahertz": "ˈmɛɡəhɜːɹts",
    "kilohertz": "ˈkɪloʊhɜːɹts",
    "gigabytes": "ˈɡɪɡəbaɪts",
    "terabytes": "ˈtɛɹəbaɪts",
    "milliamp": "ˈmɪliæmp",
    "hours": "ˈaʊɚz",
    "minus": "ˈmaɪnəs",
    "plus": "ˈplʌs",
    "point": "ˈpɔɪnt",
    "version": "ˈvɜːɹʒən",
    "times": "ˈtaɪmz",
    "ram": "ˈɹæm",
    "model": "ˈmɑːdəl",
    "to": "tə",
    "next": "ˈnɛkst",
    "node": "ˈnoʊd",
}

_EN_DIGIT_IPA = {
    "0": "ˈzɪɹoʊ", "1": "ˈwʌn", "2": "ˈtuː", "3": "ˈθɹiː", "4": "ˈfɔːɹ",
    "5": "ˈfaɪv", "6": "ˈsɪks", "7": "ˈsɛvən", "8": "ˈeɪt", "9": "ˈnaɪn",
}


class StyleTTSTextCleaner:
    """تبدیل رشته واجی IPA به آرایه شناسه‌های عددی ورودی PL-BERT و TextEncoder در StyleTTS 2."""

    def __init__(self) -> None:
        self.word_index_dict: Dict[str, int] = {
            symbol: idx for idx, symbol in enumerate(STYLETTS2_SYMBOLS)
        }

    @property
    def vocab_size(self) -> int:
        return len(self.word_index_dict)

    def __call__(self, ipa_text: str) -> List[int]:
        # افزودن توکن مرزی صفر در ابتدا و انتها مطابق پیاده‌سازی رسمی StyleTTS 2
        token_ids = [
            self.word_index_dict[ch]
            for ch in ipa_text
            if ch in self.word_index_dict
        ]
        return [0, *token_ids, 0]


class BilingualIPAPhonemizer:
    """
    واج‌نگار آفلاین دوزبانه (فارسی 'fa' + انگلیسی بومی 'en-us') بدون تبدیل انگلیسی به فارسی.
    در سرور تولید از EspeakBackend محلی (با preserve_punctuation=True و with_stress=True)
    استفاده می‌کند و در محیط‌های فاقد espeak-ng به نگاشت قطعی IPA برمی‌گردد.
    """

    def __init__(self, fa_voice: str = "fa", en_voice: str = "en-us") -> None:
        self.fa_voice = fa_voice
        self.en_voice = en_voice
        self.cleaner = StyleTTSTextCleaner()
        self._fa_backend: Optional[object] = None
        self._en_backend: Optional[object] = None
        self._init_espeak_backends()

    def _init_espeak_backends(self) -> None:
        try:
            from phonemizer.backend import EspeakBackend  # type: ignore

            self._fa_backend = EspeakBackend(
                language=self.fa_voice,
                preserve_punctuation=True,
                with_stress=True,
                words_mismatch="ignore",
            )
            self._en_backend = EspeakBackend(
                language=self.en_voice,
                preserve_punctuation=True,
                with_stress=True,
                words_mismatch="ignore",
            )
        except Exception:  # noqa: BLE001
            self._fa_backend = None
            self._en_backend = None

    @property
    def using_espeak(self) -> bool:
        return self._fa_backend is not None and self._en_backend is not None

    def phonemize_persian_span(self, fa_text: str) -> str:
        text = fa_text.strip()
        if not text:
            return ""
        if self._fa_backend is not None:
            out = self._fa_backend.phonemize([text], strip=True)[0]  # type: ignore[attr-defined]
            return self._sanitize_ipa(out)
        # نگاشت قطعی IPA فارسی برای تست بدون espeak-ng
        ipa = "".join(_FA_CHAR_IPA.get(ch, ch if ch == " " else "") for ch in text)
        return self._sanitize_ipa(ipa)

    def phonemize_english_span(self, en_spoken: str) -> str:
        """تبدیل عبارت انگلیسی به IPA اصیل انگلیسی آمریکایی (en-us) — هرگز فارسی نمی‌شود!"""
        text = en_spoken.strip()
        if not text:
            return ""
        if self._en_backend is not None:
            out = self._en_backend.phonemize([text], strip=True)[0]  # type: ignore[attr-defined]
            return self._sanitize_ipa(out)

        tokens = re.findall(r"[A-Za-z\-]+|\d+|[.,;:!?]", text)
        parts: List[str] = []
        for tok in tokens:
            if len(tok) == 1 and tok.isalpha():
                parts.append(_EN_LETTER_IPA[tok.upper()])
            elif tok.lower() in _EN_WORD_IPA:
                parts.append(_EN_WORD_IPA[tok.lower()])
            elif tok.isdigit():
                parts.append(" ".join(_EN_DIGIT_IPA[d] for d in tok))
            elif tok in ".,;:!?":
                parts.append(tok)
            else:
                parts.append(tok.lower())
        return self._sanitize_ipa(" ".join(parts))

    def phonemize_bilingual(self, normalized_text: str) -> dict:
        """
        تبدیل یک جمله نرمال‌شده دوزبانه به دنباله یکپارچه IPA و شناسه‌های عددی StyleTTS 2.
        خروجی شامل ipa، token_ids و تفکیک واجی هر سگمنت [fa] و [en-us] است.
        """
        spans = segment_bilingual_text(normalized_text)
        ipa_parts: List[str] = []
        detailed_spans: List[dict] = []

        for sp in spans:
            if sp["lang"] == "en":
                span_ipa = self.phonemize_english_span(sp["spoken"])
                backend_lang = self.en_voice
            else:
                span_ipa = self.phonemize_persian_span(sp["spoken"])
                backend_lang = self.fa_voice

            if span_ipa:
                ipa_parts.append(span_ipa)
            detailed_spans.append(
                {
                    "lang": backend_lang,
                    "text": sp["text"],
                    "spoken": sp["spoken"],
                    "ipa": span_ipa,
                }
            )

        merged_ipa = re.sub(r"\s+([.,;:!?])", r"\1", " ".join(ipa_parts)).strip()
        token_ids = self.cleaner(merged_ipa)
        return {
            "ipa": merged_ipa,
            "token_ids": token_ids,
            "token_count": len(token_ids),
            "spans": detailed_spans,
            "backend": "espeak-ng" if self.using_espeak else "builtin-ipa-table",
        }

    def _sanitize_ipa(self, raw_ipa: str) -> str:
        allowed = self.cleaner.word_index_dict
        filtered = "".join(ch for ch in raw_ipa if ch in allowed)
        return re.sub(r"\s{2,}", " ", filtered).strip()
