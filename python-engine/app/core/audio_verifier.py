"""
راستی‌آزمایی آفلاین «درست خوانده شدن متن، اعداد و کلمات انگلیسی» در خروجی موتور StyleTTS 2.

این ماژول دقیقاً همان باگی را هدف می‌گیرد که در نسخه‌های اولیه دیده شد:
خروجی صوتی تولید می‌شود اما بخشی از متن جا می‌افتد، تکرار می‌شود یا با
سرعت نادرست خوانده می‌شود. راه‌حل: بازخوانی (ASR) فایل تولیدشده با مدل
لوکال Faster-Whisper، نرمال‌سازی هر دو متن با PersianTextProcessor و محاسبه
نرخ خطای کلمه (WER) به‌همراه تشخیص قطعات جامانده.

هیچ درخواستی به اینترنت ارسال نمی‌شود؛ مدل Whisper از مسیر لوکال سرور بارگذاری می‌گردد.
"""
from __future__ import annotations

import difflib
import math
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import List, Optional, Union

import numpy as np
import soundfile as sf
from jiwer import cer, wer as compute_wer
from loguru import logger

from app.core.persian_normalizer import PersianTextProcessor


# نرخ خوانش طبیعی گوینده فارسی (کاراکتر بر ثانیه) برای تشخیص بریدگی/کشیدگی
FA_CHARS_PER_SEC_MIN = 6.0
FA_CHARS_PER_SEC_MAX = 24.0
FA_NOMINAL_CHARS_PER_SEC = 13.0


@dataclass
class VerificationIssue:
    """یک نقص شناسایی‌شده در خوانش متن."""

    kind: str  # missing_text | repeated_text | wrong_speed | silence | unreadable
    severity: str  # critical | warning
    detail: str
    expected: Optional[str] = None
    heard: Optional[str] = None


@dataclass
class TextVerificationReport:
    """گزارش کامل راستی‌آزمایی صحت خوانش متن."""

    audio_path: str
    requested_text: str
    transcript: str
    wer: float
    char_error_rate: float
    duration_sec: float
    requested_chars: int
    transcript_chars: int
    coverage_ratio: float
    chars_per_sec: float
    coverage_by_sentence: List[float] = field(default_factory=list)
    missing_sentences: List[str] = field(default_factory=list)
    issues: List[VerificationIssue] = field(default_factory=list)
    passed: bool = False

    def to_dict(self) -> dict:
        payload = asdict(self)
        payload["issues"] = [asdict(i) if not isinstance(i, dict) else i for i in self.issues]
        return payload


