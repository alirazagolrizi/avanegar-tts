"""
سرویس سبک و پرسرعت API پنل مدیریت و ویجت پخش‌کننده بر پایه موتور مرکزی StyleTTS 2 (FastAPI).

مسیرهای کلیدی:
- POST /api/v1/admin/synthesize        -> ثبت مقاله دوزبانه (فارسی + اعداد + انگلیسی بومی) در صف StyleTTS 2
- POST /api/v1/admin/speakers/clone    -> آپلود صدای مرجع WAV برای استخراج بردار استایل ۲۵۶ بعدی (ref_s)
- POST /api/v1/admin/finetune          -> فاین‌تیون اختصاصی StyleTTS 2 (Style Diffusion + WavLM SLM)
- POST /api/v1/admin/verify            -> راستی‌آزمایی صحت خوانش متن با Faster-Whisper لوکال (WER)
- GET  /api/v1/admin/jobs/{job_id}     -> استعلام وضعیت لحظه‌ای صف GPU
- GET  /api/v1/widget/articles/{slug}  -> دریافت لیست صداهای آماده‌شده مقاله توسط ویجت جاوااسکریپت
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Dict

import soundfile as sf
from celery.result import AsyncResult
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.schemas import (
    FineTuneStartRequest,
    JobQueuedResponse,
    SynthesizeArticleRequest,
    VerifyAudioRequest,
    WidgetArticleManifest,
)
from app.config import Settings, get_settings
from app.core.audio_verifier import (
    SpokenTextVerifier,
    estimate_expected_duration,
    quick_duration_check,
)
from app.workers.celery_worker import celery_app, run_finetune_task, synthesize_article_task

settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    version="3.0.0",
    description=(
        "سرویس ۱۰۰٪ لوکال تبدیل متن به گفتار عصبی دوزبانه (فارسی + انگلیسی بومی) "
        "بر پایه StyleTTS 2 با Style Diffusion و WavLM SLM ویژه ناشران B2B (مانند زومیت)"
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

app.mount(
    "/media/articles",
    StaticFiles(directory=str(settings.audio_output_dir)),
    name="articles_audio",
)


def verify_admin_key(
    x_api_key: str = Header(..., alias="X-API-Key"),
    cfg: Settings = Depends(get_settings),
) -> None:
    if x_api_key != cfg.admin_api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="کلید دسترسی پنل مدیریت نامعتبر است.",
        )


@app.get("/api/v1/health")
def health_check() -> Dict[str, Any]:
    return {
        "status": "ok",
        "engine": "StyleTTS 2 (Style Diffusion + PL-BERT + iSTFTNet)",
        "bilingual_ipa": ["fa", "en-us"],
        "english_preserved": True,
        "offline_mode": True,
        "sample_rate": settings.output_sample_rate,
    }


@app.post(
    "/api/v1/admin/speakers/clone",
    dependencies=[Depends(verify_admin_key)],
    status_code=status.HTTP_201_CREATED,
)
async def register_zero_shot_speaker(
    speaker_id: str = Form(..., description="شناسه لاتین گوینده، مثلاً dorsa_radmehr"),
    display_name: str = Form(..., description="نام فارسی گوینده، مثلاً درسا رادمهر"),
    reference_wav: UploadFile = File(..., description="فایل WAV تمیز ۵ تا ۳۰ ثانیه برای استخراج بردار استایل ref_s"),
) -> Dict[str, Any]:
    """ثبت گوینده جدید از روی صدای مرجع برای استخراج بردار استایل ۲۵۶ بعدی StyleTTS 2."""
    if not re.fullmatch(r"[a-zA-Z0-9_\-]{2,64}", speaker_id):
        raise HTTPException(status_code=400, detail="شناسه گوینده فقط شامل حروف لاتین، عدد و _ است.")

    dest_wav = settings.speakers_dir / f"{speaker_id}.wav"
    dest_wav.write_bytes(await reference_wav.read())

    try:
        info = sf.info(str(dest_wav))
    except RuntimeError as exc:
        dest_wav.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="فایل صوتی معتبر WAV نیست.") from exc

    if not (3.0 <= info.duration <= 65.0):
        dest_wav.unlink(missing_ok=True)
        raise HTTPException(
            status_code=400,
            detail=f"مدت فایل مرجع ({info.duration:.1f} ثانیه) باید بین ۳ تا ۶۵ ثانیه باشد.",
        )

    meta = {
        "speaker_id": speaker_id,
        "display_name": display_name,
        "engine": "StyleTTS 2",
        "style_vector_dim": 256,
        "duration_sec": round(info.duration, 2),
        "sample_rate": info.samplerate,
        "reference_path": str(dest_wav),
    }
    (settings.speakers_dir / f"{speaker_id}.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return meta


@app.get("/api/v1/admin/speakers", dependencies=[Depends(verify_admin_key)])
def list_speakers() -> Dict[str, Any]:
    speakers = [
        json.loads(p.read_text(encoding="utf-8"))
        for p in sorted(settings.speakers_dir.glob("*.json"))
    ]
    return {"engine": "StyleTTS 2", "speakers": speakers}


@app.post(
    "/api/v1/admin/synthesize",
    response_model=JobQueuedResponse,
    dependencies=[Depends(verify_admin_key)],
    status_code=status.HTTP_202_ACCEPTED,
)
def request_article_synthesis(req: SynthesizeArticleRequest) -> JobQueuedResponse:
    """دریافت متن مقاله تأییدشده توسط ادمین سایت و ارسال به صف سنتز دوزبانه StyleTTS 2."""
    speaker_wav = settings.speakers_dir / f"{req.speaker_id}.wav"
    if not speaker_wav.exists():
        raise HTTPException(
            status_code=404,
            detail=f"فایل مرجع گوینده '{req.speaker_id}' روی سرور ثبت نشده است.",
        )

    speaker_label = req.speaker_label or req.speaker_id
    meta_file = settings.speakers_dir / f"{req.speaker_id}.json"
    if req.speaker_label is None and meta_file.exists():
        speaker_label = json.loads(meta_file.read_text(encoding="utf-8")).get(
            "display_name", req.speaker_id
        )

    task = synthesize_article_task.delay({**req.model_dump(), "speaker_label": speaker_label})
    return JobQueuedResponse(
        job_id=task.id,
        status="queued",
        article_slug=req.article_slug,
        message="مقاله با موفقیت در صف پردازش دوزبانه موتور مرکزی StyleTTS 2 قرار گرفت.",
    )


@app.post(
    "/api/v1/admin/finetune",
    response_model=JobQueuedResponse,
    dependencies=[Depends(verify_admin_key)],
    status_code=status.HTTP_202_ACCEPTED,
)
def trigger_speaker_finetune(req: FineTuneStartRequest) -> JobQueuedResponse:
    """آغاز فاین‌تیون اختصاصی StyleTTS 2 (Style Diffusion + WavLM SLM) روی دیتاست دوبلور جدید."""
    dataset_dir = (settings.datasets_dir / req.dataset_subdir).resolve()
    ref_wav = (settings.speakers_dir / f"{req.speaker_reference_id}.wav").resolve()

    if not (dataset_dir / "train_list.txt").exists():
        raise HTTPException(status_code=404, detail="فایل train_list.txt در مسیر دیتاست یافت نشد.")
    if not ref_wav.exists():
        raise HTTPException(status_code=404, detail="فایل صوتی مرجع گوینده یافت نشد.")

    task = run_finetune_task.delay(
        {
            "run_name": req.run_name,
            "speaker_name": req.speaker_name,
            "dataset_dir": str(dataset_dir),
            "speaker_reference_wav": str(ref_wav),
            "num_epochs": req.num_epochs,
            "batch_size": req.batch_size,
            "grad_accum_steps": req.grad_accum_steps,
            "learning_rate": req.learning_rate,
            "alpha": req.alpha,
            "beta": req.beta,
            "diffusion_steps": req.diffusion_steps,
            "enable_slm_adversarial": req.enable_slm_adversarial,
            "activate_after_training": req.activate_after_training,
        }
    )
    return JobQueuedResponse(
        job_id=task.id,
        status="queued",
        message="فرآیند فاین‌تیون اختصاصی StyleTTS 2 (با SLM و Style Diffusion) در صف GPU ثبت شد.",
    )


@app.post("/api/v1/admin/verify", dependencies=[Depends(verify_admin_key)])
def verify_spoken_text(req: VerifyAudioRequest, cfg: Settings = Depends(get_settings)) -> Dict[str, Any]:
    """راستی‌آزمایی صحت خوانش متن، اعداد و اصطلاحات انگلیسی فایل خروجی StyleTTS 2."""
    audio_file = Path(req.audio_path)
    if not audio_file.is_absolute():
        audio_file = (cfg.audio_output_dir / audio_file).resolve()
    if not audio_file.exists():
        raise HTTPException(status_code=404, detail="فایل صوتی یافت نشد.")

    quick = quick_duration_check(audio_file, req.requested_text, req.speed)
    payload: Dict[str, Any] = {
        "engine": "StyleTTS 2",
        "quick_check": quick,
        "expected_duration_sec": estimate_expected_duration(req.requested_text, req.speed),
        "deep_check": None,
    }
    if req.deep_asr_check:
        if not cfg.whisper_local_model_dir.exists():
            raise HTTPException(
                status_code=503,
                detail="مدل لوکال Faster-Whisper برای راستی‌آزمایی عمیق نصب نشده است.",
            )
        verifier = SpokenTextVerifier(
            whisper_model_dir=cfg.whisper_local_model_dir,
            device=cfg.device,
            compute_type="float16" if cfg.use_fp16 else "int8",
        )
        report = verifier.verify(audio_file, req.requested_text)
        payload["deep_check"] = report.to_dict()
        payload["passed"] = report.passed and quick["passed"]
    else:
        payload["passed"] = quick["passed"]
    return payload


@app.get("/api/v1/admin/jobs/{job_id}", dependencies=[Depends(verify_admin_key)])
def get_job_status(job_id: str) -> Dict[str, Any]:
    res = AsyncResult(job_id, app=celery_app)
    response: Dict[str, Any] = {"job_id": job_id, "engine": "StyleTTS 2", "status": res.state.lower()}
    if res.successful():
        response["result"] = res.result
    elif res.failed():
        response["error"] = str(res.result)
    elif isinstance(res.info, dict):
        response["progress"] = res.info
    return response


@app.get("/api/v1/widget/articles/{article_slug}", response_model=WidgetArticleManifest)
def get_article_audio_for_widget(article_slug: str) -> WidgetArticleManifest:
    """اندپوینت عمومی سبک ویژه ویجت جاوااسکریپت روی سایت مشتری (مانند زومیت)."""
    safe_slug = Path(article_slug).name
    manifest_file = settings.audio_output_dir / safe_slug / "manifest.json"
    if not manifest_file.exists():
        raise HTTPException(status_code=404, detail="نسخه صوتی برای این مقاله تولید نشده است.")
    return WidgetArticleManifest(**json.loads(manifest_file.read_text(encoding="utf-8")))
