import fs from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { articles, speakers, synthesisJobs } from "@/db/schema";
import {
  AUDIO_STORAGE_DIR,
  analyzeWavFile,
  synthesizeProsodicWavFile,
} from "@/lib/audio-engine";
import {
  audioMetaPath,
  installHumanVoiceAsset,
  isHumanEngine,
  pitchOffsetFor,
  readAudioMeta,
  resolveVoicePlan,
} from "@/lib/human-voice-assets";
import type { VoiceMode } from "@/lib/human-voice";
import { getVoicePersona, isValidPersonaId } from "@/lib/voice-personas";
import { adaptiveTimeoutMs, generateHumanVoice } from "@/lib/human-voice";
import {
  normalizePersianForXTTS,
  slugifyArticle,
  splitPersianTextForXTTS,
} from "@/lib/persian-nlp";
import { ensureSeeded } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    await ensureSeeded();
    const body = await request.json();

    const title = String(body.title ?? "").trim();
    const rawText = String(body.text ?? body.rawText ?? "").trim();
    const publisherName = String(body.publisherName ?? "زومیت").trim() || "زومیت";
    const category =
      String(body.category ?? "فناوری و هوش مصنوعی").trim() ||
      "فناوری و هوش مصنوعی";
    const speed = Math.max(0.6, Math.min(1.8, Number(body.speed ?? 1.0) || 1.0));
    // پارامترهای انتشار استایل و هدایت احساسی موتور مرکزی StyleTTS 2
    const alpha = Math.max(
      0.0,
      Math.min(1.0, body.alpha !== undefined ? Number(body.alpha) : 0.28)
    );
    const beta = Math.max(
      0.0,
      Math.min(1.0, body.beta !== undefined ? Number(body.beta) : 0.72)
    );
    const diffusionSteps = Math.max(
      3,
      Math.min(25, Math.round(Number(body.diffusionSteps ?? body.diffusion_steps ?? 8) || 8))
    );
    const embeddingScale = Math.max(
      0.8,
      Math.min(2.5, Number(body.embeddingScale ?? body.embedding_scale ?? 1.15) || 1.15)
    );
    const temperature = Math.max(0.1, Math.min(1.0, beta));
    const repetitionPenalty = 5.0;

    // پشتیبانی از هر دو حالت: افزودن گوینده جدید به مقاله موجود یا ثبت مقاله جدید
    const existingArticleId = body.articleId ? Number(body.articleId) : null;

    let speakerRecord = null;
    if (body.speakerId) {
      const [found] = await db
        .select()
        .from(speakers)
        .where(eq(speakers.id, Number(body.speakerId)));
      speakerRecord = found ?? null;
    } else if (body.speaker_id || body.speakerCode) {
      const code = String(body.speaker_id ?? body.speakerCode).trim();
      const [found] = await db
        .select()
        .from(speakers)
        .where(eq(speakers.speakerCode, code));
      speakerRecord = found ?? null;
    }

    if (!speakerRecord) {
      return NextResponse.json(
        { error: "گوینده انتخاب‌شده در سرور یافت نشد." },
        { status: 404 }
      );
    }

    let articleRecord = null;
    if (existingArticleId) {
      const [found] = await db
        .select()
        .from(articles)
        .where(eq(articles.id, existingArticleId));
      if (!found) {
        return NextResponse.json(
          { error: "مقاله موردنظر یافت نشد." },
          { status: 404 }
        );
      }
      articleRecord = found;
    } else {
      if (title.length < 3) {
        return NextResponse.json(
          { error: "لطفاً عنوان مقاله را وارد کنید (حداقل ۳ کاراکتر)." },
          { status: 400 }
        );
      }
      if (rawText.length < 12) {
        return NextResponse.json(
          { error: "متن مقاله فارسی باید حداقل ۱۲ کاراکتر باشد." },
          { status: 400 }
        );
      }

      const requestedSlug = body.slug
        ? slugifyArticle(String(body.slug))
        : `zoomit-${Date.now().toString(36)}`;
      const normalizedText = normalizePersianForXTTS(rawText);
      const chunks = splitPersianTextForXTTS(rawText, 220);

      if (chunks.length === 0) {
        return NextResponse.json(
          { error: "متن پس از نرمال‌سازی خالی است." },
          { status: 400 }
        );
      }

      const [existingBySlug] = await db
        .select()
        .from(articles)
        .where(eq(articles.slug, requestedSlug));

      if (existingBySlug) {
        const [updated] = await db
          .update(articles)
          .set({
            title,
            publisherName,
            category,
            rawText,
            normalizedText,
            chunksJson: chunks,
            status: "approved",
            updatedAt: new Date(),
          })
          .where(eq(articles.id, existingBySlug.id))
          .returning();
        articleRecord = updated;
      } else {
        const [inserted] = await db
          .insert(articles)
          .values({
            slug: requestedSlug,
            title,
            publisherName,
            category,
            rawText,
            normalizedText,
            chunksJson: chunks,
            status: "approved",
          })
          .returning();
        articleRecord = inserted;
      }
    }

    // همگام‌سازی متن مقاله با نرمال‌ساز جدید (حفظ ۱۰۰٪ انگلیسی + تبدیل دقیق اعداد فارسی)
    const freshNormalized = normalizePersianForXTTS(articleRecord.rawText);
    const freshChunks = splitPersianTextForXTTS(articleRecord.rawText, 220);
    if (
      existingArticleId &&
      (freshNormalized !== articleRecord.normalizedText ||
        JSON.stringify(freshChunks) !== JSON.stringify(articleRecord.chunksJson))
    ) {
      const [updated] = await db
        .update(articles)
        .set({
          normalizedText: freshNormalized,
          chunksJson: freshChunks,
          updatedAt: new Date(),
        })
        .where(eq(articles.id, articleRecord.id))
        .returning();
      if (updated) articleRecord = updated;
    }

    const chunks = freshChunks.length > 0 ? freshChunks : articleRecord.chunksJson;

    const wavFilename = `${articleRecord.slug}__${speakerRecord.speakerCode}.wav`;
    const targetPath = path.join(AUDIO_STORAGE_DIR, wavFilename);
    const metaPath = audioMetaPath(AUDIO_STORAGE_DIR, wavFilename);
    // رفع باگ مدل B: پیش‌فرض تک‌صدا — انگلیسی با همان صدای اصلی خوانده می‌شود
    const rawMode = String(body.voiceMode ?? body.voice_mode ?? "unified-main");
    const voiceMode: VoiceMode =
      rawMode === "dual" || rawMode === "unified-multilingual"
        ? rawMode
        : "unified-main";
    const voicePlan = resolveVoicePlan(
      speakerRecord.speakerCode,
      speakerRecord.gender,
      voiceMode
    );
    const voice = voicePlan.faVoice;
    const enVoice = voicePlan.enVoice;
    const calibratedPitch = pitchOffsetFor(
      speakerRecord.basePitchHz,
      speakerRecord.gender
    );
    // پرسونای صوتی: ورودی درخواست > پرسونای ذخیره‌شده گوینده > پیش‌فرض
    const requestedPersona = String(body.persona ?? "").trim();
    const personaId = isValidPersonaId(requestedPersona)
      ? requestedPersona
      : speakerRecord.voicePersona || "natural";
    const persona = getVoicePersona(personaId);
    const requestedText = chunks.join(" ");

    // ۱. تولید دوزبانه تک‌صدا با موتور مرکزی StyleTTS 2 (فارسی + اعداد دقیق + انگلیسی با همان صدا)
    const human = await generateHumanVoice({
      text: requestedText,
      output: targetPath,
      voice,
      enVoice,
      gender: speakerRecord.gender,
      voiceMode,
      unifiedVoice: voicePlan.unifiedVoice ?? undefined,
      persona: persona.id,
      speed,
      pitchHz: calibratedPitch,
      alpha,
      beta,
      diffusionSteps,
      embeddingScale,
      metaJson: metaPath,
      allowPartial: requestedText.length > 520,
      attempts: 3,
      timeoutMs: adaptiveTimeoutMs(requestedText),
    });

    const warnings: string[] = [];
    let degraded = false;
    let fallbackReason: string | null = null;
    let spokenChars = 0;
    let missingChunks: string[] = [];

    const synth: {
      durationSec: number;
      sampleRate: number;
      fileSizeBytes: number;
      rtf: number;
      waveformPeaks: number[];
      engine: string;
      voice: string;
    } = (() => {
      if (human?.ok && fs.existsSync(targetPath)) {
        const analysis = analyzeWavFile(targetPath);
        spokenChars = Number(human.spoken_text_chars ?? 0);
        missingChunks = human.missing_chunks ?? [];
        if (missingChunks.length > 0) {
          warnings.push(
            `${missingChunks.length} قطعه از متن با وجود تلاش مجدد خوانده نشد و در فایل صوتی وجود ندارد.`
          );
        }
        if (analysis.silent || analysis.durationSec < 1) {
          warnings.push("فایل تولیدشده معتبر نیست (بی‌صدا یا بسیار کوتاه).");
        }
        installHumanVoiceAsset(AUDIO_STORAGE_DIR, wavFilename, {
          engine: "styletts2-human",
          architecture: "StyleTTS 2 (Style Diffusion + PL-BERT + iSTFTNet)",
          style_vector_dim: 256,
          bilingual: true,
          english_preserved: true,
          voice_mode: voiceMode,
          unified_voice: human.unified_voice ?? voicePlan.unifiedVoice,
          persona: human.persona ?? persona.id,
          persona_label: human.persona_label ?? persona.labelFa,
          persona_profile:
            human.persona_profile ?? {
              speed: persona.speed,
              alpha: persona.alpha,
              beta: persona.beta,
              diffusion_steps: persona.diffusionSteps,
              embedding_scale: persona.embeddingScale,
              cadence_ms: persona.cadence,
              contour: persona.contour,
              timbre: persona.timbre,
              loudness: persona.loudness,
            },
          voice_consistency: human.voice_consistency ?? (voicePlan.unified ? 1 : 0.45),
          f0_mean_hz: human.f0_mean_hz,
          voice,
          en_voice: human.en_voice ?? enVoice,
          alpha,
          beta,
          diffusion_steps: diffusionSteps,
          embedding_scale: embeddingScale,
          durationSec: analysis.durationSec,
          sampleRate: analysis.sampleRate,
          source: "runtime",
          requested_chars: requestedText.length,
          requested_speed: speed,
          calibrated_pitch_hz: calibratedPitch,
        });
        return {
          durationSec: analysis.durationSec,
          sampleRate: analysis.sampleRate,
          fileSizeBytes: analysis.fileSizeBytes,
          rtf: 0.08,
          waveformPeaks: analysis.waveformPeaks,
          engine: "styletts2-human",
          voice,
        };
      }

      degraded = true;
      fallbackReason = human?.error ?? "human_engine_unavailable";
      const previousMeta = readAudioMeta(AUDIO_STORAGE_DIR, wavFilename);
      const previous = fs.existsSync(targetPath)
        ? analyzeWavFile(targetPath)
        : null;

      if (
        previous?.valid &&
        !previous.silent &&
        isHumanEngine(previousMeta?.engine)
      ) {
        warnings.push(
          `موتور صدای انسانی در دسترس نبود (${fallbackReason})؛ فایل انسانی قبلی حفظ شد اما متن تازه خوانده نشد.`
        );
        return {
          durationSec: previous.durationSec,
          sampleRate: previous.sampleRate,
          fileSizeBytes: previous.fileSizeBytes,
          rtf: 0.08,
          waveformPeaks: previous.waveformPeaks,
          engine: "styletts2-human",
          voice: previousMeta!.voice,
        };
      }

      warnings.push(
        `موتور صدای انسانی ناموفق بود (${fallbackReason})؛ خروجی با موتور محلی فورمانت ساخته شد و کلمات متن خوانده نمی‌شوند.`
      );
      const fallback = synthesizeProsodicWavFile({
        chunks,
        outputDir: AUDIO_STORAGE_DIR,
        filename: wavFilename,
        basePitchHz: speakerRecord.basePitchHz,
        speed,
        temperature,
      });
      installHumanVoiceAsset(AUDIO_STORAGE_DIR, wavFilename, {
        engine: "local-formant-fallback",
        voice: "offline-oscillator",
        durationSec: fallback.durationSec,
        sampleRate: fallback.sampleRate,
        source: "fallback",
        fallback_reason: fallbackReason,
        requested_chars: requestedText.length,
        requested_speed: speed,
      });
      return {
        durationSec: fallback.durationSec,
        sampleRate: fallback.sampleRate,
        fileSizeBytes: fallback.fileSizeBytes,
        rtf: fallback.rtf,
        waveformPeaks: fallback.waveformPeaks,
        engine: "local-formant-fallback",
        voice: "offline-oscillator",
      };
    })();

    // جایگزینی تمیز در صورت بازتولید همان گوینده روی همان مقاله
    await db
      .delete(synthesisJobs)
      .where(
        and(
          eq(synthesisJobs.articleId, articleRecord.id),
          eq(synthesisJobs.speakerId, speakerRecord.id)
        )
      );

    const [createdJob] = await db
      .insert(synthesisJobs)
      .values({
        articleId: articleRecord.id,
        speakerId: speakerRecord.id,
        status: degraded ? "degraded" : "completed",
        speed,
        alpha,
        beta,
        diffusionSteps,
        embeddingScale,
        temperature,
        repetitionPenalty,
        audioFilename: wavFilename,
        durationSec: synth.durationSec,
        sampleRate: synth.sampleRate,
        fileSizeBytes: synth.fileSizeBytes,
        chunkCount: chunks.length,
        rtf: synth.rtf,
        lufs: -16.0,
        waveformPeaks: synth.waveformPeaks,
      })
      .returning();

    return NextResponse.json(
      {
        message: degraded
          ? "فایل صوتی ذخیره شد، اما موتور صدای انسانی ناموفق بود؛ متن درخواستی به‌درستی خوانده نشده است."
          : "فایل صوتی مقاله با صدای واقعی انسان تولید و روی سرور لوکال ذخیره شد.",
        degraded,
        warnings,
        fallbackReason,
        textFidelity: {
          requestedChars: requestedText.length,
          spokenChars,
          coverage:
            requestedText.length > 0
              ? Number(
                  Math.min(1, spokenChars / Math.max(1, requestedText.length)).toFixed(3)
                )
              : 0,
          faSpans: human?.fa_spans ?? 0,
          enSpans: human?.en_spans ?? 0,
          englishTermsSpoken: human?.english_terms_spoken ?? [],
          missingChunks,
        },
        article: articleRecord,
        track: {
          ...createdJob,
          speakerCode: speakerRecord.speakerCode,
          speakerName: speakerRecord.displayName,
          speakerRole: speakerRecord.roleTitle,
          speakerMode: speakerRecord.mode,
          engine: synth.engine,
          voice: synth.voice,
          enVoice: human?.en_voice ?? enVoice,
          bilingual: Boolean(human?.bilingual),
          enSpans: human?.en_spans ?? 0,
          voiceMode,
          persona: human?.persona ?? persona.id,
          personaLabel: human?.persona_label ?? persona.labelFa,
          unifiedVoice: human?.unified_voice ?? voicePlan.unifiedVoice,
          voiceConsistency:
            human?.voice_consistency ?? (voicePlan.unified ? 1 : 0.45),
          audioUrl: `/api/audio/${encodeURIComponent(wavFilename)}?t=${Date.now()}`,
        },
        widgetEndpoint: `/api/widget/articles/${articleRecord.slug}`,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Synthesis error:", error);
    return NextResponse.json(
      { error: "خطا در پردازش متن و تولید فایل صوتی." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const articleId = searchParams.get("articleId");
    const jobId = searchParams.get("jobId");

    if (jobId) {
      const [job] = await db
        .select()
        .from(synthesisJobs)
        .where(eq(synthesisJobs.id, Number(jobId)));
      if (job) {
        const filePath = path.join(AUDIO_STORAGE_DIR, path.basename(job.audioFilename));
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        await db.delete(synthesisJobs).where(eq(synthesisJobs.id, job.id));
      }
      return NextResponse.json({ deleted: true });
    }

    if (articleId) {
      const id = Number(articleId);
      const jobs = await db
        .select()
        .from(synthesisJobs)
        .where(eq(synthesisJobs.articleId, id));
      for (const job of jobs) {
        const filePath = path.join(AUDIO_STORAGE_DIR, path.basename(job.audioFilename));
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }
      await db.delete(articles).where(eq(articles.id, id));
      return NextResponse.json({ deleted: true });
    }

    return NextResponse.json(
      { error: "شناسه مقاله یا فایل صوتی ارسال نشده است." },
      { status: 400 }
    );
  } catch (error) {
    console.error("Delete synthesis error:", error);
    return NextResponse.json(
      { error: "حذف فایل صوتی با خطا مواجه شد." },
      { status: 500 }
    );
  }
}
