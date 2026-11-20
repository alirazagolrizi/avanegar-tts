# ==============================================================================
# Dockerfile استقرار آفلاین (Air-Gapped) موتور عصبی دوزبانه StyleTTS 2 (FA + EN)
# بهینه‌شده برای NVIDIA L4 / A10 / RTX 4090 (سرعت استنتاج ~12x سریع‌تر از زمان واقعی)
# ==============================================================================
FROM nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HF_HUB_OFFLINE=1 \
    TRANSFORMERS_OFFLINE=1 \
    PHONEMIZER_ESPEAK_LIBRARY="/usr/lib/x86_64-linux-gnu/libespeak-ng.so.1"

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.11 \
    python3.11-venv \
    python3.11-dev \
    python3-pip \
    ffmpeg \
    libsndfile1 \
    espeak-ng \
    espeak-ng-data \
    libespeak-ng1 \
    build-essential \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/python3.11 /usr/bin/python

WORKDIR /opt/avanegar

# در محیط‌های کاملاً بدون اینترنت پوشه wheelhouse محلی کپی و با --no-index نصب می‌شود
COPY requirements.txt .
RUN python -m pip install --upgrade pip && \
    python -m pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY configs ./configs
COPY scripts ./scripts

RUN mkdir -p /srv/avanegar/models/styletts2_fa_en_base \
             /srv/avanegar/models/checkpoints \
             /srv/avanegar/storage/speakers \
             /srv/avanegar/storage/style_vectors \
             /srv/avanegar/storage/articles_audio \
             /srv/avanegar/storage/datasets

EXPOSE 8080

CMD ["uvicorn", "app.api.main:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "2"]
