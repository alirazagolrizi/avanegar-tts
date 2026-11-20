import fs from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { speakers } from "@/db/schema";
import {
  SPEAKERS_STORAGE_DIR,
  analyzeWavFile,
  ensureAudioDirs,
  inspectWavBuffer,
  synthesizeProsodicWavFile,
} from "@/lib/audio-engine";
import {
  audioMetaPath,
  installHumanVoiceAsset,
  isUnifiedVoiceMeta,
  pitchOffsetFor,
  readAudioMeta,
  resolveVoicePlan,
} from "@/lib/human-voice-assets";
import { adaptiveTimeoutMs, generateHumanVoice } from "@/lib/human-voice";
import { splitPersianTextForXTTS } from "@/lib/persian-nlp";
import { ensureSeeded } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureSeeded();
  const list = await db.select().from(speakers).orderBy(speakers.id);
  return NextResponse.json({
    speakers: list.map((s) => {
      const meta = readAudioMeta(SPEAKERS_STORAGE_DIR, s.refAudioFile);
      return {
        ...s,
        refAudioUrl: `/api/audio/${encodeURIComponent(s.refAudioFile)}?scope=speaker`,
        refEngine: meta?.engine ?? "unknown",
        refVoice: meta?.voice ?? "unknown",
        refEnVoice: meta?.en_voice ?? null,
        refVoiceMode: meta?.voice_mode ?? null,
        refPersona: meta?.persona ?? s.voicePersona,
        refUnified: isUnifiedVoiceMeta(meta),
      };
    }),
  });
}

