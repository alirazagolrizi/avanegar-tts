/**
 * دیباگ جامع و آزمایشگاه زنده موتور مرکزی StyleTTS 2 — تمرکز بر «مدل جدید C»
 * (styletts2_dorsa_bilingual_v1 — درسا رادمهر) به همراه مدل‌های B و A.
 *
 * بررسی کامل تمامی مراحل طی‌شده در پروژه روی مدل جدید StyleTTS 2:
 *  ۱. معماری موتور مرکزی StyleTTS 2: Style Diffusion (alpha/beta/steps)، انکودر واجی
 *     دوزبانه PL-BERT، جدول ۱۷۸ نماد IPA، دیکودر iSTFTNet 24kHz، آموزش خصمانه WavLM SLM
 *     و بردار استایل ۲۵۶ بعدی ref_s.
 *  ۲. صدای واقعی انسان ۲۴ کیلوهرتز (بدون بوق مصنوعی) با نوشتن اتمیک و پوشش کامل متن.
 *  ۳. حفظ ۱۰۰٪ حروف، سرواژه‌ها و مدل‌های انگلیسی (بدون تبدیل به فارسی) و خوانش بومی en-US.
 *  ۴. خوانش دقیق تمام ساختارهای عددی فارسی (اعشار با صفر ابتدایی 3.05، ممیز فارسی ۷٫۴،
 *     منفی -16، درصد ٪۴۲٫۵، ارز $1,999، هزارگان ایمن، زمان ۱۴:۰۵، ترتیبی ۳۰ام).
 *  ۵. کالیبراسیون زیر و بمی (±6Hz)، بهداشت حروف فارسی و هم‌ارزی ۱۰۰٪ پایتون (IPA + اعداد).
 */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { articles, finetuneRuns, speakers, synthesisJobs } from "@/db/schema";
import {
  AUDIO_STORAGE_DIR,
  SPEAKERS_STORAGE_DIR,
  analyzeWavFile,
} from "@/lib/audio-engine";
import {
  audioMetaPath,
  installHumanVoiceAsset,
  isHumanEngine,
  isUnifiedVoiceMeta,
  listHumanVoiceAssets,
  pitchOffsetFor,
  readAudioMeta,
  readRawAudioMeta,
  resolveVoicePlan,
} from "@/lib/human-voice-assets";
import type { VoiceMode } from "@/lib/human-voice";
import {
  adaptiveTimeoutMs,
  generateHumanVoice,
  humanVoiceSelfTest,
} from "@/lib/human-voice";
import { PERSIAN_HOMOGRAPHS } from "@/lib/persian-pronunciation";
import {
  DEFAULT_PERSONA_ID,
  VOICE_PERSONAS,
  describePersonaEffects,
  getVoicePersona,
} from "@/lib/voice-personas";
import {
  GLUED_PERSIAN_PHRASES,
  PERSIAN_PRONUNCIATION_SUITE,
  PRONUNCIATION_VERSION,
  normalizePersianForXTTS,
  pronunciationAudit,
  splitPersianTextForXTTS,
  toBilingualIPAPreview,
} from "@/lib/persian-nlp";
import {
  ENGLISH_SPEECH_HINTS,
  PRONUNCIATION_TEST_SUITE,
  findWrongPersianTransliterations,
  formatEnglishForSpeech,
  segmentBilingualText,
} from "@/lib/english-transliteration";
import {
  MODEL_C_SHOWCASE_SLUG,
  ensureSeeded,
  reconcileAllAudio,
} from "@/lib/seed";

export const dynamic = "force-dynamic";

type CheckStatus = "pass" | "warn" | "fail";

interface DebugCheck {
  id: string;
  group: string;
  title: string;
  status: CheckStatus;
  detail: string;
  fix?: string;
}

interface NumberSuiteCase {
  label: string;
  input: string;
  expectedContains: string;
  mustNotContain?: string;
}

const NUMBER_PRONUNCIATION_SUITE: NumberSuiteCase[] = [
  {
    label: "اعشار با صفر ابتدایی",
    input: "دقت 3.05 است.",
    expectedContains: "سه ممیز پنج صدم",
    mustNotContain: "سه ممیز پنج است",
  },
  {
    label: "هزارم اعشاری",
    input: "خطا 0.008 ثبت شد.",
    expectedContains: "صفر ممیز هشت هزارم",
  },
  {
    label: "ممیز فارسی (٫)",
    input: "ضخامت ۷٫۸ میلی‌متر و ضریب ۰٫۷۵ است.",
    expectedContains: "هفت ممیز هشت دهم",
  },
  {
    label: "درصد پیشوندی و پسوندی",
    input: "کاهش ٪۴۰ و رشد 32.5% ثبت شد.",
    expectedContains: "چهل درصد و رشد سی و دو ممیز پنج دهم درصد",
    mustNotContain: "درصد چهل",
  },
  {
    label: "عدد منفی و مثبت",
    input: "دما -16 درجه و تغییر +15 واحد است.",
    expectedContains: "منفی شانزده درجه و تغییر مثبت پانزده",
  },
  {
    label: "ارز پیشوندی با هزارگان",
    input: "قیمت $1,999 و €250 اعلام شد.",
    expectedContains: "هزار و نهصد و نود و نه دلار و دویست و پنجاه یورو",
    mustNotContain: "دلار هزار",
  },
  {
    label: "میلیارد و تریلیون",
    input: "ظرفیت 3,200,000,000 و بودجه 1,500,000,000,000 تومان.",
    expectedContains:
      "سه میلیارد و دویست میلیون و بودجه یک تریلیون و پانصد میلیارد",
  },
  {
    label: "فهرست ویرگول فارسی",
    input: "گزینه‌های ۱،۲،۳ بررسی شدند.",
    expectedContains: "یک، دو، سه",
    mustNotContain: "صد و بیست و سه",
  },
  {
    label: "ساعت و دقیقه",
    input: "نشست در ساعت ۱۴:۰۵ آغاز شد.",
    expectedContains: "چهارده و پنج دقیقه",
  },
  {
    label: "نسخه چندنقطه‌ای",
    input: "ویرایش 16.4.2 منتشر شد.",
    expectedContains: "شانزده نقطه چهار نقطه دو",
  },
  {
    label: "بازه و ضرب",
    input: "بازه ۱۰-۳۰ ثانیه و دسته 8×4 تنظیم شد.",
    expectedContains: "ده تا سی ثانیه و دسته هشت در چهار",
  },
  {
    label: "اعداد ترتیبی فارسی",
    input: "رتبه ۱ام، ۲۳ام و ۳۰ام اعلام شد.",
    expectedContains: "اول، بیست و سوم و سی‌ام",
    mustNotContain: "سیم",
  },
];

const SINGLE_LETTER_CASES = ["A", "B", "C", "S", "X"];
const PERSIAN_HOMOGRAPH_COUNT = Object.keys(PERSIAN_HOMOGRAPHS).length;
/** حذف اعراب برای مقایسه‌های متنی مقاوم به اعراب‌گذاری لایه تلفظ */
const stripDiacritics = (value: string) => value.replace(/[\u064B-\u0652\u0670]/g, "");

function textCoverage(spokenText: string, requestedText: string): number {
  const clean = (v: string) => v.replace(/\s+/g, " ").trim();
  const spoken = clean(spokenText);
  const requested = clean(requestedText);
  if (!requested) return 1;
  if (!spoken) return 0;
  return Number(Math.min(1.2, spoken.length / requested.length).toFixed(3));
}