class SpokenTextVerifier:
    """راستی‌آزمای متن خوانده‌شده با ASR لوکال (بدون اینترنت)."""

    def __init__(
        self,
        whisper_model_dir: Union[str, Path],
        language: str = "fa",
        device: str = "cuda",
        compute_type: str = "float16",
        max_wer: float = 0.18,
    ) -> None:
        self.whisper_model_dir = Path(whisper_model_dir)
        self.language = language
        self.device = device
        self.compute_type = compute_type
        self.max_wer = max_wer
        self.normalizer = PersianTextProcessor()
        self._model = None

    def _load_model(self):
        if self._model is not None:
            return self._model
        if not self.whisper_model_dir.exists():
            raise FileNotFoundError(
                f"مسیر محلی مدل Faster-Whisper یافت نشد: {self.whisper_model_dir}"
            )
        from faster_whisper import WhisperModel

        logger.info(f"بارگذاری آفلاین مدل ASR از {self.whisper_model_dir}")
        self._model = WhisperModel(
            str(self.whisper_model_dir),
            device=self.device,
            compute_type=self.compute_type,
            local_files_only=True,
        )
        return self._model

    def transcribe(self, audio_path: Union[str, Path]) -> str:
        model = self._load_model()
        segments, _info = model.transcribe(
            str(audio_path),
            language=self.language,
            beam_size=5,
            vad_filter=True,
        )
        return " ".join(seg.text.strip() for seg in segments).strip()

    def verify(
        self,
        audio_path: Union[str, Path],
        requested_text: str,
        transcript: Optional[str] = None,
    ) -> TextVerificationReport:
        """
        مقایسه متن درخواستی ادمین با آنچه واقعاً در فایل صوتی خوانده شده است.
        """
        path = Path(audio_path)
        if not path.exists():
            raise FileNotFoundError(f"فایل صوتی یافت نشد: {path}")

        samples, sample_rate = sf.read(str(path), dtype="float32")
        if samples.ndim > 1:
            samples = samples.mean(axis=1)
        duration = float(len(samples) / max(1, sample_rate))

        clean_requested = self.normalizer.normalize(requested_text)
        heard = self.normalizer.normalize(transcript or self.transcribe(path))

        requested_chars = len(clean_requested.replace(" ", ""))
        transcript_chars = len(heard.replace(" ", ""))
        coverage = (
            round(min(1.2, transcript_chars / requested_chars), 3)
            if requested_chars
            else 0.0
        )
        chars_per_sec = round(requested_chars / duration, 2) if duration > 0 else 0.0

        word_error = round(compute_wer(clean_requested, heard), 4) if heard else 1.0
        char_error = round(cer(clean_requested, heard), 4) if heard else 1.0

        issues: List[VerificationIssue] = []

        # ۱. پوشش جمله‌به‌جمله برای یافتن دقیق بخش‌های خوانده‌نشده
        sentences = [
            s.strip()
            for s in self.normalizer.split_for_styletts2(requested_text)
            if s.strip()
        ]
        coverage_by_sentence: List[float] = []
        missing: List[str] = []
        for sentence in sentences:
            ratio = difflib.SequenceMatcher(None, sentence, heard).ratio()
            best = 0.0
            window = max(10, len(sentence))
            for start in range(0, max(1, len(heard) - window + 1), max(8, window // 4)):
                piece = heard[start : start + window + 20]
                best = max(best, difflib.SequenceMatcher(None, sentence, piece).ratio())
            score = round(max(ratio, best), 3)
            coverage_by_sentence.append(score)
            if score < 0.45:
                missing.append(sentence)
                issues.append(
                    VerificationIssue(
                        kind="missing_text",
                        severity="critical",
                        detail="این جمله در خروجی صوتی خوانده نشده است.",
                        expected=sentence,
                    )
                )

        # ۲. بررسی کشیدگی یا تکرار ناخواسته در ماتریس دیرش StyleTTS 2
        if heard:
            words = heard.split()
            if len(words) >= 6:
                repeats = sum(
                    1 for i in range(3, len(words)) if words[i] == words[i - 3] == words[i - 2]
                )
                if repeats >= 2:
                    issues.append(
                        VerificationIssue(
                            kind="repeated_text",
                            severity="warning",
                            detail=f"{repeats} مورد تکرار پشت‌سرهم در گفتار تشخیص داده شد.",
                        )
                    )

        # ۳. سرعت خوانش نامتناسب با طول متن
        if chars_per_sec and not (
            FA_CHARS_PER_SEC_MIN <= chars_per_sec <= FA_CHARS_PER_SEC_MAX
        ):
            issues.append(
                VerificationIssue(
                    kind="wrong_speed",
                    severity="critical" if chars_per_sec < 4 else "warning",
                    detail=(
                        f"نرخ خوانش {chars_per_sec} کاراکتر/ثانیه خارج از بازه طبیعی "
                        f"({FA_CHARS_PER_SEC_MIN}-{FA_CHARS_PER_SEC_MAX}) است."
                    ),
                    expected=f"~{FA_NOMINAL_CHARS_PER_SEC} cps",
                    heard=f"{chars_per_sec} cps",
                )
            )

        # ۴. سکوت یا فایل ناقص
        peak = float(np.max(np.abs(samples))) if len(samples) else 0.0
        if duration < 1.0 or peak < 0.01:
            issues.append(
                VerificationIssue(
                    kind="silence",
                    severity="critical",
                    detail=f"فایل صوتی معتبر نیست (مدت {duration:.2f}s، پیک {peak:.3f}).",
                )
            )

        if not heard:
            issues.append(
                VerificationIssue(
                    kind="unreadable",
                    severity="critical",
                    detail="هیچ گفتاری در خروجی تشخیص داده نشد؛ متن خوانده نشده است.",
                )
            )

        passed = (
            word_error <= self.max_wer
            and coverage >= 0.9
            and not any(i.severity == "critical" for i in issues)
        )

        report = TextVerificationReport(
            audio_path=str(path),
            requested_text=clean_requested,
            transcript=heard,
            wer=word_error,
            char_error_rate=char_error,
            duration_sec=round(duration, 2),
            requested_chars=requested_chars,
            transcript_chars=transcript_chars,
            coverage_ratio=coverage,
            chars_per_sec=chars_per_sec,
            coverage_by_sentence=coverage_by_sentence,
            missing_sentences=missing,
            issues=issues,
            passed=passed,
        )
        logger.info(
            f"راستی‌آزمایی متن {path.name}: WER={word_error:.2%} پوشش={coverage:.0%} "
            f"{'قبول' if passed else 'رد'}"
        )
        return report


def estimate_expected_duration(text: str, speed: float = 1.0) -> float:
    """برآورد مدت انتظار برای مقایسه سریع با خروجی (بدون نیاز به ASR)."""
    chars = len(PersianTextProcessor().normalize(text).replace(" ", ""))
    return round(max(0.5, chars / (FA_NOMINAL_CHARS_PER_SEC * max(0.6, speed))), 2)


def quick_duration_check(
    audio_path: Union[str, Path],
    requested_text: str,
    speed: float = 1.0,
    tolerance: float = 0.35,
) -> dict:
    """
    بررسی سبک و بدون ASR: آیا مدت فایل با طول متن درخواستی هم‌خوانی دارد؟
    این تست در صف پردازش برای هر مقاله اجرا می‌شود تا بریدگی متن سریعاً کشف گردد.
    """
    path = Path(audio_path)
    samples, sample_rate = sf.read(str(path), dtype="float32")
    if samples.ndim > 1:
        samples = samples.mean(axis=1)
    duration = float(len(samples) / max(1, sample_rate))
    expected = estimate_expected_duration(requested_text, speed)
    ratio = duration / expected if expected else 0.0
    return {
        "duration_sec": round(duration, 2),
        "expected_sec": expected,
        "ratio": round(ratio, 3),
        "passed": bool(abs(ratio - 1.0) <= tolerance),
        "hint": (
            "متن احتمالاً کامل خوانده نشده است"
            if ratio < 1 - tolerance
            else "خروجی کشیده یا دارای سکوت اضافی است"
            if ratio > 1 + tolerance
            else "متناسب با طول متن"
        ),
    }
