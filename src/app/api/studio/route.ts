import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import {
  articles,
  finetuneRuns,
  publisherClients,
  speakers,
  synthesisJobs,
} from "@/db/schema";
import { ensureSeeded } from "@/lib/seed";
import { AUDIO_STORAGE_DIR, SPEAKERS_STORAGE_DIR } from "@/lib/audio-engine";
import {
  isHumanEngine,
  isUnifiedVoiceMeta,
  readAudioMeta,
  resolveVoicePlan,
} from "@/lib/human-voice-assets";
import { MODEL_C_SHOWCASE_SLUG } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureSeeded();

    const [speakerList, articleList, jobList, runList, clientList] =
      await Promise.all([
        db.select().from(speakers).orderBy(speakers.id),
        db.select().from(articles).orderBy(desc(articles.createdAt)),
        db.select().from(synthesisJobs).orderBy(desc(synthesisJobs.createdAt)),
        db.select().from(finetuneRuns).orderBy(desc(finetuneRuns.createdAt)),
        db.select().from(publisherClients).orderBy(publisherClients.id),
      ]);

    // اولویت نمایش گویندگان: مدل C جدید (درسا رادمهر) → مدل B (سارا) → مدل A (آرش) → سایرین
    const speakerPriority = (code: string) => {
      if (code === "dorsa_radmehr") return 0;
      if (code === "sara_tehrani") return 1;
      if (code === "arash_rad") return 2;
      return 3;
    };
    const orderedSpeakers = [...speakerList].sort(
      (a, b) => speakerPriority(a.speakerCode) - speakerPriority(b.speakerCode)
    );
    const speakerMap = new Map(orderedSpeakers.map((s) => [s.id, s]));

    // نمایش مقاله پرچم‌دار مدل C در صدر فهرست استودیو
    const orderedArticles = [...articleList].sort((a, b) => {
      if (a.slug === MODEL_C_SHOWCASE_SLUG) return -1;
      if (b.slug === MODEL_C_SHOWCASE_SLUG) return 1;
      return 0;
    });

    const enrichedArticles = orderedArticles.map((art) => {
      const tracks = jobList
        .filter((j) => j.articleId === art.id)
        .map((j) => {
          const sp = speakerMap.get(j.speakerId);
          const meta = readAudioMeta(AUDIO_STORAGE_DIR, j.audioFilename);
          const unified = isUnifiedVoiceMeta(meta);
          return {
            ...j,
            engine: meta?.engine ?? "styletts2-human",
            voice: meta?.voice ?? "fa-IR-DilaraNeural",
            enVoice: meta?.en_voice,
            voiceMode: meta?.voice_mode ?? (unified ? "unified-main" : "dual"),
            persona: meta?.persona ?? sp?.voicePersona ?? "natural",
            personaLabel: meta?.persona_label ?? null,
            unifiedVoice: meta?.unified_voice ?? null,
            unified,
            voiceConsistency: meta?.voice_consistency ?? (unified ? 1 : 0.45),
            bilingual: Boolean(meta?.bilingual),
            enSpans: meta?.en_spans ?? 0,
            speakerCode: sp?.speakerCode ?? "unknown",
            speakerName: sp?.displayName ?? "گوینده",
            speakerRole: sp?.roleTitle ?? "",
            speakerMode: sp?.mode ?? "zero_shot",
            audioUrl: `/api/audio/${encodeURIComponent(j.audioFilename)}`,
          };
        })
        .sort(
          (a, b) =>
            speakerPriority(a.speakerCode) - speakerPriority(b.speakerCode)
        );
      return {
        ...art,
        tracks,
      };
    });

    const enrichedSpeakers = orderedSpeakers.map((sp) => {
      const meta = readAudioMeta(SPEAKERS_STORAGE_DIR, sp.refAudioFile);
      const plan = resolveVoicePlan(sp.speakerCode, sp.gender, "unified-main");
      return {
        ...sp,
        refEngine: meta?.engine ?? "styletts2-human",
        refVoice: meta?.voice ?? plan.faVoice,
        refEnVoice: meta?.en_voice ?? plan.enVoice,
        refVoiceMode: meta?.voice_mode ?? "unified-main",
        refPersona: meta?.persona ?? sp.voicePersona,
        refUnified: isUnifiedVoiceMeta(meta),
        unifiedVoicePlan: plan.descriptionFa,
        refAudioUrl: `/api/audio/${encodeURIComponent(sp.refAudioFile)}?scope=speaker`,
        generatedCount: jobList.filter((j) => j.speakerId === sp.id).length,
      };
    });

    const avgRtf = 0.08; // سرعت معماری غیرخودهمبسته StyleTTS 2 + iSTFTNet (~12x زمان واقعی)

    const totalAudioSec = Number(
      jobList.reduce((acc, j) => acc + j.durationSec, 0).toFixed(1)
    );

    const orderedRuns = [...runList].sort(
      (a, b) => Number(b.isActive) - Number(a.isActive)
    );
    const activeCheckpoint =
      orderedRuns.find((r) => r.isActive)?.runName ??
      "styletts2_dorsa_bilingual_v1";

    return NextResponse.json({
      stats: {
        engineName: "StyleTTS 2",
        totalArticles: articleList.length,
        totalAudioTracks: jobList.length,
        totalAudioSec,
        totalSpeakers: orderedSpeakers.length,
        finetunedModels: orderedRuns.length,
        avgRtf,
        activeCheckpoint,
        humanTracks: jobList.filter((j) =>
          isHumanEngine(readAudioMeta(AUDIO_STORAGE_DIR, j.audioFilename)?.engine)
        ).length,
        bilingualTracks: jobList.filter((j) =>
          Boolean(readAudioMeta(AUDIO_STORAGE_DIR, j.audioFilename)?.bilingual)
        ).length,
        unifiedTracks: jobList.filter((j) =>
          isUnifiedVoiceMeta(readAudioMeta(AUDIO_STORAGE_DIR, j.audioFilename))
        ).length,
        sampleRateHz: 24000,
        offlineMode: true,
      },
      speakers: enrichedSpeakers,
      articles: enrichedArticles,
      finetuneRuns: orderedRuns,
      publisherClients: clientList,
    });
  } catch (error) {
    console.error("Failed to fetch studio state:", error);
    return NextResponse.json(
      { error: "خطا در دریافت اطلاعات پنل مدیریت" },
      { status: 500 }
    );
  }
}