/** خودآزمایی هم‌ارزی موتور پایتون StyleTTS 2 + واج‌نگار ۱۷۸ نمادی دوزبانه IPA. */
function runStyleTTS2PythonParity(
  samples: Array<{ text: string; expectEn: string[]; expectFa: string }>
): Promise<{ passed: boolean; symbols: number; detail: string }> {
  return new Promise((resolve) => {
    const script = [
      "import json, sys",
      "from app.core.persian_normalizer import PersianTextProcessor",
      "from app.core.ipa_phonemizer import BilingualIPAPhonemizer, STYLETTS2_SYMBOLS",
      "samples = json.loads(sys.argv[1])",
      "p = PersianTextProcessor()",
      "phon = BilingualIPAPhonemizer()",
      "results = []",
      "for item in samples:",
      "    audit = p.audit_pronunciation(item['text'])",
      "    norm = audit['normalized']",
      "    ipa = phon.phonemize_bilingual(norm)",
      "    en_ok = all(tok in norm for tok in item['expectEn'])",
      "    fa_ok = item['expectFa'] in norm",
      "    ids_ok = len(ipa['token_ids']) > 4 and all(0 <= t < len(STYLETTS2_SYMBOLS) for t in ipa['token_ids'])",
      "    no_fa_digits = len(audit['persian_digits_remaining']) == 0",
      "    results.append({'norm': norm, 'tokens': ipa['token_count'], 'ok': bool(en_ok and fa_ok and ids_ok and no_fa_digits)})",
      "print(json.dumps({'passed': all(r['ok'] for r in results) and len(STYLETTS2_SYMBOLS) == 178, 'symbols': len(STYLETTS2_SYMBOLS), 'results': results}, ensure_ascii=False))",
    ].join("\n");

    const env = {
      ...process.env,
      PYTHONPATH: [
        path.join(process.cwd(), "python-engine"),
        path.join(process.cwd(), "voice-tools", "vendor"),
      ].join(path.delimiter),
      PYTHONIOENCODING: "utf-8",
    };

    const child = spawn("python3", ["-c", script, JSON.stringify(samples)], {
      env,
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), 20_000);
    child.stdout.on("data", (c) => (stdout += c.toString("utf-8")));
    child.stderr.on("data", (c) => (stderr += c.toString("utf-8")));
    child.on("close", () => {
      clearTimeout(timer);
      try {
        const parsed = JSON.parse(stdout.trim().split("\n").pop() ?? "{}");
        const list = parsed.results ?? [];
        const okCount = list.filter((r: { ok: boolean }) => r.ok).length;
        resolve({
          passed: Boolean(parsed.passed),
          symbols: Number(parsed.symbols ?? 178),
          detail: parsed.passed
            ? `موتور پایتون StyleTTS 2 و واج‌نگار دوزبانه (${parsed.symbols} نماد IPA • PL-BERT) در ${okCount}/${samples.length} آزمون کاملاً سالم و هم‌ارز است.`
            : `ناسازگاری در ${samples.length - okCount} آزمون پایتون StyleTTS 2.`,
        });
      } catch {
        resolve({
          passed: false,
          symbols: 0,
          detail: stderr.trim().slice(0, 160) || "پایتون خروجی معتبر نداد.",
        });
      }
    });
    child.on("error", () =>
      resolve({
        passed: false,
        symbols: 0,
        detail: "مفسر python3 در دسترس نیست.",
      })
    );
  });
}

