"""
پیش‌پردازش، تقطیع فایل‌های صوتی طولانی دوبلور (۲۴ کیلوهرتز مونو) و ساخت مجموعه‌داده رسمی
StyleTTS 2 (train_list.txt، val_list.txt و OOD_texts.txt) با واج‌نگاری دوزبانه IPA (FA + EN).

فرمت رسمی هر خط در train_list.txt و val_list.txt در StyleTTS 2:
    wavs/seg_00001.wav|<دنباله واجی IPA فارسی و انگلیسی بومی>|<شناسه عددی گوینده>

همچنین فایل OOD_texts.txt شامل جملات خارج از توزیع (مقالات دوزبانه فناوری شامل اعداد و
کلمات انگلیسی) برای پایدارسازی آموزش خصمانه WavLM SLM به‌صورت خودکار تولید می‌شود.
"""
from __future__ import annotations

import json
import random
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import List, Optional, Tuple

import numpy as np
import soundfile as sf
from jiwer import wer as compute_wer
from loguru import logger
from pydub import AudioSegment, effects
from pydub.silence import detect_nonsilent
from scipy.signal import butter, sosfilt

from app.core.ipa_phonemizer import BilingualIPAPhonemizer
from app.core.persian_normalizer import PersianTextProcessor

DEFAULT_OOD_CORPUS = [
    "نسل جدید شتاب‌دهنده‌های NVIDIA RTX 5090 با معماری Blackwell و حافظه 32GB VRAM معرفی شد.",
    "در بررسی مدل C با موتور StyleTTS 2، ضریب خطا به 0.008 و کاهش مصرف به ٪۴۲٫۵ رسید.",
    "گوشی Galaxy A57 و iPhone 17 Pro با نمایشگر LTPO OLED 120Hz، پورت USB-C و Wi-Fi 7 عرضه شدند.",
    "درایوهای NVMe با رابط PCIe 5.0 و قیمت $1,299 سرعت بارگذاری مدل‌های PL-BERT و WavLM را دو برابر می‌کنند.",
    "در ساعت ۱۴:۰۵ روز ۲۳ام، گزینه‌های ۱،۲،۳ با بلندی استاندارد -16 LUFS روی سرور داخلی آزمایش شدند.",
]


@dataclass
class DatasetBuildReport:
    """گزارش نهایی کیفیت دیتاست واج‌نگاری‌شده برای فاین‌تیون StyleTTS 2."""

    speaker_name: str
    speaker_index: int
    output_dir: str
    total_segments: int
    train_segments: int
    val_segments: int
    ood_sentences: int
    rejected_segments: int
    total_duration_minutes: float
    sample_rate: int
    phonemizer_backend: str
    best_reference_wav: str


