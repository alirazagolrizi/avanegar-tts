import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { articles, speakers, synthesisJobs } from "@/db/schema";
import { ensureSeeded } from "@/lib/seed";
import { AUDIO_STORAGE_DIR } from "@/lib/audio-engine";
import { readAudioMeta } from "@/lib/human-voice-assets";

export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    await ensureSeeded();
    const { slug } = await context.params;
    const cleanSlug = decodeURIComponent(slug).trim();

    const [article] = await db
      .select()
      .from(articles)
      .where(eq(articles.slug, cleanSlug));

    if (!article) {
      return NextResponse.json(
        { error: "نسخه صوتی برای این مقاله ثبت نشده است." },
        { status: 404, headers: CORS_HEADERS }
      );
    }

    const [jobs, speakerList] = await Promise.all([
      db
        .select()
        .from(synthesisJobs)
        .where(eq(synthesisJobs.articleId, article.id)),
      db.select().from(speakers),
    ]);

    const speakerMap = new Map(speakerList.map((s) => [s.id, s]));

    const priority = (code: string) =>
      code === "dorsa_radmehr" ? 0 : code === "sara_tehrani" ? 1 : code === "arash_rad" ? 2 : 3;

    const voices = jobs
      .map((job) => {
        const sp = speakerMap.get(job.speakerId);
        const meta = readAudioMeta(AUDIO_STORAGE_DIR, job.audioFilename);
        return {
          speaker_id: sp?.speakerCode ?? `sp_${job.speakerId}`,
          speaker_label: sp?.displayName ?? "گوینده",
          speaker_role: sp?.roleTitle ?? "",
          mode: sp?.mode ?? "zero_shot",
          audio_url: `/api/audio/${encodeURIComponent(job.audioFilename)}`,
          duration_sec: job.durationSec,
          sample_rate: job.sampleRate,
          waveform_peaks: job.waveformPeaks,
          engine: meta?.engine ?? "styletts2-human",
          voice: meta?.voice ?? "fa-IR-DilaraNeural",
          en_voice: meta?.en_voice,
          bilingual: Boolean(meta?.bilingual),
        };
      })
      .sort((a, b) => priority(a.speaker_id) - priority(b.speaker_id));

    return NextResponse.json(
      {
        article_slug: article.slug,
        article_title: article.title,
        publisher_name: article.publisherName,
        category: article.category,
        voices,
      },
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (error) {
    console.error("Widget manifest error:", error);
    return NextResponse.json(
      { error: "خطا در واکشی مانیفست صوتی مقاله." },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
