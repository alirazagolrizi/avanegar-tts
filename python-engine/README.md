# موتور عصبی تبدیل متن به گفتار دوزبانه آوانگار (StyleTTS 2 On-Premise — v3.0)

پلتفرم سازمانی B2B کاملاً لوکال و بدون وابستگی به اینترنت بر پایه **StyleTTS 2** (مجهز به **Style Diffusion**، **PL-BERT** واج‌محور، دیکودر فوق‌سریع **iSTFTNet 24kHz** و آموزش خصمانه **WavLM SLM**) برای تبدیل مقالات فارسی شامل اعداد تخصصی و حروف/واژه‌های انگلیسی بومی به گفتار طبیعی انسان، ویژه رسانه‌های پرترافیک مانند **زومیت**.

## مزایای معماری StyleTTS 2 در این پروژه
- **کیفیت انسانی (Human-Level TTS):** مدل‌سازی استایل به عنوان متغیر پنهان با انتشار استایل (`ADPM2 + Karras`) و دیسکریمینیتور `WavLM SLM`.
- **خوانش دوزبانه بومی (FA + EN Code-Switching بدون تبدیل انگلیسی به فارسی):** واج‌نگاری مستقیم با ۱۷۸ نماد IPA مشترک — فارسی و اعداد دقیق با `fa` و تمام حروف/کلمات/مدل‌های انگلیسی (`A, B, C, RTX 5090, GPT-4o, Galaxy A57, NVMe, LTPO, 120Hz`) دقیقاً به انگلیسی با `en-us`.
- **کلونینگ صفر شات با کنترل دوگانه:** استخراج بردار استایل ۲۵۶ بعدی `ref_s = [s_acoustic(128), s_prosodic(128)]` و تنظیم مستقل شباهت طنین (`alpha`) و تنوع لحن (`beta`).
- **سرعت استنتاج ~۱۲ برابر زمان واقعی (`RTF ~ 0.08x`):** معماری غیرخودهمبسته و `LFinference` با پیوستگی لحن (`s_prev`).

## ساختار پوشه‌بندی پروژه پایتون

```text
python-engine/
├── requirements.txt                  # وابستگی‌های StyleTTS 2، phonemizer، Hazm، FastAPI و Celery
├── .env.example                      # تنظیمات آفلاین، مسیر PL-BERT/ASR/JDC/WavLM و alpha/beta
├── Dockerfile                        # کانتینر CUDA 12.1 + espeak-ng (fa + en-us) + FFmpeg
├── docker-compose.yml                # استک کامل API + Celery GPU Worker + Redis + Nginx
├── configs/
│   └── config_ft.yml                 # پیکربندی رسمی فاین‌تیون StyleTTS 2 (Diffusion + SLM + iSTFTNet)
├── app/
│   ├── __init__.py
│   ├── config.py                     # تنظیمات متمرکز StyleTTS 2، کش ref_s و پارامترهای انتشار
│   ├── core/
│   │   ├── english_phonetics.py      # حفظ بومی انگلیسی (بدون تبدیل فارسی) + موتور دقیق اعداد فارسی
│   │   ├── persian_normalizer.py     # استانداردسازی حروف، نیم‌فاصله و تقطیع هوشمند دوزبانه
│   │   ├── ipa_phonemizer.py         # واج‌نگار دوزبانه آفلاین IPA (fa + en-us) و جدول ۱۷۸ نمادی
│   │   ├── styletts2_engine.py       # کلاس PersianStyleTTS2Engine (ref_s، LFinference، speed، LUFS)
│   │   └── audio_verifier.py         # راستی‌آزمایی آفلاین صحت خوانش متن با Faster-Whisper (WER)
│   ├── finetune/
│   │   ├── extend_plbert_fa.py       # ممیزی و تطبیق آفلاین PL-BERT دوزبانه (فارسی + انگلیسی)
│   │   ├── dataset_builder.py        # تقطیع ۲۴kHz استودیویی و ساخت train_list.txt / val_list.txt / OOD
│   │   └── train_styletts2.py        # فاین‌تیون رسمی مرحله دوم با Style Diffusion و WavLM SLM
│   ├── workers/
│   │   └── celery_worker.py          # صف GPU، بازتولید خودکار و ساخت مانیفست ویجت
│   └── api/
│       ├── schemas.py                # مدل‌های Pydantic (شامل speed، alpha، beta، diffusion_steps)
│       └── main.py                   # سرویس FastAPI پنل مدیریت، راستی‌آزمایی و ویجت
├── scripts/
│   └── package_offline_bundle.py     # بسته‌بندی آفلاین وزن‌های StyleTTS 2 با امضای SHA-256
└── widget/
    └── avanegar-player.js            # ویجت سبک Shadow DOM جاوااسکریپت با انتخاب صدا و سرعت
```

## اجرای فاین‌تیون اختصاصی مدل جدید (مدل C) با StyleTTS 2

```bash
python -m app.finetune.train_styletts2 \
  --run-name styletts2_dorsa_bilingual_v1 \
  --speaker-name dorsa_radmehr \
  --dataset-dir /srv/avanegar/storage/datasets/dorsa_studio_24khz_ipa \
  --base-model-dir /srv/avanegar/models/styletts2_fa_en_base \
  --config configs/config_ft.yml \
  --output-dir /srv/avanegar/models/checkpoints \
  --speaker-ref /srv/avanegar/storage/speakers/dorsa_radmehr.wav \
  --epochs 30 --batch-size 8 --grad-accum 4 --lr 1e-4 \
  --alpha 0.28 --beta 0.72 --diffusion-steps 8
```
