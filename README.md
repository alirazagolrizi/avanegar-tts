# Avanegar TTS | آوانگار

**Proposed GitHub repository name:** `avanegar-tts`

A Persian-first text-to-speech studio combining a Next.js web interface with a Python/FastAPI engine, voice tools, and a JavaScript playback widget.

پلتفرم استودیوی تبدیل متن به گفتار با تمرکز بر فارسی، شامل رابط Next.js، موتور Python/FastAPI، ابزارهای صدا و ویجت پخش جاوااسکریپت.

## Repository layout | ساختار مخزن
- `src/`: Next.js application, UI, API routes, and database code.
- `python-engine/`: Python engine, configuration, training/inference utilities, and deployment files.
- `voice-tools/`: voice-related utilities.
- `public/widget/`: browser player widget.
- `data/` and `public/voice/`: lightweight metadata/manifests only; audio binaries and model weights are not included.

## Prerequisites | پیش‌نیازها
- Node.js and npm compatible with the pinned Next.js version in `package.json`.
- Python 3.10–3.11 for the listed StyleTTS2 engine dependencies; GPU/CUDA and system audio tools may be needed for local inference.
- PostgreSQL and, for the Python worker stack, Redis as configured by deployment files.
- Compatible StyleTTS2 model checkpoints and related assets for local model inference/training; these are not provided.

## Install and run | نصب و اجرا
1. Install JavaScript dependencies: `npm install`.
2. Install the engine dependencies in an appropriate Python environment: `python -m pip install -r python-engine/requirements.txt`. PyTorch/CUDA installation may need to be adapted to the host.
3. Set required environment variables securely in your own local environment; **do not commit credentials**. A credential-bearing local environment example is deliberately not distributed. Review configuration and deployment files before exposing services.
4. Configure PostgreSQL/Redis and required local model paths/assets. Start the web app with `npm run dev`; engine/container commands and settings are described in `python-engine/README.md` and its deployment files.

۱. وابستگی‌های جاوااسکریپت را با `npm install` نصب کنید.
۲. در محیط پایتون مناسب، `python -m pip install -r python-engine/requirements.txt` را اجرا کنید؛ نصب PyTorch/CUDA ممکن است متناسب با میزبان تغییر کند.
۳. متغیرهای محیطی را به‌صورت امن و محلی تنظیم کنید؛ هیچ اعتبارنامه‌ای را commit نکنید. فایل نمونهٔ محلیِ دارای مقادیر محرمانه عمداً توزیع نشده است.
۴. PostgreSQL/Redis و مسیر مدل‌های محلی را تنظیم کنید. رابط وب با `npm run dev` اجرا می‌شود؛ تنظیمات موتور در README و فایل‌های استقرار `python-engine/` آمده است.

## Synthesis backends | موتورهای تولید صدا
The application includes an **online `edge_tts` path** that depends on Microsoft Edge's online TTS service and network availability; it is not an offline/local inference backend. Local StyleTTS2 inference/training is a separate, heavier path that requires compatible StyleTTS2 checkpoints, auxiliary model assets, system dependencies, and suitable hardware. Model weights are intentionally excluded.

مسیر **`edge_tts`** به سرویس آنلاین تبدیل گفتار Edge و اتصال شبکه وابسته است و موتور آفلاین محسوب نمی‌شود. اجرای محلی StyleTTS2 مسیری جداگانه و سنگین‌تر است و به وزن‌های سازگار StyleTTS2، دارایی‌های مدل کمکی، وابستگی‌های سیستمی و سخت‌افزار مناسب نیاز دارد؛ وزن مدل‌ها در این مخزن نیست.

## Limitations and security | محدودیت‌ها و امنیت
- A complete end-to-end run has **not been verified**. Treat this as a prepared source project, not a validated production deployment.
- Model checkpoints, speaker audio, user audio, and runtime datasets must be supplied separately with appropriate rights. The repository includes selected metadata only.
- API keys, passwords, private URLs, and `.env` files must remain local. `.gitignore` excludes environment files and common generated/model/audio assets.
- Review data provenance and privacy implications before using voice cloning or publishing generated audio.

اجرای کامل انتها‌به‌انتها **تأیید نشده است**. وزن‌ها، صوت گوینده/کاربر و داده‌های زمان اجرا باید جداگانه و با مجوز مناسب فراهم شوند. اطلاعات محرمانه را محلی نگه دارید و پیش از استفاده از کلون‌سازی صدا، حریم خصوصی و مجوزها را بررسی کنید.
