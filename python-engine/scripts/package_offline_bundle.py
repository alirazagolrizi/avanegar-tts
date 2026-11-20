"""
اسکریپت بسته‌بندی آفلاین وزن‌های موتور مرکزی StyleTTS 2 دوزبانه (FA + EN)
جهت تحویل B2B و استقرار بدون اینترنت در دیتاسنتر مشتریان (مانند زومیت و دیجیاتو).

شامل وزن شبکه اصلی، PL-BERT واج‌محور، Text Aligner (ASR)، Pitch Extractor (JDC)،
و WavLM SLM با امضای یکپارچگی SHA-256.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import tarfile
from datetime import datetime, timezone
from pathlib import Path

REQUIRED_STYLETTS2_ARTIFACTS = [
    "epoch_2nd_base.pth",
    "config_ft.yml",
    "Utils/PLBERT/step_1000000.t7",
    "Utils/PLBERT/config.yml",
    "Utils/PLBERT/word_index_dict.txt",
    "Utils/ASR/epoch_00080.pth",
    "Utils/ASR/config.yml",
    "Utils/JDC/bst.t7",
    "Utils/wavlm-base-plus/pytorch_model.bin",
    "Utils/wavlm-base-plus/config.json",
]


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for block in iter(lambda: fh.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def create_customer_bundle(model_dir: Path, customer_id: str, output_tar: Path) -> None:
    checksums = {}
    for rel_file in REQUIRED_STYLETTS2_ARTIFACTS:
        target = model_dir / rel_file
        if not target.exists():
            raise FileNotFoundError(f"فایل ضروری مدل StyleTTS 2 یافت نشد: {target}")
        checksums[rel_file] = sha256_file(target)

    manifest = {
        "engine": "StyleTTS 2 (Style Diffusion + PL-BERT + iSTFTNet + WavLM SLM)",
        "bundle_version": "styletts2-fa-en-enterprise-3.0",
        "customer_id": customer_id,
        "bilingual_ipa": ["fa", "en-us"],
        "english_preserved": True,
        "air_gapped_ready": True,
        "sample_rate_hz": 24000,
        "style_vector_dim": 256,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "checksums_sha256": checksums,
    }
    manifest_path = model_dir / "bundle_manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    output_tar.parent.mkdir(parents=True, exist_ok=True)
    with tarfile.open(output_tar, "w:gz") as tar:
        for rel_file in [*REQUIRED_STYLETTS2_ARTIFACTS, "bundle_manifest.json"]:
            tar.add(model_dir / rel_file, arcname=f"styletts2_fa_en_base/{rel_file}")

    print(f"بسته آفلاین StyleTTS 2 مشتری '{customer_id}' آماده شد: {output_tar}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-dir", type=Path, required=True)
    parser.add_argument("--customer-id", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    create_customer_bundle(args.model_dir, args.customer_id, args.output)
