"""مدل‌های اعتبارسنجی درخواست و پاسخ API پنل مدیریت و ویجت پخش‌کننده (موتور StyleTTS 2)."""
from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class SynthesizeArticleRequest(BaseModel):
    article_slug: str = Field(..., min_length=2, max_length=140, pattern=r"^[a-zA-Z0-9\-_]+$")
    article_title: str = Field(..., min_length=2, max_length=300)
    text: str = Field(..., min_length=6, description="متن کامل مقاله (فارسی + اعداد + انگلیسی بومی)")
    speaker_id: str = Field(..., min_length=2, max_length=80, description="شناسه گوینده یا بردار استایل ref_s")
    speaker_label: Optional[str] = Field(default=None, description="نام نمایشی گوینده در ویجت")
    speed: float = Field(default=1.0, ge=0.6, le=1.8, description="ضریب سرعت ماتریس دیرش واج‌ها")
    alpha: float = Field(
        default=0.28,
        ge=0.0,
        le=1.0,
        description="نسبت انتشار طنین آکوستیک (۰ = ۱۰۰٪ صدای مرجع، ۰.۲۸ = طبیعی‌ترین)",
    )
    beta: float = Field(
        default=0.72,
        ge=0.0,
        le=1.0,
        description="نسبت انتشار پروزودی و لحن جمله (۰.۶۵ تا ۰.۸۰ ایده‌آل برای مقالات خبری)",
    )
    diffusion_steps: int = Field(
        default=8,
        ge=3,
        le=25,
        description="تعداد گام‌های نمونه‌برداری Style Diffusion (ADPM2 + Karras)",
    )
    embedding_scale: float = Field(
        default=1.15,
        ge=0.8,
        le=2.5,
        description="ضریب هدایت احساسی PL-BERT (Classifier-Free Guidance)",
    )
    webhook_url: Optional[str] = Field(default=None, description="آدرس بازگشتی اطلاع به CMS ناشر")
    verify_with_asr: bool = Field(
        default=False,
        description="راستی‌آزمایی عمیق خوانش با Faster-Whisper لوکال و محاسبه WER",
    )


class JobQueuedResponse(BaseModel):
    job_id: str
    status: str
    engine: str = "StyleTTS 2"
    article_slug: Optional[str] = None
    message: str


class FineTuneStartRequest(BaseModel):
    run_name: str = Field(..., min_length=3, max_length=80)
    speaker_name: str = Field(..., min_length=2, max_length=80)
    dataset_subdir: str = Field(..., description="پوشه دیتاست ۲۴ کیلوهرتز حاوی train_list.txt و val_list.txt")
    speaker_reference_id: str = Field(..., description="شناسه فایل WAV مرجع گوینده")
    num_epochs: int = Field(default=30, ge=5, le=120)
    batch_size: int = Field(default=8, ge=1, le=32)
    grad_accum_steps: int = Field(default=4, ge=1, le=64)
    learning_rate: float = Field(default=1e-4, gt=0, le=5e-4)
    alpha: float = Field(default=0.28, ge=0.0, le=1.0)
    beta: float = Field(default=0.72, ge=0.0, le=1.0)
    diffusion_steps: int = Field(default=8, ge=3, le=25)
    enable_slm_adversarial: bool = Field(default=True, description="فعال‌سازی WavLM SLM Adversarial Loss")
    activate_after_training: bool = True


class VerifyAudioRequest(BaseModel):
    audio_path: str = Field(..., description="مسیر فایل WAV تولیدشده روی سرور")
    requested_text: str = Field(..., description="متن تأییدشده ادمین سایت")
    speed: float = Field(default=1.0, ge=0.6, le=1.8)
    deep_asr_check: bool = Field(default=False)


class WidgetVoiceTrack(BaseModel):
    speaker_id: str
    speaker_label: str
    audio_url: str
    duration_sec: float
    sample_rate: int
    waveform_peaks: List[float]


class WidgetArticleManifest(BaseModel):
    article_slug: str
    article_title: str
    voices: List[WidgetVoiceTrack]