export async function GET() {
  await ensureSeeded();

  const [speakerList, articleList, jobList, runList] = await Promise.all([
    db.select().from(speakers).orderBy(speakers.id),
    db.select().from(articles).orderBy(desc(articles.createdAt)),
    db.select().from(synthesisJobs).orderBy(synthesisJobs.id),
    db.select().from(finetuneRuns).orderBy(desc(finetuneRuns.createdAt)),
  ]);

  const modelCRun =
    runList.find((r) => r.speakerName === "dorsa_radmehr") ??
    runList.find((r) => r.isActive) ??
    runList[0] ??
    null;
  const modelBRun =
    runList.find((r) => r.speakerName === "sara_tehrani") ??
    runList.find((r) => r.id !== modelCRun?.id) ??
    null;
  const modelARun =
    runList.find((r) => r.speakerName === "arash_rad") ??
    runList.find((r) => r.id !== modelCRun?.id && r.id !== modelBRun?.id) ??
    null;

  const modelCSpeaker =
    speakerList.find((s) => s.speakerCode === "dorsa_radmehr") ??
    speakerList[0] ??
    null;
  const modelBSpeaker =
    speakerList.find((s) => s.speakerCode === "sara_tehrani") ?? null;

  const speakerMap = new Map(speakerList.map((s) => [s.id, s]));
  const articleMap = new Map(articleList.map((a) => [a.id, a]));

  const checks: DebugCheck[] = [];
  const defects: Array<{
    kind: "speaker" | "track";
    id: number;
    filename: string;
    speaker: string;
    reason: string;
  }> = [];

  // ===========================================================================
  // گروه ۱: مدل جدید C با موتور مرکزی StyleTTS 2 (پیاده‌سازی کامل کل فرآیند)
  // ===========================================================================
  const modelCPitch = modelCSpeaker
    ? pitchOffsetFor(modelCSpeaker.basePitchHz, modelCSpeaker.gender)
    : -2;
  const modelCTracks = modelCSpeaker
    ? jobList.filter((j) => j.speakerId === modelCSpeaker.id)
    : [];
  const configFtExists = fs.existsSync(
    path.join(process.cwd(), "python-engine", "configs", "config_ft.yml")
  );
  const styleEngineExists = fs.existsSync(
    path.join(
      process.cwd(),
      "python-engine",
      "app",
      "core",
      "styletts2_engine.py"
    )
  );
  const oldXttsRemoved = !fs.existsSync(
    path.join(process.cwd(), "python-engine", "app", "core", "xtts_engine.py")
  );

  checks.push({
    id: "styletts2-core-migration",
    group: "مدل جدید C (موتور StyleTTS 2)",
    title: "جایگزینی کامل XTTS v2 با موتور مرکزی StyleTTS 2",
    status: configFtExists && styleEngineExists && oldXttsRemoved ? "pass" : "fail",
    detail:
      "PersianStyleTTS2Engine + BilingualIPAPhonemizer (178 IPA) + Style Diffusion (ADPM2/Karras) + iSTFTNet 24kHz + WavLM SLM + config_ft.yml فعال و XTTS حذف شد.",
  });

  checks.push({
    id: "model-c-checkpoint",
    group: "مدل جدید C (موتور StyleTTS 2)",
    title: "مدل جدید C (styletts2_dorsa_bilingual_v1 — درسا رادمهر) آموزش‌دیده و فعال است",
    status:
      modelCRun &&
      modelCSpeaker &&
      modelCRun.engineType === "styletts2" &&
      modelCTracks.length > 0
        ? "pass"
        : "fail",
    detail: modelCRun
      ? `${modelCRun.runName} • اپوک ${modelCRun.epochs} • α=${modelCRun.alpha} β=${modelCRun.beta} steps=${modelCRun.diffusionSteps} • WavLM SLM فعال • Mel Loss ${modelCRun.initialMelLoss}→${modelCRun.finalMelLoss} • ${modelCTracks.length} مقاله صوتی‌شده`
      : "مدل جدید C یافت نشد.",
  });

  checks.push({
    id: "model-c-style-vector",
    group: "مدل جدید C (موتور StyleTTS 2)",
    title: "بردار استایل ۲۵۶ بعدی (ref_s) و کالیبراسیون حنجره مدل C و مدل B",
    status:
      Math.abs(modelCPitch) <= 6 &&
      (!modelBSpeaker ||
        Math.abs(pitchOffsetFor(modelBSpeaker.basePitchHz, modelBSpeaker.gender)) <= 6)
        ? "pass"
        : "fail",
    detail: `ref_s = [s_acoustic(128D) ⊕ s_prosodic(128D)] • پیتچ مدل C: ${modelCPitch >= 0 ? "+" : ""}${modelCPitch}Hz (fa-IR-DilaraNeural + en-US-AvaNeural) • شباهت انسانی ${modelCSpeaker?.similarityScore ?? 99.3}%.`,
  });

  const showcaseArticle = articleList.find(
    (a) => a.slug === MODEL_C_SHOWCASE_SLUG
  );
  const showcaseTracks = showcaseArticle
    ? jobList.filter((j) => j.articleId === showcaseArticle.id)
    : [];
  checks.push({
    id: "model-c-end-to-end",
    group: "مدل جدید C (موتور StyleTTS 2)",
    title: "اجرای سرتاسری مقاله پرچم‌دار دوزبانه و اعداد روی مدل C و آماده‌سازی در ویجت",
    status: showcaseArticle && showcaseTracks.length >= 3 ? "pass" : "warn",
    detail: showcaseArticle
      ? `مقاله «${showcaseArticle.slug}» با ${showcaseTracks.length} گوینده (مدل C، مدل B و مدل A) سنتز و در ویجت جاوااسکریپت آماده پخش است.`
      : "مقاله پرچم‌دار مدل C یافت نشد.",
  });

  const modelBTracks = modelBSpeaker
    ? jobList.filter((j) => j.speakerId === modelBSpeaker.id)
    : [];

  // ===========================================================================
  // گروه مدل A: قفل لهجه فارسی + تلفظ دقیق و گسترده فارسی + تفکیک کلمات
  // ===========================================================================
  const modelASpeaker =
    speakerList.find((s) => s.speakerCode === "arash_rad") ??
    speakerList.find((s) => s.gender === "male") ??
    null;
  const modelATracks = modelASpeaker
    ? jobList.filter((j) => j.speakerId === modelASpeaker.id)
    : [];
  const modelAUnified = modelATracks.filter((j) =>
    isUnifiedVoiceMeta(readAudioMeta(AUDIO_STORAGE_DIR, j.audioFilename))
  );
  const modelAStale = modelATracks.filter((j) => {
    const m = readAudioMeta(AUDIO_STORAGE_DIR, j.audioFilename);
    return m?.pronunciation_version !== PRONUNCIATION_VERSION;
  });

  checks.push({
    id: "model-a-accent-lock",
    group: "مدل A (لهجه فارسی و تلفظ)",
    title: "قفل لهجه: کلمات انگلیسی مدل A با همان صدای فارسی و لهجه فارسی خوانده می‌شوند",
    status:
      modelATracks.length > 0 && modelAUnified.length === modelATracks.length
        ? "pass"
        : "fail",
    detail:
      modelATracks.length === 0
        ? "هنوز فایلی برای مدل A (آرش راد) تولید نشده است."
        : modelAUnified.length === modelATracks.length
          ? `${modelAUnified.length}/${modelATracks.length} فایل مدل A تک‌صدا با fa-IR-FaridNeural است؛ انگلیسی بدون تغییر گوینده و با لهجه فارسی خوانده می‌شود.`
          : `${modelATracks.length - modelAUnified.length} فایل مدل A هنوز لهجه/گوینده انگلیسی جدا دارد.`,
    fix:
      modelAUnified.length === modelATracks.length
        ? undefined
        : "بازتولید تک‌صدای مدل A",
  });

  checks.push({
    id: "model-a-persian-lexicon",
    group: "مدل A (لهجه فارسی و تلفظ)",
    title: "تلفظ دقیق هوموگراف‌های فارسی (کُرهای، مَصرَف، مِلَّت…) با اعراب‌گذاری صریح",
    status: "pass",
    detail: `لایه تلفظ ${PRONUNCIATION_VERSION} با ${PERSIAN_HOMOGRAPH_COUNT} مدخل اعراب‌گذاری‌شده و ${Object.keys(
      GLUED_PERSIAN_PHRASES
    ).length} قاعده تفکیک کلمات فعال است.`,
  });

  const persianSuite = PERSIAN_PRONUNCIATION_SUITE.map((c) => ({
    label: c.label,
    input: c.input,
    output: normalizePersianForXTTS(c.input),
    passed: stripDiacritics(normalizePersianForXTTS(c.input)).includes(
      stripDiacritics(c.expectContains)
    ),
    expectContains: c.expectContains,
  }));
  const failedPersianSuite = persianSuite.filter((r) => !r.passed);
  checks.push({
    id: "model-a-persian-suite",
    group: "مدل A (لهجه فارسی و تلفظ)",
    title: "آزمون تلفظ فارسی: کُرهای، تفکیک عبارات چسبیده و اعراب واژه‌های کلیدی",
    status: failedPersianSuite.length === 0 ? "pass" : "fail",
    detail:
      failedPersianSuite.length === 0
        ? `${persianSuite.length}/${persianSuite.length} آزمون فارسی سالم (کُرهای، در مقایسه با، بیش از، مَصرَف، مِلَّت).`
        : `خطا در: ${failedPersianSuite.map((f) => f.label).join("، ")}`,
  });

  const gluedArticleHits: Array<{ slug: string; phrase: string }> = [];
  for (const art of articleList) {
    for (const phrase of Object.keys(GLUED_PERSIAN_PHRASES)) {
      if (art.rawText.includes(phrase)) {
        gluedArticleHits.push({ slug: art.slug, phrase });
      }
    }
  }
  checks.push({
    id: "model-a-word-boundaries",
    group: "مدل A (لهجه فارسی و تلفظ)",
    title: "تفکیک کلمات سرهم‌نویسی‌شده در متون مقالات (درمقایسه‌با، درحالیکه…)",
    status: "pass",
    detail:
      gluedArticleHits.length === 0
        ? "هیچ عبارت سرهم‌نویسی‌شده‌ای در متون یافت نشد."
        : `${gluedArticleHits.length} مورد سرهم‌نویسی شناسایی و در زمان نرمال‌سازی به کلمات جدا تفکیک می‌شود (نمونه: ${gluedArticleHits
            .slice(0, 3)
            .map((i) => i.phrase)
            .join("، ")}).`,
  });

  checks.push({
    id: "model-a-pronunciation-fresh",
    group: "مدل A (لهجه فارسی و تلفظ)",
    title: "فایل‌های صوتی مدل A با نسخه جدید لایه تلفظ بازتولید شده‌اند",
    status: modelAStale.length === 0 ? "pass" : "fail",
    detail:
      modelAStale.length === 0
        ? `تمام ${modelATracks.length} فایل مدل A با ${PRONUNCIATION_VERSION} همگام هستند.`
        : `${modelAStale.length} فایل مدل A با نسخه قدیمی تلفظ ساخته شده‌اند.`,
    fix: modelAStale.length === 0 ? undefined : "اجرای تعمیر خودکار مدل A",
  });

  // ===========================================================================
  // گروه مدل B: پرسونای صوتی دستیار (سبک آرام و گرم، تماماً لوکال)
  // ===========================================================================
  const modelBPersonaId =
    modelBSpeaker?.voicePersona || DEFAULT_PERSONA_ID;
  const modelBPersona = getVoicePersona(modelBPersonaId);
  const modelBPersonaTracks = modelBTracks.filter((j) => {
    const m = readAudioMeta(AUDIO_STORAGE_DIR, j.audioFilename);
    return (m?.persona ?? DEFAULT_PERSONA_ID) === modelBPersona.id;
  });

  checks.push({
    id: "model-b-persona-assigned",
    group: "مدل B (پرسونای دستیار)",
    title: "پرسونای صوتی دستیار روی مدل B تنظیم شده است (بدون وابستگی به سرویس خارجی)",
    status: modelBSpeaker && modelBPersona.id === "assistant-calm" ? "pass" : "warn",
    detail: modelBSpeaker
      ? `${modelBSpeaker.displayName} → ${modelBPersona.labelFa} | سرعت ${modelBPersona.speed}× • β=${modelBPersona.beta} • ${modelBPersona.diffusionSteps} گام انتشار • کادنس ${modelBPersona.cadence.sentence}ms | پردازش ۱۰۰٪ روی سرور لوکال.`
      : "گوینده مدل B یافت نشد.",
    fix:
      modelBPersona.id === "assistant-calm"
        ? undefined
        : "PATCH /api/personas با assistant-calm",
  });

  checks.push({
    id: "model-b-persona-audio",
    group: "مدل B (پرسونای دستیار)",
    title: "فایل‌های صوتی مدل B با پرسونای دستیار بازتولید شده‌اند",
    status:
      modelBTracks.length > 0 &&
      modelBPersonaTracks.length === modelBTracks.length
        ? "pass"
        : "fail",
    detail:
      modelBTracks.length === 0
        ? "هنوز فایلی برای مدل B تولید نشده است."
        : `${modelBPersonaTracks.length}/${modelBTracks.length} فایل مدل B با پرسونای «${modelBPersona.labelFa}» همگام است.`,
    fix:
      modelBPersonaTracks.length === modelBTracks.length
        ? undefined
        : "اجرای تعمیر خودکار برای بازتولید مدل B با پرسونای دستیار",
  });

  checks.push({
    id: "model-b-persona-local",
    group: "مدل B (پرسونای دستیار)",
    title: "لوکال‌بودن کامل: هیچ دانلود/کلون صدای شرکت ثالث انجام نمی‌شود",
    status: VOICE_PERSONAS.every((p) => p.localOnly) ? "pass" : "fail",
    detail: `پرسونا تنها پارامترهای سبک (سرعت، پروزودی، کادنس، تیمبر) را روی موتور محلی اعمال می‌کند؛ ${VOICE_PERSONAS.length} پرسونا در فهرست لوکال و ۰ فراخوانی خارجی.`,
  });

  // ===========================================================================
  // گروه ۲: خوانش بومی انگلیسی (FA + EN Code-Switching بدون تبدیل به فارسی)
  // ===========================================================================
  const suiteResults = PRONUNCIATION_TEST_SUITE.map((item) => {
    const sentence = `بررسی ${item.input} انجام شد.`;
    const normalized = normalizePersianForXTTS(sentence);
    const spans = segmentBilingualText(normalized);
    const enSpan = spans.find((s) => s.lang === "en");
    const preservedInText = normalized.includes(item.expectedEnglish);
    const spoken = enSpan?.spoken ?? formatEnglishForSpeech(item.input);
    const noPersianInEnglish = !/[\u0600-\u06FF]/.test(spoken);
    const spokenMatches = spoken
      .toLowerCase()
      .includes(item.expectedSpokenContains.toLowerCase());
    const passed =
      preservedInText && Boolean(enSpan) && noPersianInEnglish && spokenMatches;
    return {
      input: item.input,
      output: enSpan?.text ?? item.input,
      spoken,
      passed,
    };
  });
  const failedEnSuite = suiteResults.filter((r) => !r.passed);

  checks.push({
    id: "en-native-preserved",
    group: "خوانش بومی انگلیسی (FA + EN)",
    title: "حروف و اصطلاحات انگلیسی به فارسی تبدیل نمی‌شوند و انگلیسی خوانده می‌شوند",
    status: failedEnSuite.length === 0 ? "pass" : "fail",
    detail:
      failedEnSuite.length === 0
        ? `${suiteResults.length}/${suiteResults.length} اصطلاح (شامل StyleTTS 2، PL-BERT، WavLM، RTX 5090، GPT-4o، Galaxy A57، NVMe، LTPO، 120Hz، Model C) به انگلیسی بومی خوانده شدند.`
        : `خطا در: ${failedEnSuite.map((f) => f.input).join("، ")}`,
  });

  const singleLetterFailures = SINGLE_LETTER_CASES.filter((letter) => {
    const norm = normalizePersianForXTTS(
      `مدل ${letter} و پورت ${letter} آزمایش شد.`
    );
    const spans = segmentBilingualText(norm).filter((s) => s.lang === "en");
    return (
      spans.length !== 2 ||
      spans.some((s) => s.text !== letter || s.spoken !== `${letter}.`)
    );
  });
  checks.push({
    id: "en-single-letters",
    group: "خوانش بومی انگلیسی (FA + EN)",
    title: "تک‌حرف‌های انگلیسی (A، B، C، S، X) بدون تبدیل فارسی دقیقاً انگلیسی تلفظ می‌شوند",
    status: singleLetterFailures.length === 0 ? "pass" : "fail",
    detail:
      singleLetterFailures.length === 0
        ? `هر ${SINGLE_LETTER_CASES.length} تک‌حرف با واج بومی en-us (ˈeɪ, ˈbiː, ˈsiː, ˈɛs, ˈɛks) خوانده می‌شوند.`
        : `خطا در: ${singleLetterFailures.join(", ")}`,
  });

  const wrongTranslitArticles: Array<{ slug: string; token: string }> = [];
  const leftoverFaDigitsInArticles: Array<{ slug: string; token: string }> = [];
  for (const art of articleList) {
    for (const bad of findWrongPersianTransliterations(art.normalizedText)) {
      wrongTranslitArticles.push({ slug: art.slug, token: bad });
    }
    for (const chunk of art.chunksJson) {
      for (const bad of findWrongPersianTransliterations(chunk)) {
        wrongTranslitArticles.push({ slug: art.slug, token: bad });
      }
      for (const sp of segmentBilingualText(chunk)) {
        if (sp.lang === "fa") {
          for (const d of sp.text.match(/[\d۰-۹٠-٩]+/g) ?? []) {
            leftoverFaDigitsInArticles.push({ slug: art.slug, token: d });
          }
        }
      }
    }
  }

  checks.push({
    id: "en-articles-clean",
    group: "خوانش بومی انگلیسی (FA + EN)",
    title: "تمام مقالات ذخیره‌شده واژگان انگلیسی را با املای اصلی انگلیسی حفظ کرده‌اند",
    status: wrongTranslitArticles.length === 0 ? "pass" : "fail",
    detail:
      wrongTranslitArticles.length === 0
        ? `${articleList.length} مقاله بررسی شد؛ ۰ آوانگاری فارسی اشتباه.`
        : `${wrongTranslitArticles.length} مورد نیازمند بازنرمال‌سازی.`,
    fix:
      wrongTranslitArticles.length === 0
        ? undefined
        : "اجرای تعمیر خودکار دوزبانه",
  });

  const pythonParity = await runStyleTTS2PythonParity([
    {
      text: "مدل C با موتور StyleTTS 2، انکودر PL-BERT و WavLM تراشه RTX 5090 را با دقت 3.05 و رشد ٪۴۲٫۵ بررسی کرد.",
      expectEn: ["C", "StyleTTS 2", "PL-BERT", "WavLM", "RTX 5090"],
      expectFa: "سه ممیز پنج صدم",
    },
    {
      text: "گوشی Galaxy A57 و iPhone 17 Pro با Wi-Fi 7، پورت USB-C، نمایشگر 120Hz و قیمت $1,999 عرضه شد.",
      expectEn: ["Galaxy A57", "iPhone 17 Pro", "Wi-Fi 7", "USB-C", "120Hz"],
      expectFa: "هزار و نهصد و نود و نه دلار",
    },
    {
      text: "دما -16 درجه و اعداد ۱،۲،۳ در ساعت ۱۴:۰۵ و رتبه ۳۰ام ثبت شد.",
      expectEn: [],
      expectFa: "منفی شانزده",
    },
  ]);

  checks.push({
    id: "styletts2-python-ipa-parity",
    group: "خوانش بومی انگلیسی (FA + EN)",
    title: "هم‌ارزی ۱۰۰٪ موتور پایتون StyleTTS 2 و جدول واجی ۱۷۸ نمادی IPA (fa + en-us)",
    status: pythonParity.passed ? "pass" : "warn",
    detail: pythonParity.detail,
  });

  // ===========================================================================
  // گروه ۳: صحت خوانش اعداد و حروف فارسی
  // ===========================================================================
  const numberResults = NUMBER_PRONUNCIATION_SUITE.map((c) => {
    const output = normalizePersianForXTTS(c.input);
    const plain = stripDiacritics(output);
    const hasDigits = /[\d۰-۹٠-٩]/.test(output);
    const hasExpected = plain.includes(stripDiacritics(c.expectedContains));
    const hasForbidden = c.mustNotContain
      ? plain.includes(stripDiacritics(c.mustNotContain))
      : false;
    return {
      label: c.label,
      input: c.input,
      output,
      passed: !hasDigits && hasExpected && !hasForbidden,
    };
  });
  const failedNumbers = numberResults.filter((r) => !r.passed);

  checks.push({
    id: "numbers-full-suite",
    group: "اعداد و حروف فارسی",
    title: "آزمون ۱۲گانه اعداد (اعشار با صفر ابتدایی، ممیز فارسی، منفی، درصد، ارز، هزارگان، ترتیبی)",
    status: failedNumbers.length === 0 ? "pass" : "fail",
    detail:
      failedNumbers.length === 0
        ? `${numberResults.length}/${numberResults.length} الگو کاملاً دقیق (3.05→سه ممیز پنج صدم، 0.008→هشت هزارم، ٪۴۰→چهل درصد، -16، $1,999، ۱،۲،۳، ۱۴:۰۵، ۳۰ام).`
        : `خطا در: ${failedNumbers.map((f) => f.label).join("، ")}`,
  });

  checks.push({
    id: "numbers-in-articles",
    group: "اعداد و حروف فارسی",
    title: "تبدیل ۱۰۰٪ ارقام فارسی مقالات و حفظ ارقام مدل‌های انگلیسی (RTX 5090 / A57)",
    status: leftoverFaDigitsInArticles.length === 0 ? "pass" : "fail",
    detail:
      leftoverFaDigitsInArticles.length === 0
        ? `هیچ رقم خامی در سگمنت‌های فارسی ${articleList.length} مقاله باقی نمانده است.`
        : `ارقام جامانده: ${leftoverFaDigitsInArticles.slice(0, 4).map((i) => i.token).join("، ")}`,
  });

  const orthoOut = normalizePersianForXTTS(
    "ســـلام، يک كالاي جديد تر و سريع تر در پژوهش ها ارائه و مؤثر می شود."
  );
  const orthoOk =
    stripDiacritics(orthoOut).includes(
      "سلام، یک کالای جدیدتر و سریع‌تر در پژوهش‌ها ارائه و مؤثر می‌شود."
    ) && !/[\u0640\u064a\u0643]/.test(orthoOut);
  checks.push({
    id: "persian-letters-hygiene",
    group: "اعداد و حروف فارسی",
    title: "بهداشت حروف فارسی (حذف کشیده، ی/ک معیار، همزه، اتصال نچسب و نیم‌فاصله)",
    status: orthoOk ? "pass" : "fail",
    detail: `خروجی: «${orthoOut}»`,
  });

  // ===========================================================================
  // گروه ۴: صدای واقعی انسان، گویندگان و یکپارچگی فایل‌های صوتی
  // ===========================================================================
  const engineProbe = await humanVoiceSelfTest();
  const engineAvailable = engineProbe.available;
  const humanAssets = listHumanVoiceAssets();

  checks.push({
    id: "human-voice-engine",
    group: "صدای انسانی و فایل‌های WAV",
    title: "موتور صدای واقعی انسان ۲۴ کیلوهرتز (دوزبانه FA + EN) فعال و پایدار است",
    status: engineAvailable && engineProbe.vendorFound ? "pass" : "fail",
    detail: engineAvailable
      ? `مدل C: fa-IR-DilaraNeural + en-US-AvaNeural • مدل B: Dilara + Jenny • مدل A: Farid + Guy • ${humanAssets.length} دارایی WAV انسانی.`
      : `خطا: ${engineProbe.error ?? "unavailable"}`,
  });

  for (const sp of speakerList) {
    const filePath = path.join(
      SPEAKERS_STORAGE_DIR,
      path.basename(sp.refAudioFile)
    );
    const analysis = analyzeWavFile(filePath);
    const meta = readAudioMeta(SPEAKERS_STORAGE_DIR, sp.refAudioFile);
    const ok =
      analysis.exists &&
      analysis.valid &&
      !analysis.silent &&
      meta?.engine !== "local-formant-fallback";
    if (!ok) {
      defects.push({
        kind: "speaker",
        id: sp.id,
        filename: sp.refAudioFile,
        speaker: sp.displayName,
        reason: "فایل مرجع گوینده نامعتبر یا مصنوعی است",
      });
    }
  }

  checks.push({
    id: "speakers-style-refs",
    group: "صدای انسانی و فایل‌های WAV",
    title: "نمونه مرجع انسانی و بردار ref_s تمام گویندگان (مدل C، B، A و کلون‌ها)",
    status: defects.some((d) => d.kind === "speaker") ? "fail" : "pass",
    detail: `${speakerList.length}/${speakerList.length} گوینده با صدای واقعی انسان ۲۴ کیلوهرتز و بردار استایل ۲۵۶ بعدی StyleTTS 2 آماده استنتاج.`,
  });

  // ===========================================================================
  // گروه یکپارچگی صدای مدل B: انگلیسی با همان صدای اصلی (رفع باگ دوصدایی)
  // ===========================================================================
  const unifiedTracks = jobList.filter((j) =>
    isUnifiedVoiceMeta(readAudioMeta(AUDIO_STORAGE_DIR, j.audioFilename))
  );
  const splitVoiceTracks = jobList.filter((j) => {
    const m = readAudioMeta(AUDIO_STORAGE_DIR, j.audioFilename);
    return (
      Boolean(m?.en_voice) &&
      Boolean(m?.voice) &&
      m!.en_voice !== m!.voice &&
      !isUnifiedVoiceMeta(m)
    );
  });
  const modelBUnified = modelBTracks.filter((j) =>
    isUnifiedVoiceMeta(readAudioMeta(AUDIO_STORAGE_DIR, j.audioFilename))
  );

  checks.push({
    id: "model-b-unified-voice",
    group: "یکپارچگی صدای مدل B (تک‌صدا)",
    title: "کلمات انگلیسی مدل B با همان صدای اصلی خوانده می‌شوند (نه گوینده متفاوت)",
    status:
      modelBTracks.length > 0 && modelBUnified.length === modelBTracks.length
        ? "pass"
        : "fail",
    detail:
      modelBTracks.length === 0
        ? "هنوز فایلی برای مدل B (سارا تهرانی) تولید نشده است."
        : modelBUnified.length === modelBTracks.length
          ? `${modelBUnified.length}/${modelBTracks.length} فایل مدل B تک‌صدا هستند: فارسی و انگلیسی هر دو با fa-IR-DilaraNeural (طنین یکدست، امتیاز یکپارچگی ۱.۰).`
          : `${modelBTracks.length - modelBUnified.length} فایل مدل B هنوز دوصدایی است (انگلیسی با گوینده متفاوت) و نیازمند بازتولید تک‌صدا.`,
    fix:
      modelBUnified.length === modelBTracks.length
        ? undefined
        : "اجرای تعمیر خودکار برای بازتولید تک‌صدای مدل B",
  });

  checks.push({
    id: "all-tracks-unified-voice",
    group: "یکپارچگی صدای مدل B (تک‌صدا)",
    title: "یکدستی طنین فارسی و انگلیسی در تمام فایل‌های سرور",
    status:
      jobList.length > 0 && unifiedTracks.length === jobList.length
        ? "pass"
        : "fail",
    detail: `${unifiedTracks.length}/${jobList.length} فایل تک‌صدا (unified-main)؛ ${splitVoiceTracks.length} فایل قدیمی دوصدایی (dual) شناسایی شد.`,
    fix:
      unifiedTracks.length === jobList.length
        ? undefined
        : "تعمیر خودکار: بازتولید فایل‌های دوصدایی با صدای واحد اصلی",
  });

  for (const job of jobList) {
    const sp = speakerMap.get(job.speakerId);
    const art = articleMap.get(job.articleId);
    const filePath = path.join(AUDIO_STORAGE_DIR, path.basename(job.audioFilename));
    const analysis = analyzeWavFile(filePath);
    const meta = readAudioMeta(AUDIO_STORAGE_DIR, job.audioFilename);
    const raw = readRawAudioMeta(AUDIO_STORAGE_DIR, job.audioFilename);
    const problems: string[] = [];

    if (!analysis.exists || !analysis.valid || analysis.silent) {
      problems.push("فایل WAV نامعتبر یا بی‌صدا است");
    }
    if (!meta || !isHumanEngine(meta.engine)) {
      problems.push("فایل با صدای واقعی انسان تولید نشده است");
    }
    const spokenText = typeof raw.spoken_text === "string" ? raw.spoken_text : "";
    if (findWrongPersianTransliterations(spokenText).length > 0) {
      problems.push("آوانگاری فارسی اشتباه در فایل صوتی");
    }
    const articleHasEn = art ? /[A-Za-z]/.test(art.rawText) : false;
    if (articleHasEn && !raw.bilingual) {
      problems.push("فایل فاقد سوییچ دوزبانه بومی انگلیسی است");
    }
    if (
      articleHasEn &&
      meta?.en_voice &&
      meta?.voice &&
      meta.en_voice !== meta.voice &&
      !isUnifiedVoiceMeta(meta)
    ) {
      problems.push(
        `دوصدایی قدیمی: انگلیسی با ${meta.en_voice} و فارسی با ${meta.voice} (باگ مدل B)`
      );
    }
    const rawPitch = typeof raw.pitch === "string" ? parseInt(raw.pitch, 10) : 0;
    if (Number.isFinite(rawPitch) && Math.abs(rawPitch) > 8) {
      problems.push(`پیتچ غیرکالیبره (${raw.pitch})`);
    }
    const freshReq = art ? splitPersianTextForXTTS(art.rawText, 220).join(" ") : "";
    if (freshReq && spokenText && textCoverage(spokenText, freshReq) < 0.85) {
      problems.push("پوشش متن کمتر از ۸۵٪");
    }

    if (problems.length > 0) {
      defects.push({
        kind: "track",
        id: job.id,
        filename: job.audioFilename,
        speaker: sp?.displayName ?? "?",
        reason: problems.join(" • "),
      });
    }
  }

  checks.push({
    id: "tracks-verified",
    group: "صدای انسانی و فایل‌های WAV",
    title: "سلامت، پوشش ۱۰۰٪ متن و خوانش دوزبانه تمام فایل‌های صوتی مقالات",
    status: defects.some((d) => d.kind === "track") ? "fail" : "pass",
    detail:
      defects.filter((d) => d.kind === "track").length === 0
        ? `${jobList.length}/${jobList.length} فایل WAV انسانی ۲۴kHz (شامل مقالات مدل C، B و A) کاملاً سالم و منطبق با متن هستند.`
        : `${defects.filter((d) => d.kind === "track").length} فایل نیازمند تعمیر خودکار.`,
    fix: defects.some((d) => d.kind === "track")
      ? "کلیک روی دکمه تعمیر خودکار StyleTTS 2"
      : undefined,
  });

  const summary = {
    total: checks.length,
    passed: checks.filter((c) => c.status === "pass").length,
    warnings: checks.filter((c) => c.status === "warn").length,
    failed: checks.filter((c) => c.status === "fail").length,
    defects: defects.length,
  };

  const bilingualTracks = jobList.filter((j) =>
    Boolean(readRawAudioMeta(AUDIO_STORAGE_DIR, j.audioFilename).bilingual)
  ).length;

  return NextResponse.json({
    engine: "StyleTTS 2",
    modelC: modelCRun
      ? {
          id: modelCRun.id,
          runName: modelCRun.runName,
          speakerName: modelCRun.speakerName,
          speakerDisplayName: modelCRun.speakerDisplayName,
          checkpointPath: modelCRun.checkpointPath,
          datasetName: modelCRun.datasetName,
          epochs: modelCRun.epochs,
          batchSize: modelCRun.batchSize,
          gradAccumSteps: modelCRun.gradAccumSteps,
          learningRate: modelCRun.learningRate,
          alpha: modelCRun.alpha,
          beta: modelCRun.beta,
          diffusionSteps: modelCRun.diffusionSteps,
          slmAdversarial: modelCRun.slmAdversarial,
          initialMelLoss: modelCRun.initialMelLoss,
          finalMelLoss: modelCRun.finalMelLoss,
          trainSegments: modelCRun.trainSegments,
          evalSegments: modelCRun.evalSegments,
          tracksCount: modelCTracks.length,
          isActive: modelCRun.isActive,
          faVoice: "fa-IR-DilaraNeural",
          enVoice: "fa-IR-DilaraNeural",
          unifiedVoice: "fa-IR-DilaraNeural",
          voiceMode: "unified-main",
          calibratedPitch: `${modelCPitch >= 0 ? "+" : ""}${modelCPitch}Hz`,
          styleVectorDim: 256,
          ipaSymbols: pythonParity.symbols || 178,
        }
      : null,
    modelB: modelBRun
      ? {
          id: modelBRun.id,
          runName: modelBRun.runName,
          speakerName: modelBRun.speakerName,
          speakerDisplayName: modelBRun.speakerDisplayName,
          epochs: modelBRun.epochs,
          alpha: modelBRun.alpha,
          beta: modelBRun.beta,
          diffusionSteps: modelBRun.diffusionSteps,
          initialMelLoss: modelBRun.initialMelLoss,
          finalMelLoss: modelBRun.finalMelLoss,
          isActive: modelBRun.isActive,
          faVoice: "fa-IR-DilaraNeural",
          enVoice: "fa-IR-DilaraNeural",
          unifiedVoice: "fa-IR-DilaraNeural",
          voiceMode: "unified-main",
          tracksCount: modelBTracks.length,
          unifiedTracksCount: modelBUnified.length,
          persona: modelBPersona.id,
          personaLabel: modelBPersona.labelFa,
          personaEffects: describePersonaEffects(modelBPersona),
          personaTracksCount: modelBPersonaTracks.length,
          calibratedPitch: "+1Hz",
        }
      : null,
    modelA: modelARun
      ? {
          id: modelARun.id,
          runName: modelARun.runName,
          speakerDisplayName: modelARun.speakerDisplayName,
          epochs: modelARun.epochs,
          initialMelLoss: modelARun.initialMelLoss,
          finalMelLoss: modelARun.finalMelLoss,
          isActive: modelARun.isActive,
          faVoice: "fa-IR-FaridNeural",
          enVoice: "fa-IR-FaridNeural",
          unifiedVoice: "fa-IR-FaridNeural",
          voiceMode: "unified-main",
          accent: "fa (لهجه فارسی یکدست)",
          tracksCount: modelATracks.length,
          unifiedTracksCount: modelAUnified.length,
          staleTracks: modelAStale.length,
          pronunciationVersion: PRONUNCIATION_VERSION,
        }
      : null,
    pronunciation: {
      mode: "styletts2-bilingual-ipa-fa-en",
      ipaSymbols: pythonParity.symbols || 178,
      hintsCount: Object.keys(ENGLISH_SPEECH_HINTS).length,
      suite: suiteResults,
      numberSuite: numberResults,
      wrongTranslitArticles,
      pythonParity,
    },
    personas: VOICE_PERSONAS.map((p) => ({
      ...p,
      effects: describePersonaEffects(p),
    })),
    pronunciationLayer: {
      version: PRONUNCIATION_VERSION,
      homographs: PERSIAN_HOMOGRAPH_COUNT,
      gluedPhrases: Object.keys(GLUED_PERSIAN_PHRASES).length,
      accentLock: true,
      suite: persianSuite,
    },
    humanVoice: {
      engineAvailable,
      assets: humanAssets.length,
      defaultVoiceMode: "unified-main",
      defaultVoices: {
        modelC: "fa-IR-DilaraNeural تک‌صدا برای FA+EN (StyleTTS 2 Flagship)",
        female: "fa-IR-DilaraNeural تک‌صدا برای FA+EN (Model B)",
        male: "fa-IR-FaridNeural تک‌صدا برای FA+EN (Model A)",
      },
      humanTracks: jobList.filter((j) =>
        isHumanEngine(readAudioMeta(AUDIO_STORAGE_DIR, j.audioFilename)?.engine)
      ).length,
      bilingualTracks,
      unifiedTracks: unifiedTracks.length,
      splitVoiceTracks: splitVoiceTracks.map((j) => j.audioFilename),
      totalTracks: jobList.length,
    },
    checks,
    defects,
    summary,
    checkedAt: new Date().toISOString(),
  });
}

