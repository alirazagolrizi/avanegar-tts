"""
موتور مرکزی تبدیل متن به گفتار عصبی دوزبانه بر پایه StyleTTS 2 (اجرای ۱۰۰٪ لوکال).

چرا StyleTTS 2 به عنوان موتور مرکزی انتخاب شده است؟
۱. کیفیت صوتی هم‌تراز و فراتر از انسان (Human-Level TTS) به لطف ترکیب انتشار استایل
   (Style Diffusion — EDM/KDiffusion) و آموزش خصمانه با مدل زبانی گفتار (WavLM SLM).
۲. کلونینگ صفر شات دقیق با استخراج بردار استایل ۲۵۶ بعدی ref_s = [s_acoustic(128), s_prosodic(128)]
   و کنترل مستقل شباهت طنین (alpha) و تنوع لحن/آهنگ جمله (beta).
۳. خوانش دوزبانه بومی (FA + EN Code-Switching) بدون تبدیل انگلیسی به فارسی:
   به دلیل معماری واج‌محور (IPA + PL-BERT)، کلمات و حروف انگلیسی با IPA اصیل en-us و
   متن و اعداد فارسی با IPA دقیق fa در یک دنباله پیوسته با صدای یکسان گوینده خوانده می‌شوند.
۴. سرعت فوق‌العاده بالا (~۱۲ برابر سریع‌تر از زمان واقعی؛ RTF ~ 0.08x) به دلیل معماری
   غیرخودهمبسته (Non-Autoregressive) و دیکودر سبک iSTFTNet در نرخ ۲۴ کیلوهرتز.
۵. پیوستگی لحن در مقالات بلند (LFinference) با ترکیب محدب بردار استایل جمله قبل (s_prev).
"""
from __future__ import annotations

import hashlib
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

import librosa
import munch
import numpy as np
import pyloudnorm as pyln
import soundfile as sf
import torch
import torchaudio
import yaml
from loguru import logger

from app.config import Settings, get_settings
from app.core.ipa_phonemizer import BilingualIPAPhonemizer
from app.core.persian_normalizer import PersianTextProcessor


@dataclass
class SynthesisResult:
    """خروجی استاندارد تولید فایل صوتی مقاله توسط موتور StyleTTS 2."""

    output_path: Path
    duration_sec: float
    sample_rate: int
    chunk_count: int
    inference_time_sec: float
    real_time_factor: float
    alpha: float
    beta: float
    diffusion_steps: int
    embedding_scale: float
    waveform_peaks: List[float]
    normalized_text: str
    ipa_preview: str


def recursive_munch(obj: Any) -> Any:
    if isinstance(obj, dict):
        return munch.Munch((k, recursive_munch(v)) for k, v in obj.items())
    if isinstance(obj, list):
        return [recursive_munch(item) for item in obj]
    return obj


def length_to_mask(lengths: torch.Tensor) -> torch.Tensor:
    mask = (
        torch.arange(int(lengths.max()), device=lengths.device)
        .unsqueeze(0)
        .expand(lengths.shape[0], -1)
    )
    return torch.gt(mask + 1, lengths.unsqueeze(1))


