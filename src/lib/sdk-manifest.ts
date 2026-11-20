import path from "node:path";

export interface SdkFileDescriptor {
  id: string;
  relativePath: string;
  engineSubPath?: string;
  isWidget?: boolean;
  category: string;
  title: string;
  description: string;
  language: string;
}

export function resolveSdkDiskPath(item: SdkFileDescriptor): string {
  if (item.isWidget) {
    return path.join(process.cwd(), "public", "widget", "avanegar-player.js");
  }
  return path.join(
    process.cwd(),
    "python-engine",
    item.engineSubPath ?? "README.md"
  );
}

export const SDK_FILE_MANIFEST: SdkFileDescriptor[] = [
  {
    id: "styletts2_engine",
    relativePath: "python-engine/app/core/styletts2_engine.py",
    engineSubPath: "app/core/styletts2_engine.py",
    category: "موتور مرکزی StyleTTS 2",
    title: "کلاس اصلی PersianStyleTTS2Engine",
    description:
      "بارگذاری آفلاین StyleTTS 2 (PL-BERT، Style Diffusion، iSTFTNet)، استخراج بردار استایل ۲۵۶ بعدی ref_s، کنترل alpha/beta/diffusion_steps/speed و استنتاج بلند LFinference با -16 LUFS",
    language: "python",
  },
  {
    id: "ipa_phonemizer",
    relativePath: "python-engine/app/core/ipa_phonemizer.py",
    engineSubPath: "app/core/ipa_phonemizer.py",
    category: "موتور مرکزی StyleTTS 2",
    title: "واج‌نگار دوزبانه آفلاین IPA (fa + en-us)",
    description:
      "جدول رسمی ۱۷۸ نماد واجی StyleTTS 2 (StyleTTSTextCleaner) و تبدیل فارسی به IPA فارسی و کلمات/حروف انگلیسی بدون تبدیل فارسی به IPA اصیل انگلیسی آمریکایی",
    language: "python",
  },
  {
    id: "english_phonetics",
    relativePath: "python-engine/app/core/english_phonetics.py",
    engineSubPath: "app/core/english_phonetics.py",
    category: "موتور مرکزی StyleTTS 2",
    title: "خوانش بومی انگلیسی (FA+EN) و موتور دقیق اعداد",
    description:
      "حفظ ۱۰۰٪ حروف، سرواژه‌ها و مدل‌های انگلیسی (A/B/C، StyleTTS 2، RTX 5090، GPT-4o، A57، 120Hz) به همراه مبدل دقیق اعداد (اعشار 3.05، ممیز فارسی، منفی، درصد، ارز، هزارگان و ترتیبی)",
    language: "python",
  },
  {
    id: "persian_normalizer",
    relativePath: "python-engine/app/core/persian_normalizer.py",
    engineSubPath: "app/core/persian_normalizer.py",
    category: "موتور مرکزی StyleTTS 2",
    title: "نرمال‌ساز و تقطیع‌کننده دوزبانه فارسی",
    description:
      "حذف کشیده و نویسه‌های مخرب، استانداردسازی ی/ک و همزه، تنظیم نیم‌فاصله با Hazm و تقطیع ایمن برای پنجره ۵۱۲ توکنی PL-BERT",
    language: "python",
  },
  {
    id: "audio_verifier",
    relativePath: "python-engine/app/core/audio_verifier.py",
    engineSubPath: "app/core/audio_verifier.py",
    category: "موتور مرکزی StyleTTS 2",
    title: "راستی‌آزمای صحت خوانش متن (WER)",
    description:
      "بازخوانی آفلاین خروجی StyleTTS 2 با Faster-Whisper لوکال، محاسبه WER/CER، پوشش جمله‌به‌جمله و تشخیص جملات جامانده",
    language: "python",
  },
  {
    id: "train_styletts2",
    relativePath: "python-engine/app/finetune/train_styletts2.py",
    engineSubPath: "app/finetune/train_styletts2.py",
    category: "فاین‌تیون StyleTTS 2 و داده",
    title: "فاین‌تیون رسمی StyleTTS 2 (Diffusion + SLM)",
    description:
      "حلقه کامل آموزش مرحله دوم با Multi-Resolution STFT Loss، بازسازی F0/دیرش، Style Diffusion (EDM) و آموزش خصمانه WavLM SLM و ذخیره epoch_2nd_best.pth",
    language: "python",
  },
  {
    id: "config_ft_yml",
    relativePath: "python-engine/configs/config_ft.yml",
    engineSubPath: "configs/config_ft.yml",
    category: "فاین‌تیون StyleTTS 2 و داده",
    title: "پیکربندی رسمی فاین‌تیون (config_ft.yml)",
    description:
      "تنظیمات کامل ۲۴ کیلوهرتز مِل ۸۰ کاناله، دیکودر iSTFTNet، ترنسفورمر انتشار استایل، WavLM SLM و ضرایب توابع زیان",
    language: "yaml",
  },
  {
    id: "dataset_builder",
    relativePath: "python-engine/app/finetune/dataset_builder.py",
    engineSubPath: "app/finetune/dataset_builder.py",
    category: "فاین‌تیون StyleTTS 2 و داده",
    title: "پیش‌پردازش ۲۴kHz و ساخت train_list.txt",
    description:
      "تقطیع استودیویی VAD در نرخ ۲۴۰۰۰ هرتز، واج‌نگاری دوزبانه IPA، کنترل WER و تولید train_list.txt، val_list.txt و OOD_texts.txt",
    language: "python",
  },
  {
    id: "extend_plbert_fa",
    relativePath: "python-engine/app/finetune/extend_plbert_fa.py",
    engineSubPath: "app/finetune/extend_plbert_fa.py",
    category: "فاین‌تیون StyleTTS 2 و داده",
    title: "ممیزی و تطبیق آفلاین PL-BERT دوزبانه",
    description:
      "تأیید پوشش ۱۰۰٪ واج‌های فارسی (fa) و انگلیسی آمریکایی (en-us) در جدول ۱۷۸ نمادی و صدور word_index_dict.txt",
    language: "python",
  },
  {
    id: "fastapi_main",
    relativePath: "python-engine/app/api/main.py",
    engineSubPath: "app/api/main.py",
    category: "API پنل مدیریت و صف",
    title: "سرویس FastAPI مدیریت و ویجت",
    description:
      "اندپوینت‌های ارسال مقاله با کنترل alpha/beta/diffusion_steps/speed، کلونینگ ref_s، شروع فاین‌تیون، راستی‌آزمایی WER و مانیفست ویجت",
    language: "python",
  },
  {
    id: "api_schemas",
    relativePath: "python-engine/app/api/schemas.py",
    engineSubPath: "app/api/schemas.py",
    category: "API پنل مدیریت و صف",
    title: "مدل‌های اعتبارسنجی Pydantic",
    description:
      "اسکیماهای دقیق ورودی و خروجی سنتز StyleTTS 2 (alpha، beta، diffusion_steps، embedding_scale)، فاین‌تیون SLM و ویجت",
    language: "python",
  },
  {
    id: "celery_worker",
    relativePath: "python-engine/app/workers/celery_worker.py",
    engineSubPath: "app/workers/celery_worker.py",
    category: "API پنل مدیریت و صف",
    title: "کارگر صف GPU (Celery + Redis)",
    description:
      "بارگذاری یک‌باره StyleTTS 2 در VRAM، راستی‌آزمایی و بازتولید خودکار، تولید مانیفست چندگوینده‌ای و وب‌هوک CMS",
    language: "python",
  },
  {
    id: "requirements",
    relativePath: "python-engine/requirements.txt",
    engineSubPath: "requirements.txt",
    category: "محیط و استقرار آفلاین",
    title: "وابستگی‌های پایتون (requirements.txt)",
    description:
      "نسخه‌های دقیق PyTorch، phonemizer، munch، einops-exts، monotonic-align، Hazm، Faster-Whisper، FastAPI و Celery",
    language: "text",
  },
  {
    id: "config",
    relativePath: "python-engine/app/config.py",
    engineSubPath: "app/config.py",
    category: "محیط و استقرار آفلاین",
    title: "پیکربندی آفلاین سرور (config.py)",
    description:
      "مدیریت مسیرهای لوکال PL-BERT، ASR Aligner، JDC F0، WavLM SLM، کش بردار ref_s و پارامترهای Style Diffusion",
    language: "python",
  },
  {
    id: "docker_compose",
    relativePath: "python-engine/docker-compose.yml",
    engineSubPath: "docker-compose.yml",
    category: "محیط و استقرار آفلاین",
    title: "استک استقرار Docker Compose",
    description:
      "راه‌اندازی یکپارچه FastAPI + کارگر GPU StyleTTS 2 + صف Redis + سرور صوتی Nginx در شبکه داخلی مشتری",
    language: "yaml",
  },
  {
    id: "dockerfile",
    relativePath: "python-engine/Dockerfile",
    engineSubPath: "Dockerfile",
    category: "محیط و استقرار آفلاین",
    title: "کانتینر CUDA 12.1 + espeak-ng",
    description:
      "ایمیج آفلاین شامل Python 3.11، libespeak-ng (پشتیبانی بومی fa و en-us)، FFmpeg و libsndfile",
    language: "dockerfile",
  },
  {
    id: "bundle_packager",
    relativePath: "python-engine/scripts/package_offline_bundle.py",
    engineSubPath: "scripts/package_offline_bundle.py",
    category: "محیط و استقرار آفلاین",
    title: "بسته‌بندی آفلاین وزن‌های StyleTTS 2",
    description:
      "ساخت آرشیو tar.gz شامل epoch_2nd_base.pth، PL-BERT، ASR، JDC و WavLM با امضای SHA-256 ویژه تحویل B2B",
    language: "python",
  },
  {
    id: "js_widget",
    relativePath: "python-engine/widget/avanegar-player.js",
    isWidget: true,
    category: "ویجت پخش‌کننده JS",
    title: "ویجت سبک جاوااسکریپت (avanegar-player.js)",
    description:
      "پخش‌کننده بدون وابستگی با Shadow DOM، انتخاب گوینده (مدل C، B و A)، کنترل سرعت ۰.۷۵x تا ۲x و موج صوتی تعاملی",
    language: "javascript",
  },
];