class StyleTTS2DatasetBuilder:
    """آماده‌ساز مجموعه‌داده صوتی ۲۴ کیلوهرتز دوبلور برای فاین‌تیون رسمی StyleTTS 2."""

    def __init__(
        self,
        output_dir: Path,
        speaker_name: str,
        speaker_index: int = 0,
        target_sample_rate: int = 24000,  # نرخ بومی آموزش و استنتاج در StyleTTS 2
        min_duration_sec: float = 1.8,
        max_duration_sec: float = 12.0,
        max_text_chars: int = 230,
        silence_thresh_db: int = -42,
        min_silence_len_ms: int = 400,
        keep_silence_ms: int = 140,
        val_split_ratio: float = 0.10,
        whisper_model_dir: Optional[Path] = None,
    ) -> None:
        self.output_dir = Path(output_dir)
        self.wavs_dir = self.output_dir / "wavs"
        self.speaker_name = speaker_name
        self.speaker_index = int(speaker_index)
        self.target_sample_rate = target_sample_rate
        self.min_duration_sec = min_duration_sec
        self.max_duration_sec = max_duration_sec
        self.max_text_chars = max_text_chars
        self.silence_thresh_db = silence_thresh_db
        self.min_silence_len_ms = min_silence_len_ms
        self.keep_silence_ms = keep_silence_ms
        self.val_split_ratio = val_split_ratio
        self.whisper_model_dir = whisper_model_dir

        self.normalizer = PersianTextProcessor(max_chars_per_chunk=max_text_chars)
        self.phonemizer = BilingualIPAPhonemizer(fa_voice="fa", en_voice="en-us")

        self.wavs_dir.mkdir(parents=True, exist_ok=True)
        # فیلتر بالاگذر ۷۵ هرتز برای حذف نویز بم استودیو
        self._hp_sos = butter(4, 75, btype="highpass", fs=self.target_sample_rate, output="sos")

    def build_from_timestamped_script(
        self,
        audio_path: Path,
        segments_manifest: List[dict],
        ood_sentences: Optional[List[str]] = None,
        verify_with_whisper: bool = False,
        max_allowed_wer: float = 0.15,
    ) -> DatasetBuildReport:
        """
        تقطیع فایل صوتی بلند استودیویی بر اساس مانیفست زمان‌بندی‌شده دوبلور و
        تبدیل دوزبانه هر جمله به دنباله IPA (فارسی fa + انگلیسی بومی en-us).
        """
        logger.info(
            f"آماده‌سازی دیتاست StyleTTS 2 (24kHz IPA) از {audio_path.name} برای '{self.speaker_name}'..."
        )
        audio = self._load_and_standardize_audio(audio_path)
        whisper_model = self._load_offline_whisper() if verify_with_whisper else None

        accepted: List[Tuple[str, str, str, float]] = []
        rejected = 0

        for idx, item in enumerate(segments_manifest, start=1):
            start_ms = max(0, int(float(item["start_sec"]) * 1000) - self.keep_silence_ms)
            end_ms = min(len(audio), int(float(item["end_sec"]) * 1000) + self.keep_silence_ms)
            dur_sec = (end_ms - start_ms) / 1000.0
            norm_text = self.normalizer.normalize(str(item.get("text", "")))

            if not self._is_valid_pair(dur_sec, norm_text):
                rejected += 1
                continue

            phon = self.phonemizer.phonemize_bilingual(norm_text)
            ipa_seq = phon["ipa"]
            if len(ipa_seq) < 6 or phon["token_count"] > 510:
                rejected += 1
                continue

            clip_id = f"seg_{idx:05d}"
            wav_file = self.wavs_dir / f"{clip_id}.wav"
            self._export_clean_wav(audio[start_ms:end_ms], wav_file)

            if whisper_model is not None:
                asr_text = self.normalizer.normalize(self._transcribe_clip(whisper_model, wav_file))
                if compute_wer(norm_text, asr_text) > max_allowed_wer:
                    wav_file.unlink(missing_ok=True)
                    rejected += 1
                    continue

            accepted.append((f"wavs/{clip_id}.wav", ipa_seq, norm_text, dur_sec))

        return self._write_styletts2_lists(accepted, rejected, ood_sentences)

    def build_from_long_recordings(
        self,
        recordings_dir: Path,
        ood_sentences: Optional[List[str]] = None,
    ) -> DatasetBuildReport:
        """
        تقطیع خودکار فایل‌های صوتی طولانی دوبلور بر اساس سکوت (VAD/Silence) و جفت‌سازی
        دوزبانه با مدل لوکال Faster-Whisper Large-v3 (حفظ انگلیسی به انگلیسی + اعداد فارسی).
        """
        whisper_model = self._load_offline_whisper()
        audio_files = sorted(
            p for p in Path(recordings_dir).iterdir() if p.suffix.lower() in {".wav", ".flac", ".mp3"}
        )
        if not audio_files:
            raise FileNotFoundError(f"هیچ فایل صوتی در مسیر {recordings_dir} یافت نشد.")

        accepted: List[Tuple[str, str, str, float]] = []
        rejected = 0
        seg_counter = 0

        for audio_file in audio_files:
            logger.info(f"تقطیع ۲۴ کیلوهرتز فایل استودیویی: {audio_file.name}")
            audio = self._load_and_standardize_audio(audio_file)
            for start_ms, end_ms in self._slice_by_silence(audio):
                dur_sec = (end_ms - start_ms) / 1000.0
                if not (self.min_duration_sec <= dur_sec <= self.max_duration_sec):
                    rejected += 1
                    continue

                seg_counter += 1
                clip_id = f"seg_{seg_counter:05d}"
                wav_file = self.wavs_dir / f"{clip_id}.wav"
                self._export_clean_wav(audio[start_ms:end_ms], wav_file)

                norm_text = self.normalizer.normalize(self._transcribe_clip(whisper_model, wav_file))
                if not self._is_valid_pair(dur_sec, norm_text):
                    wav_file.unlink(missing_ok=True)
                    rejected += 1
                    continue

                phon = self.phonemizer.phonemize_bilingual(norm_text)
                if phon["token_count"] > 510:
                    wav_file.unlink(missing_ok=True)
                    rejected += 1
                    continue

                accepted.append((f"wavs/{clip_id}.wav", phon["ipa"], norm_text, dur_sec))

        return self._write_styletts2_lists(accepted, rejected, ood_sentences)

    def _write_styletts2_lists(
        self,
        rows: List[Tuple[str, str, str, float]],
        rejected: int,
        ood_sentences: Optional[List[str]],
    ) -> DatasetBuildReport:
        if len(rows) < 10:
            raise ValueError(
                f"تعداد قطعات معتبر ({len(rows)}) کافی نیست؛ برای فاین‌تیون StyleTTS 2 حداقل ۳۰ دقیقه صدای تمیز توصیه می‌شود."
            )

        rng = random.Random(42)
        shuffled = list(rows)
        rng.shuffle(shuffled)

        val_count = max(2, int(len(shuffled) * self.val_split_ratio))
        val_rows = shuffled[:val_count]
        train_rows = shuffled[val_count:]

        self._write_pipe_file(self.output_dir / "train_list.txt", train_rows)
        self._write_pipe_file(self.output_dir / "val_list.txt", val_rows)

        # ذخیره متن قابل خواندن برای ممیزی تحریریه
        transcript_lines = [f"{wav}|{txt}|{dur:.2f}s" for wav, _ipa, txt, dur in shuffled]
        (self.output_dir / "transcripts_bilingual.txt").write_text(
            "\n".join(transcript_lines) + "\n", encoding="utf-8"
        )

        # تولید OOD_texts.txt واج‌نگاری‌شده ویژه آموزش خصمانه SLM در StyleTTS 2
        raw_ood = ood_sentences or DEFAULT_OOD_CORPUS
        ood_lines: List[str] = []
        for line in raw_ood:
            norm = self.normalizer.normalize(line)
            ipa = self.phonemizer.phonemize_bilingual(norm)["ipa"]
            if len(ipa) >= 20:
                ood_lines.append(f"{ipa}|ood")
        (self.output_dir / "OOD_texts.txt").write_text(
            "\n".join(ood_lines) + "\n", encoding="utf-8"
        )

        best_ref = min(rows, key=lambda r: abs(r[3] - 8.5))
        total_min = sum(r[3] for r in rows) / 60.0

        report = DatasetBuildReport(
            speaker_name=self.speaker_name,
            speaker_index=self.speaker_index,
            output_dir=str(self.output_dir.resolve()),
            total_segments=len(rows),
            train_segments=len(train_rows),
            val_segments=len(val_rows),
            ood_sentences=len(ood_lines),
            rejected_segments=rejected,
            total_duration_minutes=round(total_min, 2),
            sample_rate=self.target_sample_rate,
            phonemizer_backend="espeak-ng" if self.phonemizer.using_espeak else "builtin-ipa-table",
            best_reference_wav=str((self.output_dir / best_ref[0]).resolve()),
        )
        (self.output_dir / "dataset_report.json").write_text(
            json.dumps(asdict(report), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        logger.success(
            f"دیتاست StyleTTS 2 آماده شد: train={len(train_rows)} | val={len(val_rows)} | "
            f"OOD={len(ood_lines)} | مدت={total_min:.1f} دقیقه (24kHz IPA)"
        )
        return report

    def _write_pipe_file(self, path: Path, rows: List[Tuple[str, str, str, float]]) -> None:
        lines = [f"{rel_wav}|{ipa}|{self.speaker_index}" for rel_wav, ipa, _txt, _dur in rows]
        path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    def _slice_by_silence(self, audio: AudioSegment) -> List[Tuple[int, int]]:
        raw_ranges = detect_nonsilent(
            audio,
            min_silence_len=self.min_silence_len_ms,
            silence_thresh=self.silence_thresh_db,
            seek_step=10,
        )
        merged: List[Tuple[int, int]] = []
        max_ms = int(self.max_duration_sec * 1000)
        min_ms = int(self.min_duration_sec * 1000)

        for start, end in raw_ranges:
            s = max(0, start - self.keep_silence_ms)
            e = min(len(audio), end + self.keep_silence_ms)
            if merged and (e - merged[-1][0]) <= max_ms and (merged[-1][1] - merged[-1][0]) < min_ms:
                merged[-1] = (merged[-1][0], e)
            elif (e - s) > max_ms:
                sub_ranges = detect_nonsilent(
                    audio[s:e],
                    min_silence_len=220,
                    silence_thresh=self.silence_thresh_db + 6,
                )
                for sub_s, sub_e in sub_ranges:
                    merged.append((s + sub_s, s + sub_e))
            else:
                merged.append((s, e))
        return merged

    def _load_and_standardize_audio(self, path: Path) -> AudioSegment:
        audio = AudioSegment.from_file(str(path))
        audio = audio.set_channels(1).set_frame_rate(self.target_sample_rate).set_sample_width(2)
        return effects.normalize(audio, headroom=1.5)

    def _export_clean_wav(self, segment: AudioSegment, out_path: Path) -> None:
        samples = np.array(segment.get_array_of_samples(), dtype=np.float32) / 32768.0
        filtered = sosfilt(self._hp_sos, samples)
        peak = float(np.max(np.abs(filtered)))
        if peak > 0.95:
            filtered = filtered * (0.95 / peak)
        sf.write(str(out_path), filtered, self.target_sample_rate, subtype="PCM_16")

    def _is_valid_pair(self, duration_sec: float, text: str) -> bool:
        if not (self.min_duration_sec <= duration_sec <= self.max_duration_sec):
            return False
        if len(text) < 6 or len(text) > self.max_text_chars:
            return False
        cps = len(text) / duration_sec
        return 4.0 <= cps <= 26.0

    def _load_offline_whisper(self):
        from faster_whisper import WhisperModel  # type: ignore

        if not self.whisper_model_dir or not self.whisper_model_dir.exists():
            raise FileNotFoundError(
                f"مسیر محلی مدل Faster-Whisper یافت نشد: {self.whisper_model_dir}"
            )
        return WhisperModel(
            str(self.whisper_model_dir),
            device="cuda",
            compute_type="float16",
            local_files_only=True,
        )

    @staticmethod
    def _transcribe_clip(whisper_model, wav_path: Path) -> str:
        segments, _ = whisper_model.transcribe(str(wav_path), language="fa", beam_size=5)
        return " ".join(seg.text.strip() for seg in segments).strip()