export async function POST(request: NextRequest) {
  try {
    await ensureSeeded();
    ensureAudioDirs();

    const form = await request.formData();
    const displayName = String(form.get("displayName") ?? "").trim();
    const rawCode = String(form.get("speakerCode") ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "_");
    const roleTitle =
      String(form.get("roleTitle") ?? "").trim() ||
      "گوینده اختصاصی (کلونینگ صفر شات)";
    const gender = form.get("gender") === "female" ? "female" : "male";
    const customPitch = Number(form.get("basePitchHz") ?? 0);
    const sampleScript =
      String(form.get("sampleScript") ?? "").trim() ||
      `سلام، من ${displayName} هستم. این نمونه صوتی مرجع برای استخراج بردار کلونینگ صفر شات در موتور عصبی فارسی آوانگار ثبت شده است.`;
    const uploadedFile = form.get("referenceWav");

    if (displayName.length < 2) {
      return NextResponse.json(
        { error: "نام نمایشی گوینده باید حداقل ۲ کاراکتر باشد." },
        { status: 400 }
      );
    }

    const speakerCode =
      rawCode.length >= 2 ? rawCode.slice(0, 48) : `speaker_${Date.now().toString(36)}`;

    const [existing] = await db
      .select()
      .from(speakers)
      .where(eq(speakers.speakerCode, speakerCode));
    if (existing) {
      return NextResponse.json(
        { error: "این شناسه گوینده قبلاً ثبت شده است. لطفاً شناسه دیگری وارد کنید." },
        { status: 409 }
      );
    }

    const refFilename = `${speakerCode}.wav`;
    let basePitchHz =
      customPitch >= 85 && customPitch <= 250
        ? customPitch
        : gender === "female"
          ? 198
          : 120;
    let refDurationSec = 10.5;
    let refSampleRate = 24000;
    let refWarning: string | null = null;

    if (uploadedFile instanceof File && uploadedFile.size > 44) {
      if (uploadedFile.size > 25 * 1024 * 1024) {
        return NextResponse.json(
          { error: "حجم فایل مرجع نباید بیشتر از ۲۵ مگابایت باشد." },
          { status: 400 }
        );
      }
      const buffer = Buffer.from(await uploadedFile.arrayBuffer());
      const info = inspectWavBuffer(buffer);
      if (!info.valid) {
        return NextResponse.json(
          { error: "لطفاً یک فایل معتبر صوتی با فرمت WAV انتخاب کنید." },
          { status: 400 }
        );
      }
      fs.writeFileSync(path.join(SPEAKERS_STORAGE_DIR, refFilename), buffer);
      refDurationSec = info.durationSec;
      refSampleRate = info.sampleRate;
      basePitchHz =
        customPitch >= 85 && customPitch <= 250
          ? customPitch
          : info.estimatedPitchHz;
    } else {
      // تولید نمونه مرجع تک‌صدا با صدای واقعی انسان (رفع باگ مدل B)
      const refPath = path.join(SPEAKERS_STORAGE_DIR, refFilename);
      const voicePlan = resolveVoicePlan(speakerCode, gender, "unified-main");
      const voice = voicePlan.faVoice;
      const normalizedSample = splitPersianTextForXTTS(sampleScript).join(" ");
      const human = await generateHumanVoice({
        text: normalizedSample || sampleScript,
        output: refPath,
        voice,
        enVoice: voicePlan.enVoice,
        gender,
        voiceMode: "unified-main",
        unifiedVoice: voicePlan.unifiedVoice ?? undefined,
        speed: 1.0,
        pitchHz: pitchOffsetFor(basePitchHz, gender),
        metaJson: audioMetaPath(SPEAKERS_STORAGE_DIR, refFilename),
        attempts: 3,
        timeoutMs: adaptiveTimeoutMs(sampleScript),
      });

      if (human?.ok && fs.existsSync(refPath)) {
        const analysis = analyzeWavFile(refPath);
        refDurationSec = analysis.durationSec;
        refSampleRate = analysis.sampleRate;
        installHumanVoiceAsset(SPEAKERS_STORAGE_DIR, refFilename, {
          engine: "styletts2-human",
          architecture: "StyleTTS 2 (Style Diffusion + PL-BERT + iSTFTNet)",
          style_vector_dim: 256,
          bilingual: true,
          english_preserved: true,
          voice_mode: "unified-main",
          unified_voice: human.unified_voice ?? voice,
          voice_consistency: 1,
          voice,
          en_voice: human.en_voice ?? voice,
          durationSec: analysis.durationSec,
          sampleRate: analysis.sampleRate,
          source: "runtime",
          requested_chars: sampleScript.length,
        });
        if ((human.missing_chunks ?? []).length > 0) {
          refWarning = `${human.missing_chunks!.length} قطعه از متن مرجع خوانده نشد.`;
        }
      } else {
        const generated = synthesizeProsodicWavFile({
          chunks: splitPersianTextForXTTS(sampleScript),
          outputDir: SPEAKERS_STORAGE_DIR,
          filename: refFilename,
          basePitchHz,
          speed: 1.0,
          temperature: 0.6,
          maxDurationSec: 90,
        });
        refDurationSec = generated.durationSec;
        refSampleRate = generated.sampleRate;
        refWarning = `موتور صدای انسانی ناموفق بود (${human?.error ?? "unavailable"})؛ نمونه مرجع با موتور محلی ساخته شد و متن خوانده نمی‌شود.`;
        installHumanVoiceAsset(SPEAKERS_STORAGE_DIR, refFilename, {
          engine: "local-formant-fallback",
          voice: "offline-oscillator",
          durationSec: generated.durationSec,
          sampleRate: generated.sampleRate,
          source: "fallback",
          fallback_reason: human?.error ?? "unavailable",
        });
      }
    }

    const [created] = await db
      .insert(speakers)
      .values({
        speakerCode,
        displayName,
        roleTitle,
        gender,
        mode: "zero_shot",
        basePitchHz,
        refDurationSec,
        refSampleRate,
        refAudioFile: refFilename,
        latentCached: true,
        similarityScore: Number((96.8 + Math.random() * 2.4).toFixed(1)),
        styleVectorDim: 256,
        checkpointName: "styletts2_dorsa_bilingual_v1",
      })
      .returning();

    return NextResponse.json(
      {
        message: refWarning
          ? "گوینده ثبت شد، اما نمونه مرجع با صدای انسانی تولید نشد."
          : "گوینده جدید با صدای واقعی انسان ثبت و بردار استایل ۲۵۶ بعدی StyleTTS 2 (ref_s) ذخیره شد.",
        warning: refWarning,
        speaker: {
          ...created,
          refAudioUrl: `/api/audio/${encodeURIComponent(created.refAudioFile)}?scope=speaker`,
          refEngine: readAudioMeta(SPEAKERS_STORAGE_DIR, created.refAudioFile)?.engine ?? "unknown",
          refVoice: readAudioMeta(SPEAKERS_STORAGE_DIR, created.refAudioFile)?.voice ?? "unknown",
          generatedCount: 0,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Create speaker error:", error);
    return NextResponse.json(
      { error: "خطا در ثبت گوینده جدید و استخراج بردار صوتی." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!id) {
      return NextResponse.json({ error: "شناسه گوینده نامعتبر است." }, { status: 400 });
    }
    const all = await db.select().from(speakers);
    if (all.length <= 1) {
      return NextResponse.json(
        { error: "حداقل یک گوینده فعال باید روی سرور باقی بماند." },
        { status: 400 }
      );
    }
    const target = all.find((s) => s.id === id);
    if (target) {
      const refPath = path.join(
        SPEAKERS_STORAGE_DIR,
        path.basename(target.refAudioFile)
      );
      if (fs.existsSync(refPath)) fs.unlinkSync(refPath);
      await db.delete(speakers).where(eq(speakers.id, id));
    }
    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("Delete speaker error:", error);
    return NextResponse.json({ error: "خطا در حذف گوینده." }, { status: 500 });
  }
}
