"""
مدیریت صف پردازش ناهمگام (Celery + Redis) برای سنتز مقالات دوزبانه و فاین‌تیون StyleTTS 2 روی GPU.

موتور StyleTTS 2 (شامل PL-BERT، Style Diffusion و دیکودر iSTFTNet) تنها یک‌بار هنگام
راه‌اندازی کارگر در VRAM بارگذاری می‌شود تا مقالات تحریریه با سرعت ~12x زمان واقعی
(RTF ~ 0.08x) و با راستی‌آزمایی خودکار صحت خوانش تولید و ذخیره شوند.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

import httpx
from celery import Celery
from celery.signals import worker_process_init
from loguru import logger

from app.config import get_settings
from app.core.audio_verifier import SpokenTextVerifier, quick_duration_check
from app.core.styletts2_engine import PersianStyleTTS2Engine
from app.finetune.train_styletts2 import StyleTTS2FineTuneConfig, train_persian_speaker

settings = get_settings()

celery_app = Celery(
    "avanegar_styletts2_worker",
    broker=settings.redis_url,
    backend=settings.redis_url,
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_track_started=True,
    worker_prefetch_multiplier=1,
    task_acks_late=True,
    task_routes={
        "tts.synthesize_article": {"queue": "synthesis"},
        "tts.run_finetune": {"queue": "finetune"},
    },
)

_gpu_engine: Optional[PersianStyleTTS2Engine] = None


@worker_process_init.connect
def init_gpu_model(**_: Any) -> None:
    """بارگذاری یک‌باره موتور مرکزی StyleTTS 2 در VRAM هنگام شروع پردازش کارگر."""
    global _gpu_engine
    _gpu_engine = PersianStyleTTS2Engine(settings=settings)
    _gpu_engine.load_model()


def _get_engine() -> PersianStyleTTS2Engine:
    global _gpu_engine
    if _gpu_engine is None:
        _gpu_engine = PersianStyleTTS2Engine(settings=settings)
        _gpu_engine.load_model()
    return _gpu_engine


@celery_app.task(bind=True, name="tts.synthesize_article", max_retries=2)
def synthesize_article_task(self, payload: Dict[str, Any]) -> Dict[str, Any]:
    """تولید فایل صوتی دوزبانه مقاله با StyleTTS 2، راستی‌آزمایی متن و به‌روزرسانی مانیفست ویجت."""
    engine = _get_engine()
    article_slug: str = payload["article_slug"]
    article_title: str = payload.get("article_title", article_slug)
    speaker_id: str = payload["speaker_id"]
    speaker_label: str = payload.get("speaker_label", speaker_id)
    speaker_wav = settings.speakers_dir / f"{speaker_id}.wav"

    article_dir = settings.audio_output_dir / article_slug
    article_dir.mkdir(parents=True, exist_ok=True)
    wav_filename = f"{speaker_id}.wav"
    output_wav = article_dir / wav_filename

    speed = float(payload.get("speed", 1.0))
    alpha = float(payload.get("alpha", settings.alpha))
    beta = float(payload.get("beta", settings.beta))
    diffusion_steps = int(payload.get("diffusion_steps", settings.diffusion_steps))
    embedding_scale = float(payload.get("embedding_scale", settings.embedding_scale))

    self.update_state(
        state="PROCESSING",
        meta={"article_slug": article_slug, "speaker_id": speaker_id, "engine": "StyleTTS 2"},
    )

    result = engine.synthesize_article(
        text=payload["text"],
        speaker_wav=speaker_wav,
        output_path=output_wav,
        speaker_id=speaker_id,
        speed=speed,
        alpha=alpha,
        beta=beta,
        diffusion_steps=diffusion_steps,
        embedding_scale=embedding_scale,
    )

    # راستی‌آزمایی خودکار صحت خوانش متن درخواستی
    verification = quick_duration_check(result.output_path, payload["text"], speed)
    if not verification["passed"]:
        logger.warning(
            f"هشدار تناسب مدت برای {article_slug} (ratio={verification['ratio']}) — بازتولید با گام انتشار بیشتر..."
        )
        result = engine.synthesize_article(
            text=payload["text"],
            speaker_wav=speaker_wav,
            output_path=output_wav,
            speaker_id=speaker_id,
            speed=speed,
            alpha=max(0.15, alpha - 0.05),
            beta=beta,
            diffusion_steps=min(15, diffusion_steps + 3),
            embedding_scale=embedding_scale,
        )
        verification = quick_duration_check(result.output_path, payload["text"], speed)

    deep_report = None
    if payload.get("verify_with_asr", False) and settings.whisper_local_model_dir.exists():
        verifier = SpokenTextVerifier(
            whisper_model_dir=settings.whisper_local_model_dir,
            device=settings.device,
            compute_type="float16" if settings.use_fp16 else "int8",
        )
        deep_report = verifier.verify(result.output_path, payload["text"]).to_dict()

    audio_url = f"{settings.public_audio_base_url.rstrip('/')}/{article_slug}/{wav_filename}"
    track_entry = {
        "speaker_id": speaker_id,
        "speaker_label": speaker_label,
        "engine": "styletts2-bilingual-24khz",
        "audio_url": audio_url,
        "duration_sec": result.duration_sec,
        "sample_rate": result.sample_rate,
        "chunk_count": result.chunk_count,
        "rtf": result.real_time_factor,
        "alpha": result.alpha,
        "beta": result.beta,
        "diffusion_steps": result.diffusion_steps,
        "embedding_scale": result.embedding_scale,
        "waveform_peaks": result.waveform_peaks,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "text_verification": {
            "quick_check": verification,
            "deep_check": deep_report,
            "passed": bool(verification["passed"] and (deep_report is None or deep_report["passed"])),
        },
    }

    manifest_path = article_dir / "manifest.json"
    manifest: Dict[str, Any] = {
        "article_slug": article_slug,
        "article_title": article_title,
        "engine": "StyleTTS 2",
        "voices": [],
    }
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    voices = [v for v in manifest.get("voices", []) if v["speaker_id"] != speaker_id]
    voices.append(track_entry)
    manifest["article_title"] = article_title
    manifest["voices"] = voices
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    webhook_url = payload.get("webhook_url")
    if webhook_url:
        try:
            status_label = "completed" if track_entry["text_verification"]["passed"] else "degraded"
            httpx.post(webhook_url, json={"status": status_label, **track_entry}, timeout=10.0)
        except httpx.HTTPError as exc:
            logger.warning(f"ارسال وب‌هوک به CMS ناموفق بود: {exc}")

    return track_entry


@celery_app.task(bind=True, name="tts.run_finetune")
def run_finetune_task(self, payload: Dict[str, Any]) -> Dict[str, Any]:
    """اجرای فاین‌تیون اختصاصی StyleTTS 2 (Style Diffusion + WavLM SLM) و بارگذاری گرم چک‌پوینت جدید."""
    job_cfg = StyleTTS2FineTuneConfig(
        run_name=payload["run_name"],
        speaker_name=payload["speaker_name"],
        dataset_dir=Path(payload["dataset_dir"]),
        base_model_dir=settings.base_model_dir,
        config_template_path=Path(payload.get("config_template", "configs/config_ft.yml")),
        output_dir=settings.finetune_output_dir,
        speaker_reference_wav=Path(payload["speaker_reference_wav"]),
        num_epochs=int(payload.get("num_epochs", 30)),
        batch_size=int(payload.get("batch_size", 8)),
        grad_accum_steps=int(payload.get("grad_accum_steps", 4)),
        learning_rate=float(payload.get("learning_rate", 1e-4)),
        alpha=float(payload.get("alpha", 0.28)),
        beta=float(payload.get("beta", 0.72)),
        diffusion_steps=int(payload.get("diffusion_steps", 8)),
        enable_slm_adversarial=bool(payload.get("enable_slm_adversarial", True)),
    )
    checkpoint_dir = train_persian_speaker(job_cfg)

    if payload.get("activate_after_training", False):
        engine = _get_engine()
        engine.load_model(
            checkpoint_path=checkpoint_dir / "epoch_2nd_best.pth",
            config_path=checkpoint_dir / "config_ft.yml",
        )

    return {
        "engine": "StyleTTS 2",
        "run_name": job_cfg.run_name,
        "speaker_name": job_cfg.speaker_name,
        "checkpoint_dir": str(checkpoint_dir),
        "best_model_path": str(checkpoint_dir / "epoch_2nd_best.pth"),
    }