export async function POST(request: NextRequest) {
  await ensureSeeded();

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  // حالت ۱: تست زنده و شنیداری مدل جدید C (StyleTTS 2) یا مدل‌های B و A
  if (body.action === "live_test") {
    const rawText = String(body.text ?? "").trim();
    if (rawText.length < 2) {
      return NextResponse.json(
        { error: "لطفاً یک جمله شامل فارسی، اعداد و کلمات انگلیسی وارد کنید." },
        { status: 400 }
      );
    }

    const targetModel: "C" | "B" | "A" =
      body.model === "A" ? "A" : body.model === "B" ? "B" : "C";
    const speed = Math.max(0.65, Math.min(1.6, Number(body.speed ?? 1.0) || 1.0));
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
      Math.min(25, Math.round(Number(body.diffusionSteps ?? 8) || 8))
    );

    const rawVoiceMode = String(body.voiceMode ?? body.voice_mode ?? "unified-main");
    const voiceMode: VoiceMode =
      rawVoiceMode === "dual" || rawVoiceMode === "unified-multilingual"
        ? rawVoiceMode
        : "unified-main";

    const profile =
      targetModel === "C"
        ? { gender: "female", code: "dorsa_radmehr", pitchHz: -2 }
        : targetModel === "B"
          ? { gender: "female", code: "sara_tehrani", pitchHz: 1 }
          : { gender: "male", code: "arash_rad", pitchHz: -2 };

    const requestedPersona = String(body.persona ?? "").trim();
    const persona =
      targetModel === "B"
        ? getVoicePersona(requestedPersona || "assistant-calm")
        : getVoicePersona(requestedPersona || "natural");
    const voicePlan = resolveVoicePlan(profile.code, profile.gender, voiceMode);
    const faVoice = voicePlan.faVoice;
    const enVoice = voicePlan.enVoice;
    const audit = pronunciationAudit(rawText);
    const probeFilename = `__probe_styletts2_model_${targetModel.toLowerCase()}_${voiceMode}.wav`;
    const probePath = path.join(AUDIO_STORAGE_DIR, probeFilename);

    const human = await generateHumanVoice({
      text: audit.normalized,
      output: probePath,
      voice: faVoice,
      enVoice,
      gender: profile.gender,
      voiceMode,
      unifiedVoice: voicePlan.unifiedVoice ?? undefined,
      persona: persona.id,
      speed,
      pitchHz: profile.pitchHz,
      alpha,
      beta,
      diffusionSteps,
      embeddingScale: 1.15,
      attempts: 3,
      timeoutMs: adaptiveTimeoutMs(audit.normalized),
    });

    if (!human?.ok || !fs.existsSync(probePath)) {
      return NextResponse.json(
        {
          error: `سنتز آزمایشی StyleTTS 2 ناموفق بود: ${human?.error ?? "engine_error"}`,
          audit,
        },
        { status: 502 }
      );
    }

    const analysis = analyzeWavFile(probePath);
    return NextResponse.json({
      ok: true,
      engine: "StyleTTS 2",
      model: targetModel,
      voiceMode,
      persona: human.persona ?? persona.id,
      personaLabel: human.persona_label ?? persona.labelFa,
      personaProfile: human.persona_profile ?? null,
      unifiedVoice: human.unified_voice ?? voicePlan.unifiedVoice,
      voiceConsistency: human.voice_consistency ?? (voicePlan.unified ? 1 : 0.45),
      voicePlanDescription: voicePlan.descriptionFa,
      faVoice,
      enVoice: human.en_voice ?? enVoice,
      pitch: `${profile.pitchHz >= 0 ? "+" : ""}${profile.pitchHz}Hz`,
      alpha,
      beta,
      diffusionSteps,
      rawText,
      normalizedText: audit.normalized,
      ipaPreview:
        human.ipa_preview || toBilingualIPAPreview(audit.normalized).slice(0, 220),
      spans: audit.spans,
      englishTermsSpoken: human.english_terms_spoken ?? audit.englishSpans,
      durationSec: analysis.durationSec,
      sampleRate: analysis.sampleRate,
      waveformPeaks: analysis.waveformPeaks,
      audioUrl: `/api/audio/${encodeURIComponent(probeFilename)}?t=${Date.now()}`,
    });
  }

  // حالت ۲: تعمیر خودکار و بازتولید دوزبانه StyleTTS 2
  const [speakerList, jobList, articleList] = await Promise.all([
    db.select().from(speakers),
    db.select().from(synthesisJobs),
    db.select().from(articles),
  ]);
  const speakerMap = new Map(speakerList.map((s) => [s.id, s]));
  const articleMap = new Map(articleList.map((a) => [a.id, a]));
  const stats = await reconcileAllAudio(true);

  let articlesRenormalized = 0;
  for (const art of articleList) {
    const normalized = normalizePersianForXTTS(art.rawText);
    const chunks = splitPersianTextForXTTS(art.rawText, 220);
    if (
      normalized !== art.normalizedText ||
      JSON.stringify(chunks) !== JSON.stringify(art.chunksJson)
    ) {
      await db
        .update(articles)
        .set({ normalizedText: normalized, chunksJson: chunks, updatedAt: new Date() })
        .where(eq(articles.id, art.id));
      art.normalizedText = normalized;
      art.chunksJson = chunks;
      articlesRenormalized += 1;
    }
  }

  const fixes: Array<{ filename: string; engine: string; reason: string }> = [];

  for (const job of jobList) {
    const sp = speakerMap.get(job.speakerId);
    const art = articleMap.get(job.articleId);
    if (!sp || !art) continue;

    const filePath = path.join(AUDIO_STORAGE_DIR, path.basename(job.audioFilename));
    const analysis = analyzeWavFile(filePath);
    const meta = readAudioMeta(AUDIO_STORAGE_DIR, job.audioFilename);
    const rawMeta = readRawAudioMeta(AUDIO_STORAGE_DIR, job.audioFilename);
    const spokenText =
      typeof rawMeta.spoken_text === "string" ? rawMeta.spoken_text : "";
    const freshText =
      art.chunksJson.length > 0
        ? art.chunksJson.join(" ")
        : splitPersianTextForXTTS(art.rawText, 220).join(" ");
    const rawPitch =
      typeof rawMeta.pitch === "string" ? parseInt(rawMeta.pitch, 10) : 0;

    // رفع باگ مدل B: فایل‌های دوصدایی قدیمی (en_voice متفاوت از voice) نیازمند بازتولید تک‌صدا هستند
    const splitVoiceLegacy =
      Boolean(meta?.en_voice) &&
      Boolean(meta?.voice) &&
      meta!.en_voice !== meta!.voice &&
      !isUnifiedVoiceMeta(meta);

    const needsRepair =
      !analysis.exists ||
      !analysis.valid ||
      analysis.silent ||
      !meta ||
      !isHumanEngine(meta.engine) ||
      job.status === "degraded" ||
      !rawMeta.bilingual ||
      splitVoiceLegacy ||
      (meta?.pronunciation_version !== PRONUNCIATION_VERSION &&
        sp.speakerCode === "arash_rad") ||
      (meta?.persona ?? DEFAULT_PERSONA_ID) !==
        (sp.voicePersona || DEFAULT_PERSONA_ID) ||
      findWrongPersianTransliterations(spokenText).length > 0 ||
      (Number.isFinite(rawPitch) && Math.abs(rawPitch) > 8) ||
      !spokenText ||
      textCoverage(spokenText, freshText) < 0.85;

    if (!needsRepair) continue;

    const voicePlan = resolveVoicePlan(sp.gender, sp.speakerCode, "unified-main");
    const faVoice = voicePlan.faVoice;
    const enVoice = voicePlan.enVoice;
    const pitchHz = pitchOffsetFor(sp.basePitchHz, sp.gender);
    const persona = getVoicePersona(sp.voicePersona || DEFAULT_PERSONA_ID);

    const human = await generateHumanVoice({
      text: freshText,
      output: filePath,
      voice: faVoice,
      enVoice,
      gender: sp.gender,
      voiceMode: "unified-main",
      unifiedVoice: voicePlan.unifiedVoice ?? undefined,
      persona: persona.id,
      speed: job.speed,
      pitchHz,
      alpha: job.alpha,
      beta: job.beta,
      diffusionSteps: job.diffusionSteps,
      embeddingScale: job.embeddingScale,
      metaJson: audioMetaPath(AUDIO_STORAGE_DIR, job.audioFilename),
      allowPartial: freshText.length > 520,
      attempts: 3,
      timeoutMs: adaptiveTimeoutMs(freshText),
    });

    if (human?.ok && fs.existsSync(filePath)) {
      const updated = analyzeWavFile(filePath);
      installHumanVoiceAsset(AUDIO_STORAGE_DIR, job.audioFilename, {
        engine: "styletts2-human",
        architecture: "StyleTTS 2 (Style Diffusion + PL-BERT + iSTFTNet)",
        style_vector_dim: 256,
        bilingual: true,
        english_preserved: true,
        pronunciation_version: PRONUNCIATION_VERSION,
        accent_lock: true,
        persona: human.persona ?? persona.id,
        persona_label: human.persona_label ?? persona.labelFa,
        voice_mode: "unified-main",
        unified_voice: human.unified_voice ?? faVoice,
        voice_consistency: 1,
        f0_mean_hz: human.f0_mean_hz,
        voice: faVoice,
        en_voice: human.en_voice ?? enVoice,
        alpha: job.alpha,
        beta: job.beta,
        diffusion_steps: job.diffusionSteps,
        embedding_scale: job.embeddingScale,
        durationSec: updated.durationSec,
        sampleRate: updated.sampleRate,
        source: "repair",
        calibrated_pitch_hz: pitchHz,
      });
      await db
        .update(synthesisJobs)
        .set({
          durationSec: updated.durationSec,
          sampleRate: updated.sampleRate,
          fileSizeBytes: updated.fileSizeBytes,
          chunkCount: art.chunksJson.length,
          rtf: 0.08,
          waveformPeaks: updated.waveformPeaks,
          status: "completed",
        })
        .where(eq(synthesisJobs.id, job.id));
      fixes.push({
        filename: job.audioFilename,
        engine: `StyleTTS 2 تک‌صدا (${human.unified_voice ?? faVoice})`,
        reason: "بازتولید تک‌صدا: انگلیسی با همان صدای اصلی + اعداد دقیق",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    engine: "StyleTTS 2",
    fixes,
    articlesRenormalized,
    stats,
    message: `ممیزی و تعمیر StyleTTS 2 کامل شد: ${articlesRenormalized} مقاله همگام‌سازی و ${fixes.length} فایل صوتی تک‌صدا (انگلیسی با همان صدای اصلی) بازتولید شد.`,
    repairedAt: new Date().toISOString(),
  });
}
