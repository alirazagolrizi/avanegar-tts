"""
اسکریپت رسمی فاین‌تیون موتور StyleTTS 2 (train_finetune) روی دیتاست اختصاصی دوبلور
دوزبانه (فارسی + اعداد دقیق + انگلیسی بومی) — کاملاً لوکال و بدون وابستگی به اینترنت.

معماری توابع زیان در فاین‌تیون StyleTTS 2:
  ۱. Multi-Resolution STFT & Mel Reconstruction Loss (بازسازی شفاف ۲۴ کیلوهرتز)
  ۲. Prosody Duration (CE + L1) & Pitch/Energy (F0 + Norm) Reconstruction Loss
  ۳. Style Diffusion Loss (EDM / KDiffusion برای یادگیری طنین و لحن طبیعی دوبلور)
  ۴. Speech Language Model Adversarial Loss (WavLM SLM برای شباهت انسانی بی‌رقیب)

خروجی نهایی:
  - epoch_2nd_best.pth  (وزن‌های به‌روزرسانی‌شده آماده بارگذاری در PersianStyleTTS2Engine)
  - config_ft.yml       (پیکربندی کامل مدل فاین‌تیون‌شده)
  - reference_speaker.wav و training_metrics.json
"""
from __future__ import annotations

import argparse
import copy
import gc
import json
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional

import torch
import torch.nn.functional as F
import yaml
from loguru import logger


@dataclass
class StyleTTS2FineTuneConfig:
    """پارامترهای اجرای فاین‌تیون اختصاصی StyleTTS 2 روی دوبلور جدید."""

    run_name: str
    speaker_name: str
    dataset_dir: Path
    base_model_dir: Path
    config_template_path: Path
    output_dir: Path
    speaker_reference_wav: Path
    num_epochs: int = 30
    batch_size: int = 8
    grad_accum_steps: int = 4
    learning_rate: float = 1e-4
    bert_learning_rate: float = 1e-5
    max_frame_len: int = 400
    diff_start_epoch: int = 5
    joint_slm_epoch: int = 15
    alpha: float = 0.28
    beta: float = 0.72
    diffusion_steps: int = 8
    enable_slm_adversarial: bool = True
    save_freq: int = 5
    use_fp16: bool = True


def _prepare_run_config(cfg: StyleTTS2FineTuneConfig, run_dir: Path) -> Dict:
    """ساخت و ذخیره config_ft.yml اختصاصی دوبلور با مسیرهای ۱۰۰٪ لوکال سرور."""
    raw_cfg = yaml.safe_load(Path(cfg.config_template_path).read_text(encoding="utf-8"))
    base = Path(cfg.base_model_dir).resolve()
    ds = Path(cfg.dataset_dir).resolve()

    raw_cfg["log_dir"] = str(run_dir)
    raw_cfg["epochs"] = int(cfg.num_epochs)
    raw_cfg["batch_size"] = int(cfg.batch_size)
    raw_cfg["grad_accum_steps"] = int(cfg.grad_accum_steps)
    raw_cfg["max_len"] = int(cfg.max_frame_len)
    raw_cfg["save_freq"] = int(cfg.save_freq)
    raw_cfg["pretrained_model"] = str(base / "epoch_2nd_base.pth")
    raw_cfg["F0_path"] = str(base / "Utils" / "JDC" / "bst.t7")
    raw_cfg["ASR_config"] = str(base / "Utils" / "ASR" / "config.yml")
    raw_cfg["ASR_path"] = str(base / "Utils" / "ASR" / "epoch_00080.pth")
    raw_cfg["PLBERT_dir"] = str(base / "Utils" / "PLBERT")

    raw_cfg["data_params"] = {
        "train_data": str(ds / "train_list.txt"),
        "val_data": str(ds / "val_list.txt"),
        "root_path": str(ds),
        "OOD_data": str(ds / "OOD_texts.txt"),
        "min_length": 50,
    }
    raw_cfg["model_params"]["slm"]["model"] = str(base / "Utils" / "wavlm-base-plus")
    raw_cfg["optimizer_params"]["lr"] = float(cfg.learning_rate)
    raw_cfg["optimizer_params"]["ft_lr"] = float(cfg.learning_rate)
    raw_cfg["optimizer_params"]["bert_lr"] = float(cfg.bert_learning_rate)
    raw_cfg["loss_params"]["diff_epoch"] = int(cfg.diff_start_epoch)
    raw_cfg["loss_params"]["joint_epoch"] = int(cfg.joint_slm_epoch)
    raw_cfg["inference_defaults"] = {
        "alpha": float(cfg.alpha),
        "beta": float(cfg.beta),
        "diffusion_steps": int(cfg.diffusion_steps),
        "embedding_scale": 1.15,
    }

    out_cfg = run_dir / "config_ft.yml"
    out_cfg.write_text(yaml.safe_dump(raw_cfg, allow_unicode=True, sort_keys=False), encoding="utf-8")
    return raw_cfg