export const PROJECT_TREE = `avanegar-styletts2-onpremise/
├── requirements.txt                  # torch, phonemizer, munch, einops-exts, hazm, fastapi, celery
├── .env.example                      # HF_HUB_OFFLINE=1، مسیر PL-BERT/ASR/JDC/WavLM و alpha/beta
├── Dockerfile                        # NVIDIA CUDA 12.1 + Python 3.11 + espeak-ng (fa + en-us) + FFmpeg
├── docker-compose.yml                # API + StyleTTS 2 GPU Worker + Redis + Nginx Media Server
├── README.md                         # راهنمای استقرار آفلاین On-Premise روی زیرساخت مشتری (زومیت)
├── configs/
│   └── config_ft.yml                 # پیکربندی رسمی فاین‌تیون StyleTTS 2 (Diffusion + SLM + iSTFTNet)
├── app/
│   ├── __init__.py
│   ├── config.py                     # تنظیمات StyleTTS 2، کش بردار ۲۵۶ بعدی ref_s و انتشار استایل
│   ├── core/
│   │   ├── english_phonetics.py      # خوانش بومی انگلیسی (بدون تبدیل فارسی) + موتور دقیق اعداد فارسی
│   │   ├── persian_normalizer.py     # استانداردسازی حروف و نیم‌فاصله و تقطیع هوشمند دوزبانه
│   │   ├── ipa_phonemizer.py         # واج‌نگار دوزبانه آفلاین IPA (fa + en-us) و جدول ۱۷۸ نمادی
│   │   ├── styletts2_engine.py       # کلاس PersianStyleTTS2Engine (ref_s، LFinference، speed، LUFS)
│   │   └── audio_verifier.py         # راستی‌آزمایی آفلاین خوانش متن با Faster-Whisper (WER)
│   ├── finetune/
│   │   ├── extend_plbert_fa.py       # ممیزی و تطبیق آفلاین PL-BERT دوزبانه (فارسی + انگلیسی)
│   │   ├── dataset_builder.py        # تقطیع ۲۴kHz استودیویی و ساخت train_list.txt / val_list.txt / OOD
│   │   └── train_styletts2.py        # فاین‌تیون رسمی مرحله دوم با Style Diffusion و WavLM SLM
│   ├── workers/
│   │   └── celery_worker.py          # صف پردازش GPU، راستی‌آزمایی خودکار و وب‌هوک CMS
│   └── api/
│       ├── schemas.py                # مدل‌های Pydantic (شامل speed، alpha، beta، diffusion_steps)
│       └── main.py                   # سرویس FastAPI پنل مدیریت و اندپوینت ویجت پخش‌کننده
├── scripts/
│   └── package_offline_bundle.py     # بسته‌بندی آفلاین وزن‌های StyleTTS 2 با SHA-256 برای مشتری B2B
└── widget/
    └── avanegar-player.js            # ویجت سبک جاوااسکریپت با Shadow DOM، انتخاب صدا و کنترل سرعت`;
