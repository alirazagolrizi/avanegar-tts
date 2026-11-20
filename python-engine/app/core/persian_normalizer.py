"""
ماژول نرمال‌سازی دوزبانه (فارسی + حفظ بومی انگلیسی)، تبدیل دقیق اعداد فارسی
و تقطیع هوشمند برای موتور مرکزی StyleTTS 2.

ویژگی کلیدی:
- کلمات، حروف، سرواژه‌ها و مدل‌های انگلیسی (A، B، C، StyleTTS 2، PL-BERT، WavLM، RTX 5090،
  GPT-4o، iPhone 17 Pro، Galaxy A57، NVMe، LTPO، 120Hz، 6000mAh، 32GB، Wi-Fi 7، USB-C)
  هرگز به فارسی تبدیل نمی‌شوند و با واج‌نگار بومی en-us در StyleTTS 2 دقیقاً انگلیسی خوانده می‌شوند.
- اعداد در بافت فارسی (اعشار دارای صفر ابتدایی 3.05، ممیز فارسی ۷٫۸، اعداد منفی -16،
  درصد پیشوندی/پسوندی ٪۴۰ و 32.5%، ارز $1,299، هزارگان ۳ رقمی، ساعت، نسخه و ترتیبی)
  به‌صورت کامل و بی‌نقص به حروف فارسی تبدیل می‌شوند.
"""
from __future__ import annotations

import re
from typing import Dict, List, Optional

from app.core.persian_pronunciation import (
    PRONUNCIATION_VERSION,
    apply_persian_pronunciation,
    persian_accent_english,
)
from app.core.english_phonetics import (
    ENGLISH_SPEECH_HINTS,
    expand_persian_numbers,
    mask_english_spans,
    segment_bilingual_text,
    unmask_english_spans,
)

try:
    from hazm import Normalizer as HazmNormalizer
except ImportError:  # pragma: no cover
    HazmNormalizer = None


