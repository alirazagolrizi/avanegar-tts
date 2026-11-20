"""
پیکربندی متمرکز موتور پردازش صوت لوکال آوانگار بر پایه StyleTTS 2 (۱۰۰٪ بدون اینترنت).
"""
from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import List, Optional

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# تضمین اجرای ۱۰۰٪ آفلاین پیش از ایمپورت کتابخانه‌های ترنسفورمر و واج‌نگار
os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")


class Settings(BaseSettings):
    """تنظیمات موتور StyleTTS 2، مسیرهای محلی وزن‌ها، انتشار استایل و صف GPU."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "AvaNegar StyleTTS2 On-Premise"
    app_env: str = "production"
    api_host: str = "0.0.0.0"
    api_port: int = 8080
    admin_api_key: str = Field(default="change-me-strong-publisher-secret-key")
    allowed_cors_origins: List[str] = Field(
        default_factory=lambda: ["https://www.zoomit.ir", "http://localhost:3000"]
    )
    public_audio_base_url: str = "http://localhost:8080/media/articles"

    # مسیرهای دیسک محلی مدل پایه StyleTTS 2 و ماژول‌های کمکی آفلاین
    base_model_dir: Path = Path("/srv/avanegar/models/styletts2_fa_en_base")
    active_checkpoint_path: Optional[Path] = None
    active_config_path: Optional[Path] = None
    plbert_dir: Path = Path("/srv/avanegar/models/styletts2_fa_en_base/Utils/PLBERT")
    asr_aligner_path: Path = Path("/srv/avanegar/models/styletts2_fa_en_base/Utils/ASR/epoch_00080.pth")
    asr_config_path: Path = Path("/srv/avanegar/models/styletts2_fa_en_base/Utils/ASR/config.yml")
    pitch_extractor_path: Path = Path("/srv/avanegar/models/styletts2_fa_en_base/Utils/JDC/bst.t7")
    slm_wavlm_dir: Path = Path("/srv/avanegar/models/styletts2_fa_en_base/Utils/wavlm-base-plus")
    whisper_local_model_dir: Path = Path("/srv/avanegar/models/faster-whisper-large-v3")

    # دایرکتوری‌های ذخیره‌سازی محلی سرور مشتری
    speakers_dir: Path = Path("/srv/avanegar/storage/speakers")
    style_cache_dir: Path = Path("/srv/avanegar/storage/style_vectors")
    audio_output_dir: Path = Path("/srv/avanegar/storage/articles_audio")
    datasets_dir: Path = Path("/srv/avanegar/storage/datasets")
    finetune_output_dir: Path = Path("/srv/avanegar/models/checkpoints")

    # پارامترهای استنتاج و انتشار استایل (Style Diffusion) در StyleTTS 2
    device: str = "cuda"
    use_fp16: bool = True
    decoder_type: str = "istftnet"  # "istftnet" (فوق‌سریع) یا "hifigan"
    espeak_fa_voice: str = "fa"
    espeak_en_voice: str = "en-us"
    alpha: float = 0.28            # نسبت ترکیب طنین آکوستیک انتشار (۰ = ۱۰۰٪ صدای مرجع)
    beta: float = 0.72             # نسبت تنوع پروزودی و لحن انتشار (۰.۶۵ تا ۰.۸۰ طبیعی‌ترین)
    diffusion_steps: int = 8       # تعداد گام‌های نمونه‌برداری KDiffusion (۵ تا ۱۵)
    embedding_scale: float = 1.15  # ضریب هدایت بدون طبقه‌بند (CFG) برای رسایی و احساس
    s_prev_weight: float = 0.70    # ضریب پیوستگی لحن بین جملات متوالی در LFinference

    # پارامترهای آکوستیک ۲۴ کیلوهرتز استاندارد StyleTTS 2
    output_sample_rate: int = 24000
    n_fft: int = 2048
    win_length: int = 1200
    hop_length: int = 300
    n_mels: int = 80
    style_dim: int = 128  # 128 acoustic + 128 prosodic = 256-D ref_s
    target_lufs: float = -16.0
    max_chars_per_chunk: int = 220
    chunk_crossfade_ms: int = 35
    sentence_pause_ms: int = 230

    # زیرساخت صف و پایگاه داده
    redis_url: str = "redis://localhost:6379/0"
    database_url: str = "sqlite:///./avanegar_jobs.db"

    def ensure_directories(self) -> None:
        """ایجاد خودکار دایرکتوری‌های ذخیره‌سازی محلی در زمان راه‌اندازی."""
        for directory in (
            self.speakers_dir,
            self.style_cache_dir,
            self.audio_output_dir,
            self.datasets_dir,
            self.finetune_output_dir,
        ):
            directory.mkdir(parents=True, exist_ok=True)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    settings = Settings()
    settings.ensure_directories()
    return settings