class PersianStyleTTS2Engine:
    """
    کلاس اصلی مدیریت مدل StyleTTS 2، استخراج بردار استایل مرجع (Zero-Shot ref_s)،
    انتشار استایل (Style Diffusion) و سنتز دوزبانه مقالات بلند فارسی-انگلیسی.
    """

    def __init__(self, settings: Optional[Settings] = None) -> None:
        self.settings = settings or get_settings()
        self.device = self._resolve_device(self.settings.device)
        self.text_processor = PersianTextProcessor(
            max_chars_per_chunk=self.settings.max_chars_per_chunk
        )
        self.phonemizer = BilingualIPAPhonemizer(
            fa_voice=self.settings.espeak_fa_voice,
            en_voice=self.settings.espeak_en_voice,
        )
        self.model: Optional[Any] = None
        self.sampler: Optional[Any] = None
        self.config: Optional[Dict[str, Any]] = None
        self.model_params: Optional[Any] = None
        self.loaded_checkpoint_id: str = "unloaded"

        # تبدیل اسپکتروگرام مِل ۸۰ کاناله استاندارد StyleTTS 2 (24kHz, hop=300)
        self._to_mel = torchaudio.transforms.MelSpectrogram(
            n_mels=self.settings.n_mels,
            n_fft=self.settings.n_fft,
            win_length=self.settings.win_length,
            hop_length=self.settings.hop_length,
        )
        self._mel_mean = -4.0
        self._mel_std = 4.0

        # کش حافظه برای بردار استایل ۲۵۶ بعدی گویندگان ثابت سایت (ref_s)
        self._style_cache: Dict[str, torch.Tensor] = {}
        self._inference_lock = threading.Lock()
        self._loudness_meter = pyln.Meter(self.settings.output_sample_rate)

    @staticmethod
    def _resolve_device(requested: str) -> str:
        if requested.startswith("cuda") and torch.cuda.is_available():
            return requested
        logger.warning("شتاب‌دهنده CUDA در دسترس نیست؛ استنتاج StyleTTS 2 روی CPU اجرا می‌شود.")
        return "cpu"

    def _preprocess_wave_to_mel(self, wave: np.ndarray) -> torch.Tensor:
        wave_tensor = torch.from_numpy(wave).float()
        mel_tensor = self._to_mel(wave_tensor)
        mel_tensor = (torch.log(1e-5 + mel_tensor.unsqueeze(0)) - self._mel_mean) / self._mel_std
        return mel_tensor

    def load_model(
        self,
        checkpoint_path: Optional[Union[str, Path]] = None,
        config_path: Optional[Union[str, Path]] = None,
    ) -> None:
        """
        بارگذاری ۱۰۰٪ آفلاین شبکه StyleTTS 2 شامل:
        - PL-BERT دوزبانه (واج‌محور)
        - ASR Text Aligner و JDC Pitch Extractor (F0)
        - TextEncoder، ProsodyPredictor، StyleEncoder، iSTFTNet/HiFi-GAN Decoder
        - KDiffusion Style Sampler (انتشار استایل با توزیع Log-Normal)
        """
        from models import build_model, load_ASR_models, load_F0_models  # type: ignore
        from Modules.diffusion.sampler import (  # type: ignore
            ADPM2Sampler,
            DiffusionSampler,
            KarrasSchedule,
        )
        from Utils.PLBERT.util import load_plbert  # type: ignore

        base_dir = Path(self.settings.base_model_dir)
        cfg_file = Path(
            config_path or self.settings.active_config_path or base_dir / "config_ft.yml"
        )
        ckpt_file = Path(
            checkpoint_path
            or self.settings.active_checkpoint_path
            or base_dir / "epoch_2nd_base.pth"
        )

        for required in (cfg_file, ckpt_file):
            if not required.exists():
                raise FileNotFoundError(f"فایل ضروری مدل StyleTTS 2 یافت نشد: {required}")

        logger.info(f"بارگذاری آفلاین موتور StyleTTS 2 از {ckpt_file} روی {self.device}...")
        t0 = time.perf_counter()

        config = yaml.safe_load(cfg_file.read_text(encoding="utf-8"))
        f0_path = config.get("F0_path", str(self.settings.pitch_extractor_path))
        asr_path = config.get("ASR_path", str(self.settings.asr_aligner_path))
        asr_cfg = config.get("ASR_config", str(self.settings.asr_config_path))
        plbert_dir = config.get("PLBERT_dir", str(self.settings.plbert_dir))

        text_aligner = load_ASR_models(asr_path, asr_cfg)
        pitch_extractor = load_F0_models(f0_path)
        plbert = load_plbert(plbert_dir)

        model_params = recursive_munch(config["model_params"])
        model = build_model(model_params, text_aligner, pitch_extractor, plbert)
        for module in model.values():
            module.eval()
            module.to(self.device)

        # بارگذاری وزن‌های آموزش‌دیده / فاین‌تیون‌شده (epoch_2nd_*.pth)
        params_whole = torch.load(str(ckpt_file), map_location="cpu", weights_only=False)
        net_state = params_whole["net"]
        for key in model:
            if key in net_state:
                try:
                    model[key].load_state_dict(net_state[key])
                except RuntimeError:
                    # حذف پیشوند module. در چک‌پوینت‌های آموزش‌دیده با DataParallel/DDP
                    stripped = {k.replace("module.", "", 1): v for k, v in net_state[key].items()}
                    model[key].load_state_dict(stripped, strict=False)

        sampler = DiffusionSampler(
            model.diffusion.diffusion,
            sampler=ADPM2Sampler(),
            sigma_schedule=KarrasSchedule(sigma_min=0.0001, sigma_max=3.0, rho=9.0),
            clamp=False,
        )

        with self._inference_lock:
            self.model = model
            self.sampler = sampler
            self.config = config
            self.model_params = model_params
            self.loaded_checkpoint_id = ckpt_file.parent.name
            self._style_cache.clear()

        elapsed = time.perf_counter() - t0
        logger.success(
            f"موتور مرکزی StyleTTS 2 در {elapsed:.2f}s آماده به کار شد "
            f"(چک‌پوینت: {self.loaded_checkpoint_id} | دیکودر: {model_params.decoder.type})."
        )

    def compute_or_load_style_vector(
        self,
        speaker_wav: Union[str, Path, List[Union[str, Path]]],
        speaker_id: Optional[str] = None,
        force_recompute: bool = False,
    ) -> torch.Tensor:
        """
        استخراج و کش بردار استایل مرجع ۲۵۶ بعدی گوینده برای کلونینگ صفر شات:
            ref_s = concat([s_acoustic (128-D), s_prosodic (128-D)], dim=1)
        در صورت ارائه چند فایل صوتی مرجع، میانگین بردار استایل برای پایداری حداکثری محاسبه می‌شود.
        """
        self._assert_loaded()
        assert self.model is not None

        wav_paths = (
            [Path(p).resolve() for p in speaker_wav]
            if isinstance(speaker_wav, list)
            else [Path(speaker_wav).resolve()]
        )
        for p in wav_paths:
            if not p.exists():
                raise FileNotFoundError(f"فایل صوتی مرجع گوینده یافت نشد: {p}")

        cache_key = speaker_id or hashlib.sha256(
            f"{self.loaded_checkpoint_id}|{'|'.join(str(p) for p in wav_paths)}".encode("utf-8")
        ).hexdigest()[:16]

        if not force_recompute and cache_key in self._style_cache:
            return self._style_cache[cache_key]

        cache_file = self.settings.style_cache_dir / f"{self.loaded_checkpoint_id}_{cache_key}.pt"
        if not force_recompute and cache_file.exists():
            payload = torch.load(cache_file, map_location=self.device, weights_only=True)
            ref_s = payload["ref_s"].to(self.device)
            self._style_cache[cache_key] = ref_s
            return ref_s

        logger.info(f"استخراج بردار استایل ۲۵۶ بعدی StyleTTS 2 (ref_s) برای گوینده '{cache_key}'...")
        style_vectors: List[torch.Tensor] = []

        with torch.inference_mode():
            for wav_path in wav_paths:
                wave, sr = sf.read(str(wav_path), dtype="float32")
                if wave.ndim > 1:
                    wave = wave.mean(axis=1)
                if sr != self.settings.output_sample_rate:
                    wave = librosa.resample(wave, orig_sr=sr, target_sr=self.settings.output_sample_rate)
                audio, _ = librosa.effects.trim(wave, top_db=30)
                mel_tensor = self._preprocess_wave_to_mel(audio).to(self.device)
                s_acoustic = self.model.style_encoder(mel_tensor.unsqueeze(1))
                s_prosodic = self.model.predictor_encoder(mel_tensor.unsqueeze(1))
                style_vectors.append(torch.cat([s_acoustic, s_prosodic], dim=1))

        ref_s = torch.stack(style_vectors, dim=0).mean(dim=0)
        torch.save(
            {
                "ref_s": ref_s.cpu(),
                "style_dim": int(ref_s.shape[-1]),
                "checkpoint": self.loaded_checkpoint_id,
                "source_wavs": [str(p) for p in wav_paths],
            },
            cache_file,
        )
        self._style_cache[cache_key] = ref_s
        return ref_s

    def _lf_inference_chunk(
        self,
        token_ids: List[int],
        ref_s: torch.Tensor,
        s_prev: Optional[torch.Tensor],
        alpha: float,
        beta: float,
        diffusion_steps: int,
        embedding_scale: float,
        speed: float,
        s_prev_weight: float,
    ) -> tuple[np.ndarray, torch.Tensor]:
        """
        استنتاج متن بلند StyleTTS 2 (LFinference) برای یک قطعه واجی دوزبانه (FA + EN IPA)
        با حفظ پیوستگی لحن از جمله قبل (s_prev) و کنترل دقیق سرعت روی ماتریس دیرش واج‌ها.
        """
        assert self.model is not None and self.sampler is not None

        tokens = torch.LongTensor(token_ids).to(self.device).unsqueeze(0)
        input_lengths = torch.LongTensor([tokens.shape[-1]]).to(self.device)
        text_mask = length_to_mask(input_lengths).to(self.device)

        t_en = self.model.text_encoder(tokens, input_lengths, text_mask)
        bert_dur = self.model.bert(tokens, attention_mask=(~text_mask).int())
        d_en = self.model.bert_encoder(bert_dur).transpose(-1, -2)

        # ۱. نمونه‌برداری بردار استایل تطبیقی متناسب با مفهوم و احساس جمله با Style Diffusion
        noise = torch.randn((1, 256), device=self.device).unsqueeze(1)
        s_pred = self.sampler(
            noise=noise,
            embedding=bert_dur,
            embedding_scale=embedding_scale,
            features=ref_s,
            num_steps=diffusion_steps,
        ).squeeze(1)

        # پیوستگی طبیعی لحن بین جملات متوالی مقاله (جلوگیری از پرش ناگهانی تن صدا)
        if s_prev is not None:
            s_pred = s_prev_weight * s_prev + (1.0 - s_prev_weight) * s_pred

        # ۲. ترکیب مستقل طنین آکوستیک (alpha) و پروزودی/آهنگ جمله (beta) با صدای مرجع
        s_prosodic = s_pred[:, 128:]
        s_acoustic = s_pred[:, :128]
        ref_acoustic = alpha * s_acoustic + (1.0 - alpha) * ref_s[:, :128]
        s_prosodic = beta * s_prosodic + (1.0 - beta) * ref_s[:, 128:]
        s_next = torch.cat([ref_acoustic, s_prosodic], dim=-1)

        # ۳. پیش‌بینی دیرش هر واج (Duration)، منحنی فرکانس پایه (F0) و انرژی با اعمال ضریب speed
        d = self.model.predictor.text_encoder(d_en, s_prosodic, input_lengths, text_mask)
        x, _ = self.model.predictor.lstm(d)
        duration_logits = self.model.predictor.duration_proj(x)
        duration = torch.sigmoid(duration_logits).sum(axis=-1) / max(0.5, float(speed))
        pred_dur = torch.round(duration.squeeze()).clamp(min=1)

        pred_aln_trg = torch.zeros((int(input_lengths.item()), int(pred_dur.sum().data)), device=self.device)
        c_frame = 0
        for i in range(pred_aln_trg.size(0)):
            dur_i = int(pred_dur[i].data)
            pred_aln_trg[i, c_frame : c_frame + dur_i] = 1.0
            c_frame += dur_i

        en = d.transpose(-1, -2) @ pred_aln_trg.unsqueeze(0)
        if self.model_params and self.model_params.decoder.type == "hifigan":
            asr_new = torch.zeros_like(en)
            asr_new[:, :, 0] = en[:, :, 0]
            asr_new[:, :, 1:] = en[:, :, 0:-1]
            en = asr_new

        f0_pred, n_pred = self.model.predictor.F0Ntrain(en, s_prosodic)

        asr = t_en @ pred_aln_trg.unsqueeze(0)
        if self.model_params and self.model_params.decoder.type == "hifigan":
            asr_new = torch.zeros_like(asr)
            asr_new[:, :, 0] = asr[:, :, 0]
            asr_new[:, :, 1:] = asr[:, :, 0:-1]
            asr = asr_new

        # ۴. بازسازی موج صوتی ۲۴ کیلوهرتز انسانی توسط دیکودر iSTFTNet / HiFi-GAN
        wav_tensor = self.model.decoder(asr, f0_pred, n_pred, ref_acoustic.squeeze().unsqueeze(0))
        wav_np = wav_tensor.squeeze().cpu().numpy().astype(np.float32)
        # حذف ۵۰ نمونه انتهایی برای جلوگیری از پالس مرزی iSTFT
        if len(wav_np) > 100:
            wav_np = wav_np[:-50]
        return wav_np, s_next

    def synthesize_article(
        self,
        text: str,
        speaker_wav: Union[str, Path, List[Union[str, Path]]],
        output_path: Union[str, Path],
        speaker_id: Optional[str] = None,
        speed: float = 1.0,
        alpha: Optional[float] = None,
        beta: Optional[float] = None,
        diffusion_steps: Optional[int] = None,
        embedding_scale: Optional[float] = None,
        s_prev_weight: Optional[float] = None,
    ) -> SynthesisResult:
        """
        تولید خروجی صوتی باکیفیت انسانی از متن کامل مقاله دوزبانه (فارسی + اعداد + انگلیسی بومی).
        - اعداد فارسی با دقت کامل به حروف فارسی تبدیل و واج‌نگاری می‌شوند.
        - حروف و واژه‌های انگلیسی بدون تبدیل به فارسی با واج‌های اصیل en-us خوانده می‌شوند.
        """
        self._assert_loaded()

        if not 0.6 <= speed <= 1.8:
            raise ValueError("پارامتر سرعت (speed) باید بین 0.6 و 1.8 باشد.")

        eff_alpha = float(self.settings.alpha if alpha is None else max(0.0, min(1.0, alpha)))
        eff_beta = float(self.settings.beta if beta is None else max(0.0, min(1.0, beta)))
        eff_steps = int(
            self.settings.diffusion_steps
            if diffusion_steps is None
            else max(3, min(25, diffusion_steps))
        )
        eff_scale = float(
            self.settings.embedding_scale
            if embedding_scale is None
            else max(0.8, min(2.5, embedding_scale))
        )
        eff_sprev = float(
            self.settings.s_prev_weight
            if s_prev_weight is None
            else max(0.0, min(0.95, s_prev_weight))
        )

        chunks = self.text_processor.split_for_styletts2(text)
        if not chunks:
            raise ValueError("متن ورودی پس از نرمال‌سازی خالی است.")

        t0 = time.perf_counter()
        audio_segments: List[np.ndarray] = []
        ipa_samples: List[str] = []
        s_prev: Optional[torch.Tensor] = None

        with self._inference_lock, torch.inference_mode():
            ref_s = self.compute_or_load_style_vector(
                speaker_wav=speaker_wav,
                speaker_id=speaker_id,
            )

            for idx, chunk in enumerate(chunks, start=1):
                phon = self.phonemizer.phonemize_bilingual(chunk)
                if idx <= 2:
                    ipa_samples.append(phon["ipa"])
                logger.debug(
                    f"StyleTTS 2 قطعه {idx}/{len(chunks)} | توکن IPA: {phon['token_count']} | "
                    f"alpha={eff_alpha}, beta={eff_beta}, steps={eff_steps}"
                )
                wav_np, s_prev = self._lf_inference_chunk(
                    token_ids=phon["token_ids"],
                    ref_s=ref_s,
                    s_prev=s_prev,
                    alpha=eff_alpha,
                    beta=eff_beta,
                    diffusion_steps=eff_steps,
                    embedding_scale=eff_scale,
                    speed=speed,
                    s_prev_weight=eff_sprev,
                )
                audio_segments.append(self._trim_edge_artifacts(wav_np))

        master_wav = self._stitch_segments(audio_segments)
        master_wav = self._normalize_loudness(master_wav, self.settings.target_lufs)

        # نوشتن اتمیک روی دیسک تا فایل سالم قبلی هرگز در صورت خطا مخدوش نشود
        out_file = Path(output_path)
        out_file.parent.mkdir(parents=True, exist_ok=True)
        tmp_file = out_file.with_suffix(".tmp.wav")
        sf.write(str(tmp_file), master_wav, self.settings.output_sample_rate, subtype="PCM_16")
        tmp_file.replace(out_file)

        inference_sec = time.perf_counter() - t0
        duration_sec = float(len(master_wav) / self.settings.output_sample_rate)
        rtf = inference_sec / max(duration_sec, 1e-3)

        logger.success(
            f"خروجی StyleTTS 2 ذخیره شد: {out_file.name} | مدت: {duration_sec:.1f}s | RTF: {rtf:.3f}x"
        )

        return SynthesisResult(
            output_path=out_file,
            duration_sec=round(duration_sec, 2),
            sample_rate=self.settings.output_sample_rate,
            chunk_count=len(chunks),
            inference_time_sec=round(inference_sec, 2),
            real_time_factor=round(rtf, 3),
            alpha=eff_alpha,
            beta=eff_beta,
            diffusion_steps=eff_steps,
            embedding_scale=eff_scale,
            waveform_peaks=self._compute_waveform_peaks(master_wav, bins=64),
            normalized_text=" ".join(chunks),
            ipa_preview=" | ".join(ipa_samples)[:320],
        )

    def _stitch_segments(self, segments: List[np.ndarray]) -> np.ndarray:
        sr = self.settings.output_sample_rate
        fade_samples = int(sr * self.settings.chunk_crossfade_ms / 1000)
        pause = np.zeros(int(sr * self.settings.sentence_pause_ms / 1000), dtype=np.float32)

        processed: List[np.ndarray] = []
        for idx, seg in enumerate(segments):
            if len(seg) > fade_samples * 2 and fade_samples > 0:
                fade_in = 0.5 * (1.0 - np.cos(np.linspace(0, np.pi, fade_samples, dtype=np.float32)))
                seg = seg.copy()
                seg[:fade_samples] *= fade_in
                seg[-fade_samples:] *= fade_in[::-1]
            processed.append(seg)
            if idx < len(segments) - 1:
                processed.append(pause)

        return np.concatenate(processed) if processed else np.zeros(sr, dtype=np.float32)

    def _normalize_loudness(self, wav: np.ndarray, target_lufs: float) -> np.ndarray:
        if np.max(np.abs(wav)) < 1e-5:
            return wav
        try:
            current_lufs = self._loudness_meter.integrated_loudness(wav)
            if np.isfinite(current_lufs):
                wav = pyln.normalize.loudness(wav, current_lufs, target_lufs)
        except ValueError:
            pass
        peak = float(np.max(np.abs(wav)))
        if peak > 0.98:
            wav = wav * (0.98 / peak)
        return wav.astype(np.float32)

    @staticmethod
    def _trim_edge_artifacts(wav: np.ndarray, threshold: float = 0.004) -> np.ndarray:
        non_silent = np.where(np.abs(wav) > threshold)[0]
        if len(non_silent) == 0:
            return wav
        start = max(0, int(non_silent[0]) - 360)
        end = min(len(wav), int(non_silent[-1]) + 720)
        return wav[start:end]

    @staticmethod
    def _compute_waveform_peaks(wav: np.ndarray, bins: int = 64) -> List[float]:
        if len(wav) < bins:
            return [0.2] * bins
        chunks = np.array_split(np.abs(wav), bins)
        rms = np.array([float(np.sqrt(np.mean(c**2))) for c in chunks], dtype=np.float32)
        max_val = float(np.max(rms)) or 1.0
        return [round(max(0.08, min(1.0, float(v / max_val))), 3) for v in rms]

    def _assert_loaded(self) -> None:
        if self.model is None or self.sampler is None:
            raise RuntimeError("مدل StyleTTS 2 هنوز بارگذاری نشده است؛ ابتدا load_model() را فراخوانی کنید.")