class PersianTextProcessor:
    """پیش‌پردازشگر دوزبانه مقالات فارسی-انگلیسی برای موتور عصبی StyleTTS 2."""

    def __init__(
        self,
        max_chars_per_chunk: int = 220,
        custom_english_hints: Optional[Dict[str, str]] = None,
    ) -> None:
        self.max_chars_per_chunk = max_chars_per_chunk
        self.english_hints = {**ENGLISH_SPEECH_HINTS, **(custom_english_hints or {})}
        self._hazm = (
            HazmNormalizer(
                correct_spacing=True,
                remove_diacritics=False,  # حفظ اعراب ویراستاری کلمات هم‌نگاره
                persian_numbers=False,
            )
            if HazmNormalizer is not None
            else None
        )

    @staticmethod
    def normalize_persian_letters(text: str) -> str:
        """استانداردسازی حروف فارسی و حذف نویسه‌های مخرب (کشیده، کاراکترهای کنترل نامرئی)."""
        out = re.sub(r"\u0640+", "", text)
        out = re.sub(r"[\u200b\u200d\u200e\u200f\u202a-\u202e\ufeff]", "", out)
        out = re.sub(r"[\u064a\u0649\u06cc\u06cd\u06d0\u06d1]", "ی", out)
        out = re.sub(r"[\u0643\u06aa]", "ک", out)
        out = out.replace("\u06c0", "ه\u0654")
        out = re.sub(r"[\u0629\u06d5]", "ه", out)
        out = re.sub(r"[\u0623\u0625\u0671]", "ا", out)
        out = out.replace("¬", "\u200c")
        return re.sub(r"\u200c{2,}", "\u200c", out)

    def normalize(self, text: str) -> str:
        """نرمال‌سازی فارسی و تبدیل دقیق اعداد با حفظ ۱۰۰٪ حروف و واژه‌های انگلیسی."""
        if not text or not text.strip():
            return ""

        cleaned = re.sub(r"<[^>]+>", " ", text)
        cleaned = re.sub(r"\[([^\]]+)\]\(https?://[^\s)]+\)", r"\1", cleaned)
        cleaned = re.sub(r"https?://\S+", " ", cleaned)
        cleaned = self.normalize_persian_letters(cleaned)

        # محافظت از تمام بخش‌های انگلیسی تا هیچ حرف انگلیسی به فارسی تبدیل نشود
        masked, en_spans = mask_english_spans(cleaned)

        # بازنویسی دقیق تمام اعداد فارسی (اعشار، منفی، درصد، ارز، هزارگان، زمان، ترتیبی)
        masked = expand_persian_numbers(masked)

        if self._hazm is not None:
            masked = self._hazm.normalize(masked)
        else:
            masked = re.sub(
                r"(^|[\s(«،؛:])(ن?می)\s+(?=[\u0600-\u06FF]{2,})",
                "\\1\\2\u200c",
                masked,
            )
            masked = re.sub(
                r"([\u0600-\u06FF]{2,})\s+(ها|های|هایی|هایم|هایت|هایش)(?=\s|[،؛.؟!)\]»]|$)",
                "\\1\u200c\\2",
                masked,
            )
            masked = re.sub(
                r"([\u0600-\u06FF]*[ادذرزژو])\s+(ترین|تر)(?=\s|[،؛.؟!)\]»]|$)",
                "\\1\\2",
                masked,
            )
            masked = re.sub(
                r"([\u0600-\u06FF]{2,})\s+(ترین|تر)(?=\s|[،؛.؟!)\]»]|$)",
                "\\1\u200c\\2",
                masked,
            )

        # لایه تلفظ دقیق فارسی: اعراب هوموگراف‌ها و تفکیک عبارات سرهم‌نویسی‌شده
        masked, self._last_applied_rules = apply_persian_pronunciation(masked)

        masked = masked.replace(",", "،").replace("?", "؟").replace(";", "؛")
        masked = re.sub(r"\s+\u200c|\u200c\s+", " ", masked)
        masked = re.sub(r"[ \t]+", " ", masked)
        masked = re.sub(r"\s*([،؛؟!.])\s*", r"\1 ", masked)
        masked = re.sub(r"\n{2,}", "\n", masked)

        restored = unmask_english_spans(masked, en_spans)
        restored = re.sub(r"\s+([،؛؟!.])", r"\1", restored)
        restored = re.sub(r"([،؛؟!])(?=[^\s\n])", r"\1 ", restored)
        return re.sub(r"[ \t]{2,}", " ", restored).strip()

    def audit_pronunciation(self, text: str) -> dict:
        """ممیزی دوزبانه: تأیید حفظ انگلیسی به انگلیسی و تبدیل بی‌نقص اعداد فارسی."""
        normalized = self.normalize(text)
        spans = segment_bilingual_text(normalized)
        en_spans = [{"text": s["text"], "spoken": s["spoken"]} for s in spans if s["lang"] == "en"]
        fa_digits: List[str] = []
        for s in spans:
            if s["lang"] == "fa":
                fa_digits.extend(re.findall(r"[\d۰-۹٠-٩]+", s["text"]))
        input_has_en = bool(re.search(r"[A-Za-z]", text or ""))
        english_preserved = (not input_has_en) or len(en_spans) > 0
        return {
            "normalized": normalized,
            "pronunciation_version": PRONUNCIATION_VERSION,
            "persian_rules_applied": getattr(self, "_last_applied_rules", []),
            "english_spans": en_spans,
            "persian_digits_remaining": fa_digits,
            "english_preserved": english_preserved,
            "passed": english_preserved and len(fa_digits) == 0,
        }

    def split_bilingual_for_styletts2(self, text: str) -> List[dict]:
        """
        تولید زنجیره سگمنت‌های دوزبانه (lang='fa' و lang='en') برای واج‌نگاری IPA
        و استنتاج LFinference در PersianStyleTTS2Engine با بردار استایل یکسان ref_s.
        """
        chunks = self.split_for_styletts2(text)
        plan: List[dict] = []
        for chunk in chunks:
            spans = segment_bilingual_text(chunk)
            for idx, sp in enumerate(spans):
                plan.append(
                    {
                        "lang": sp["lang"],
                        "text": sp["text"],
                        "spoken": sp["spoken"],
                        "end_of_sentence": idx == len(spans) - 1,
                    }
                )
        return plan

    def split_for_styletts2(self, text: str) -> List[str]:
        """تقطیع هوشمند برای پنجره ۵۱۲ توکنی PL-BERT در StyleTTS 2 بدون شکستن Next.js یا PCIe 5.0."""
        normalized = self.normalize(text)
        if not normalized:
            return []

        raw_sentences = re.split(
            r"(?:(?<=[؟!\n])|(?<=(?<![A-Za-z\d])\.(?![A-Za-z\d])))\s+",
            normalized,
        )
        chunks: List[str] = []
        buffer = ""

        for sentence in raw_sentences:
            sentence = sentence.strip()
            if not sentence:
                continue
            if len(sentence) <= self.max_chars_per_chunk:
                candidate = f"{buffer} {sentence}".strip() if buffer else sentence
                if len(candidate) <= self.max_chars_per_chunk:
                    buffer = candidate
                else:
                    if buffer:
                        chunks.append(self._ensure_terminal_punctuation(buffer))
                    buffer = sentence
            else:
                if buffer:
                    chunks.append(self._ensure_terminal_punctuation(buffer))
                    buffer = ""
                chunks.extend(self._split_long_sentence(sentence))

        if buffer:
            chunks.append(self._ensure_terminal_punctuation(buffer))
        return chunks

    def _split_long_sentence(self, sentence: str) -> List[str]:
        clauses = re.split(r"(?<=[،؛:])\s+", sentence)
        result: List[str] = []
        current = ""
        for clause in clauses:
            candidate = f"{current} {clause}".strip() if current else clause
            if len(candidate) <= self.max_chars_per_chunk:
                current = candidate
            elif current:
                result.append(self._ensure_terminal_punctuation(current))
                if len(clause) <= self.max_chars_per_chunk:
                    current = clause
                else:
                    result.extend(self._hard_word_split(clause))
                    current = ""
            else:
                result.extend(self._hard_word_split(clause))
        if current:
            result.append(self._ensure_terminal_punctuation(current))
        return result

    def _hard_word_split(self, phrase: str) -> List[str]:
        words = phrase.split()
        parts: List[str] = []
        cur = ""
        for word in words:
            nxt = f"{cur} {word}".strip() if cur else word
            if len(nxt) <= self.max_chars_per_chunk:
                cur = nxt
            else:
                if cur:
                    parts.append(self._ensure_terminal_punctuation(cur))
                cur = word
        if cur:
            parts.append(self._ensure_terminal_punctuation(cur))
        return parts

    @staticmethod
    def _ensure_terminal_punctuation(chunk: str) -> str:
        chunk = chunk.strip()
        if chunk and chunk[-1] not in ".؟!،؛":
            return f"{chunk}."
        return chunk