def train_persian_speaker(cfg: StyleTTS2FineTuneConfig) -> Path:
    """
    اجرای کامل فاین‌تیون مرحله دوم StyleTTS 2 (train_finetune.py) روی دیتاست ۲۴ کیلوهرتز IPA
    یک دوبلور جدید با Style Diffusion و آموزش خصمانه WavLM SLM.
    """
    from meldataset import build_dataloader  # type: ignore
    from models import (  # type: ignore
        build_model,
        load_ASR_models,
        load_checkpoint,
        load_F0_models,
    )
    from Modules.slmadv import SLMAdversarialLoss  # type: ignore
    from optimizers import build_optimizer  # type: ignore
    from losses import (  # type: ignore
        DiscriminatorLoss,
        GeneratorLoss,
        MultiResolutionSTFTLoss,
        WavLMLoss,
    )
    from Utils.PLBERT.util import load_plbert  # type: ignore
    from app.core.styletts2_engine import length_to_mask, recursive_munch

    run_dir = (Path(cfg.output_dir) / cfg.run_name).resolve()
    run_dir.mkdir(parents=True, exist_ok=True)
    config = _prepare_run_config(cfg, run_dir)

    required_paths = [
        Path(config["pretrained_model"]),
        Path(config["F0_path"]),
        Path(config["ASR_path"]),
        Path(config["PLBERT_dir"]),
        Path(config["data_params"]["train_data"]),
        Path(config["data_params"]["val_data"]),
        Path(cfg.speaker_reference_wav),
    ]
    for req in required_paths:
        if not req.exists():
            raise FileNotFoundError(f"فایل لوکال موردنیاز فاین‌تیون StyleTTS 2 یافت نشد: {req}")

    device = "cuda" if torch.cuda.is_available() else "cpu"
    loss_params = recursive_munch(config["loss_params"])
    model_params = recursive_munch(config["model_params"])
    opt_params = recursive_munch(config["optimizer_params"])

    train_lines = Path(config["data_params"]["train_data"]).read_text(encoding="utf-8").splitlines()
    val_lines = Path(config["data_params"]["val_data"]).read_text(encoding="utf-8").splitlines()

    train_loader = build_dataloader(
        train_lines,
        config["data_params"]["root_path"],
        OOD_data=config["data_params"]["OOD_data"],
        min_length=config["data_params"]["min_length"],
        batch_size=cfg.batch_size,
        num_workers=4,
        device=device,
        dataset_config={},
    )
    val_loader = build_dataloader(
        val_lines,
        config["data_params"]["root_path"],
        OOD_data=config["data_params"]["OOD_data"],
        min_length=config["data_params"]["min_length"],
        batch_size=cfg.batch_size,
        validation=True,
        num_workers=2,
        device=device,
        dataset_config={},
    )

    # ۱. ساخت شبکه StyleTTS 2 و بارگذاری وزن‌های پایه لوکال
    text_aligner = load_ASR_models(config["ASR_path"], config["ASR_config"])
    pitch_extractor = load_F0_models(config["F0_path"])
    plbert = load_plbert(config["PLBERT_dir"])
    model = build_model(model_params, text_aligner, pitch_extractor, plbert)
    for mod in model.values():
        mod.to(device)

    model, _, _, _ = load_checkpoint(
        model, None, config["pretrained_model"], load_only_params=True
    )
    running_std: List[float] = []

    # ۲. مقداردهی توابع زیان چندمقیاسی STFT، گن، دیسکریمینیتور و WavLM SLM لوکال
    stft_loss = MultiResolutionSTFTLoss().to(device)
    gl = GeneratorLoss(model.mpd, model.msd).to(device)
    dl = DiscriminatorLoss(model.mpd, model.msd).to(device)
    wl = WavLMLoss(
        model_params.slm.model,
        model.wd,
        config["preprocess_params"]["sr"],
        model_params.slm.sr,
    ).to(device)

    scheduler_params = {
        "max_lr": opt_params.lr,
        "pct_start": 0.0,
        "epochs": cfg.num_epochs,
        "steps_per_epoch": len(train_loader),
    }
    optimizer = build_optimizer(
        {key: model[key].parameters() for key in model},
        scheduler_params_dict={
            key: {
                **copy.deepcopy(scheduler_params),
                "max_lr": opt_params.bert_lr if key == "bert" else opt_params.ft_lr,
            }
            for key in model
        },
        lr=opt_params.lr,
    )

    slmadv = None
    if cfg.enable_slm_adversarial:
        slm_cfg = recursive_munch(config["slmadv_params"])
        slmadv = SLMAdversarialLoss(
            model, wl, None, slm_cfg.min_len, slm_cfg.max_len,
            batch_percentage=slm_cfg.batch_percentage,
            skip_update=slm_cfg.iter, sig=slm_cfg.sig,
        )

    best_val_mel = float("inf")
    history: List[Dict[str, float]] = []
    scaler = torch.amp.GradScaler("cuda", enabled=cfg.use_fp16 and device == "cuda")

    logger.info(
        f"آغاز فاین‌تیون StyleTTS 2 گوینده '{cfg.speaker_name}' | اپوک: {cfg.num_epochs} | "
        f"دسته مؤثر: {cfg.batch_size * cfg.grad_accum_steps} | SLM: {cfg.enable_slm_adversarial}"
    )

    for epoch in range(1, cfg.num_epochs + 1):
        for mod in model.values():
            mod.train()

        epoch_mel_losses: List[float] = []
        epoch_diff_losses: List[float] = []

        for step, batch in enumerate(train_loader, start=1):
            waves = batch[0]
            batch_tensors = [b.to(device) if torch.is_tensor(b) else b for b in batch[1:]]
            texts, input_lengths, ref_texts, ref_lengths, mels, mel_input_length, ref_mels = batch_tensors

            with torch.no_grad():
                mask = length_to_mask(mel_input_length // (2 ** model.text_aligner.n_down)).to(device)
                text_mask = length_to_mask(input_lengths).to(device)
                _, _, s2s_attn = model.text_aligner(mels, mask, texts)
                f0_real, _, _ = model.pitch_extractor(mels.unsqueeze(1))

            with torch.amp.autocast("cuda", enabled=cfg.use_fp16 and device == "cuda"):
                s_prosodic = model.predictor_encoder(ref_mels.unsqueeze(1))
                s_acoustic = model.style_encoder(ref_mels.unsqueeze(1))
                bert_dur = model.bert(texts, attention_mask=(~text_mask).int())
                d_en = model.bert_encoder(bert_dur).transpose(-1, -2)
                t_en = model.text_encoder(texts, input_lengths, text_mask)

                loss_diff = torch.tensor(0.0, device=device)
                if epoch >= cfg.diff_start_epoch:
                    target_style = torch.cat([s_acoustic, s_prosodic], dim=-1).detach()
                    running_std.append(float(target_style.std().item()))
                    model.diffusion.diffusion.sigma_data = float(sum(running_std[-100:]) / len(running_std[-100:]))
                    loss_diff = model.diffusion(
                        target_style.unsqueeze(1), embedding=bert_dur, features=target_style
                    ).mean()

                d, p = model.predictor(
                    d_en, s_prosodic, input_lengths, s2s_attn, text_mask
                )
                asr = t_en @ s2s_attn
                f0_rec, n_rec = model.predictor.F0Ntrain(p, s_prosodic)
                y_rec = model.decoder(asr, f0_rec, n_rec, s_acoustic)
                y_true = torch.stack([torch.from_numpy(w).float().to(device) for w in waves]).unsqueeze(1)

                loss_mel = stft_loss(y_rec.squeeze(1), y_true.squeeze(1))
                loss_gen_all = gl(y_true, y_rec).mean()
                loss_lm = wl(y_true.detach().squeeze(1), y_rec.squeeze(1)).mean()
                loss_f0 = F.smooth_l1_loss(f0_real, f0_rec)

                # بهینه‌سازی دیسکریمینیتورهای MPD / MSD / WavLM
                d_loss = dl(y_true.detach(), y_rec.detach()).mean()
                optimizer.zero_grad()
                scaler.scale(d_loss).backward()
                scaler.step(optimizer, "mpd")
                scaler.step(optimizer, "msd")

                total_g_loss = (
                    loss_params.lambda_mel * loss_mel
                    + loss_params.lambda_F0 * loss_f0
                    + loss_params.lambda_gen * loss_gen_all
                    + loss_params.lambda_slm * loss_lm
                    + loss_params.lambda_diff * loss_diff
                ) / cfg.grad_accum_steps

            scaler.scale(total_g_loss).backward()
            if step % cfg.grad_accum_steps == 0:
                for mod_key in ("decoder", "predictor", "text_encoder", "bert_encoder", "bert", "style_encoder", "predictor_encoder", "diffusion"):
                    if mod_key in model:
                        scaler.step(optimizer, mod_key)
                scaler.update()
                optimizer.zero_grad()
                optimizer.scheduler()

            # آموزش خصمانه SLM روی جملات OOD در اپوک‌های مشترک
            if slmadv is not None and epoch >= cfg.joint_slm_epoch and step % 4 == 0:
                slmadv(step, y_rec.detach(), y_true.detach(), waves, mel_input_length, ref_texts, ref_lengths)

            epoch_mel_losses.append(float(loss_mel.item()))
            epoch_diff_losses.append(float(loss_diff.item()))

        # ۳. ارزیابی پایان اپوک روی val_list.txt و ذخیره بهترین وزن
        for mod in model.values():
            mod.eval()
        val_mels: List[float] = []
        with torch.no_grad():
            for batch in val_loader:
                waves = batch[0]
                texts, input_lengths, _, _, mels, mel_len, ref_mels = [
                    b.to(device) if torch.is_tensor(b) else b for b in batch[1:]
                ]
                mask = length_to_mask(mel_len // (2 ** model.text_aligner.n_down)).to(device)
                text_mask = length_to_mask(input_lengths).to(device)
                _, _, s2s_attn = model.text_aligner(mels, mask, texts)
                s_pro = model.predictor_encoder(ref_mels.unsqueeze(1))
                s_aco = model.style_encoder(ref_mels.unsqueeze(1))
                d_en = model.bert_encoder(model.bert(texts, attention_mask=(~text_mask).int())).transpose(-1, -2)
                _, p = model.predictor(d_en, s_pro, input_lengths, s2s_attn, text_mask)
                f0_r, n_r = model.predictor.F0Ntrain(p, s_pro)
                y_r = model.decoder(model.text_encoder(texts, input_lengths, text_mask) @ s2s_attn, f0_r, n_r, s_aco)
                y_t = torch.stack([torch.from_numpy(w).float().to(device) for w in waves]).unsqueeze(1)
                val_mels.append(float(stft_loss(y_r.squeeze(1), y_t.squeeze(1)).item()))

        mean_val_mel = round(sum(val_mels) / max(1, len(val_mels)), 4)
        mean_diff = round(sum(epoch_diff_losses) / max(1, len(epoch_diff_losses)), 4)
        history.append({"epoch": epoch, "mel_loss": mean_val_mel, "diff_loss": mean_diff})
        logger.info(f"[Epoch {epoch:03d}/{cfg.num_epochs:03d}] val_mel={mean_val_mel:.4f} | diff={mean_diff:.4f}")

        state_payload = {
            "net": {key: model[key].state_dict() for key in model},
            "epoch": epoch,
            "val_mel_loss": mean_val_mel,
            "speaker_name": cfg.speaker_name,
        }
        if epoch % cfg.save_freq == 0 or epoch == cfg.num_epochs:
            torch.save(state_payload, run_dir / f"epoch_2nd_{epoch - 1:05d}.pth")
        if mean_val_mel < best_val_mel:
            best_val_mel = mean_val_mel
            torch.save(state_payload, run_dir / "epoch_2nd_best.pth")

    shutil.copy2(cfg.speaker_reference_wav, run_dir / "reference_speaker.wav")
    (run_dir / "training_metrics.json").write_text(
        json.dumps({"run_name": cfg.run_name, "best_val_mel": best_val_mel, "history": history}, indent=2),
        encoding="utf-8",
    )

    del model, train_loader, val_loader
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()

    logger.success(f"فاین‌تیون StyleTTS 2 پایان یافت! بهترین Mel Loss: {best_val_mel:.4f} -> {run_dir}")
    return run_dir


def _parse_cli() -> StyleTTS2FineTuneConfig:
    parser = argparse.ArgumentParser(description="فاین‌تیون آفلاین StyleTTS 2 روی دوبلور دوزبانه")
    parser.add_argument("--run-name", required=True, help="نام نسخه مدل (مثلاً styletts2_dorsa_bilingual_v1)")
    parser.add_argument("--speaker-name", required=True, help="شناسه گوینده")
    parser.add_argument("--dataset-dir", type=Path, required=True, help="مسیر دیتاست 24kHz IPA")
    parser.add_argument("--base-model-dir", type=Path, required=True, help="مسیر مدل پایه StyleTTS 2")
    parser.add_argument("--config", type=Path, default=Path("configs/config_ft.yml"))
    parser.add_argument("--output-dir", type=Path, required=True, help="مسیر ذخیره چک‌پوینت‌ها")
    parser.add_argument("--speaker-ref", type=Path, required=True, help="فایل WAV مرجع گوینده")
    parser.add_argument("--epochs", type=int, default=30)
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--grad-accum", type=int, default=4)
    parser.add_argument("--lr", type=float, default=1e-4)
    parser.add_argument("--alpha", type=float, default=0.28)
    parser.add_argument("--beta", type=float, default=0.72)
    parser.add_argument("--diffusion-steps", type=int, default=8)
    args = parser.parse_args()

    return StyleTTS2FineTuneConfig(
        run_name=args.run_name,
        speaker_name=args.speaker_name,
        dataset_dir=args.dataset_dir,
        base_model_dir=args.base_model_dir,
        config_template_path=args.config,
        output_dir=args.output_dir,
        speaker_reference_wav=args.speaker_ref,
        num_epochs=args.epochs,
        batch_size=args.batch_size,
        grad_accum_steps=args.grad_accum,
        learning_rate=args.lr,
        alpha=args.alpha,
        beta=args.beta,
        diffusion_steps=args.diffusion_steps,
    )


if __name__ == "__main__":
    train_persian_speaker(_parse_cli())
