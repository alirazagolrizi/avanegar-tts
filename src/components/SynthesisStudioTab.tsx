"use client";

import { useMemo, useState } from "react";
import {
  AudioLines,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cpu,
  ExternalLink,
  FileAudio,
  Loader2,
  Mic2,
  Plus,
  SlidersHorizontal,
  Sparkles,
  Trash2,
} from "lucide-react";
import type { ArticleItem, SpeakerItem, StudioStats } from "@/types/studio";
import { WaveformPlayer } from "@/components/WaveformPlayer";
import {
  formatDurationFa,
  segmentBilingualText,
  splitPersianTextForXTTS,
  toPersianDigits,
} from "@/lib/persian-nlp";
import { VOICE_PERSONAS, getVoicePersona } from "@/lib/voice-personas";

const ARTICLE_PRESETS = [
  {
    label: "تست جامع مدل C (StyleTTS 2 + EN + اعداد)",
    title: "بررسی موتور StyleTTS 2 روی تراشه NVIDIA RTX 5090 با دقت 3.05 و قیمت $1,999",
    slug: "zoomit-styletts2-rtx5090-benchmark",
    publisherName: "زومیت",
    category: "هوش مصنوعی و سخت‌افزار",
    text: "در آزمون جدید مدل C با موتور مرکزی StyleTTS 2 و انکودر PL-BERT، تراشه NVIDIA RTX 5090 با حافظه 32GB VRAM و هوش مصنوعی GPT-4o توانست مقالات دوزبانه را با خطای 0.008، دقت 3.05، کاهش مصرف ٪۴۲٫۵، قیمت $1,999 و بلندی -16 LUFS روی پورت A و B پردازش کند.",
  },
  {
    label: "بررسی Galaxy A57 و iPhone 17 Pro (زومیت)",
    title: "مقایسه نمایشگر LTPO OLED 120Hz در Galaxy A57 و iPhone 17 Pro",
    slug: "zoomit-galaxy-a57-iphone17-review",
    publisherName: "زومیت",
    category: "بررسی موبایل",
    text: "گوشی Galaxy A57 و پرچم‌دار iPhone 17 Pro با نمایشگر LTPO AMOLED 120Hz، باتری 6000mAh، ضخامت ۷٫۴ میلی‌متر، درگاه USB-C و شبکه Wi-Fi 7 در ساعت ۱۴:۰۵ روز ۲۳ام بررسی شدند و شارژدهی را 28.5% نسبت به سری S25 FE ارتقا دادند.",
  },
];

interface SynthesisStudioTabProps {
  stats: StudioStats;
  speakers: SpeakerItem[];
  articles: ArticleItem[];
  onRefresh: () => Promise<void>;
  onOpenInWidget: (slug: string) => void;
}

export function SynthesisStudioTab({
  stats,
  speakers,
  articles,
  onRefresh,
  onOpenInWidget,
}: SynthesisStudioTabProps) {
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [publisherName, setPublisherName] = useState("زومیت");
  const [category, setCategory] = useState("فناوری و هوش مصنوعی");
  const [text, setText] = useState("");
  const [speakerId, setSpeakerId] = useState<number>(speakers[0]?.id ?? 1);
  const [speed, setSpeed] = useState(1.0);
  const [alpha, setAlpha] = useState(0.28);
  const [beta, setBeta] = useState(0.72);
  const [diffusionSteps, setDiffusionSteps] = useState(8);
  const [embeddingScale, setEmbeddingScale] = useState(1.15);
  const [voiceMode, setVoiceMode] = useState<
    "unified-main" | "unified-multilingual" | "dual"
  >("unified-main");
  const [personaId, setPersonaId] = useState("natural");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showChunksPreview, setShowChunksPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [addingVoiceFor, setAddingVoiceFor] = useState<number | null>(null);
  const [expandedArticleId, setExpandedArticleId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const selectedSpeakerId =
    speakers.some((s) => s.id === speakerId) ? speakerId : (speakers[0]?.id ?? 0);

  const liveChunks = useMemo(
    () => (text.trim() ? splitPersianTextForXTTS(text, 220) : []),
    [text]
  );

  const applyPreset = (idx: number) => {
    const p = ARTICLE_PRESETS[idx];
    if (!p) return;
    setTitle(p.title);
    setSlug(p.slug);
    setPublisherName(p.publisherName);
    setCategory(p.category);
    setText(p.text);
    setShowChunksPreview(true);
    setFeedback(null);
  };

  const handleSynthesize = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          slug: slug.trim() || undefined,
          publisherName,
          category,
          text,
          speakerId: selectedSpeakerId,
          speed,
          alpha,
          beta,
          diffusionSteps,
          embeddingScale,
          voiceMode,
          persona: personaId,
        }),
      });
      const data = await res.json();
      const warnings: string[] = Array.isArray(data.warnings) ? data.warnings : [];
      if (!res.ok) {
        setFeedback({
          type: "error",
          message: data.error || "خطا در تولید فایل صوتی",
        });
        return;
      }

      if (data.degraded) {
        // متن درخواستی خوانده نشده است — فرم پاک نمی‌شود تا کاربر بتواند دوباره تلاش کند
        setFeedback({
          type: "error",
          message: `${data.message} ${warnings.join(" ")}`,
        });
        await onRefresh();
        return;
      }

      const fidelity = data.textFidelity ?? {};
      const coveragePct = Math.round((fidelity.coverage ?? 0) * 100);
      setFeedback({
        type: warnings.length > 0 ? "error" : "success",
        message:
          warnings.length > 0
            ? warnings.join(" ")
            : `مقاله «${data.article.title}» با صدای ${data.track.speakerName} تولید شد • راستی‌آزمایی متن: ${toPersianDigits(
                fidelity.requestedChars ?? 0
              )} کاراکتر درخواستی، پوشش خوانش ${toPersianDigits(coveragePct)}٪ • مدت ${
                data.track.durationSec
              } ثانیه`,
      });
      setTitle("");
      setSlug("");
      setText("");
      setShowChunksPreview(false);
      await onRefresh();
    } catch {
      setFeedback({
        type: "error",
        message: "ارتباط با سرویس پردازش صوت برقرار نشد.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddSpeakerToArticle = async (
    articleId: number,
    targetSpeakerId: number
  ) => {
    setAddingVoiceFor(articleId);
    setFeedback(null);
    try {
      const res = await fetch("/api/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          articleId,
          speakerId: targetSpeakerId,
          speed: 1.0,
          alpha: 0.28,
          beta: 0.72,
          diffusionSteps: 8,
          embeddingScale: 1.15,
          voiceMode: "unified-main",
          persona: personaId,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setFeedback({
          type: "success",
          message: `صدای «${data.track.speakerName}» به مانیفست صوتی مقاله اضافه شد.`,
        });
        await onRefresh();
      }
    } finally {
      setAddingVoiceFor(null);
    }
  };

  const handleDeleteArticle = async (articleId: number) => {
    const res = await fetch(`/api/synthesize?articleId=${articleId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      await onRefresh();
    }
  };

  return (
    <div className="space-y-6">
      {/* نوار شاخص‌های کلیدی عملکرد سرور */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">
              مقالات و فایل‌های صوتی
            </span>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
              <FileAudio className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-slate-900">
              {toPersianDigits(stats.totalArticles)}
            </span>
            <span className="text-xs text-slate-500">
              مقاله ({toPersianDigits(stats.totalAudioTracks)} خروجی WAV)
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            مجموع زمان ذخیره‌شده: {formatDurationFa(stats.totalAudioSec)} دقیقه
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">
              گویندگان فعال سرور
            </span>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
              <Mic2 className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-slate-900">
              {toPersianDigits(stats.totalSpeakers)}
            </span>
            <span className="text-xs text-slate-500">
              فایل مرجع و بردار شرطی کش‌شده
            </span>
          </div>
          <p className="mt-1 text-[11px] text-emerald-700">
            {toPersianDigits(stats.humanTracks ?? 0)} فایل با صدای واقعی انسان
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">
              مدل فعال موتور StyleTTS 2
            </span>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
              <Cpu className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2.5 text-[11px] font-bold text-teal-800">
            مدل C جدید • Diffusion + WavLM SLM
          </div>
          <div className="ltr-code truncate text-xs font-bold text-slate-900">
            {stats.activeCheckpoint}
          </div>
          <p className="mt-1 text-[11px] text-emerald-700">
            {toPersianDigits(stats.finetunedModels)} چک‌پوینت StyleTTS 2 • آفلاین کامل
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">
              سرعت iSTFTNet (RTF) و کیفیت
            </span>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
              <AudioLines className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="ltr-code text-2xl font-extrabold text-slate-900">
              {stats.avgRtf}x
            </span>
            <span className="text-xs text-emerald-700 font-medium">
              ۱۲ برابر سریع‌تر از پخش زنده
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            ۲۴kHz • دوزبانه FA+EN • ‎-16 LUFS
          </p>
        </div>
      </div>

      {/* فرم ورود و تأیید مقاله توسط ادمین سایت */}
      <form
        onSubmit={handleSynthesize}
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs"
      >
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              ثبت، تأیید و تبدیل مقاله فارسی به گفتار
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              اعداد فارسی با دقت کامل به حروف تبدیل می‌شوند و حروف و واژه‌های انگلیسی بدون تبدیل به فارسی، با همان صدای اصلی گوینده (تک‌صدای یکدست) خوانده و ذخیره می‌شوند.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {ARTICLE_PRESETS.map((preset, idx) => (
              <button
                key={preset.slug}
                type="button"
                onClick={() => applyPreset(idx)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-teal-500 hover:bg-teal-50 hover:text-teal-800"
              >
                <Sparkles className="h-3.5 w-3.5 text-teal-600" />
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-12">
          <div className="md:col-span-6">
            <label className="mb-1.5 block text-xs font-semibold text-slate-700">
              عنوان مقاله
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="مثلاً: بررسی تخصصی پردازنده نسل جدید در لپ‌تاپ‌های حرفه‌ای"
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-teal-600 focus:bg-white focus:ring-2 focus:ring-teal-600/15"
            />
          </div>

          <div className="md:col-span-3">
            <label className="mb-1.5 block text-xs font-semibold text-slate-700">
              شناسه یکتا در ویجت (Slug)
            </label>
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="zoomit-article-1404"
              dir="ltr"
              className="ltr-code w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-xs text-slate-800 outline-none transition focus:border-teal-600 focus:bg-white focus:ring-2 focus:ring-teal-600/15"
            />
          </div>

          <div className="md:col-span-3">
            <label className="mb-1.5 block text-xs font-semibold text-slate-700">
              رسانه / دسته‌بندی
            </label>
            <div className="flex gap-2">
              <select
                value={publisherName}
                onChange={(e) => setPublisherName(e.target.value)}
                className="w-1/2 rounded-xl border border-slate-200 bg-slate-50/50 px-2.5 py-2.5 text-xs font-medium text-slate-800 outline-none focus:border-teal-600 focus:bg-white"
              >
                <option value="زومیت">زومیت</option>
                <option value="دیجیاتو">دیجیاتو</option>
                <option value="کجارو">کجارو</option>
              </select>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-1/2 rounded-xl border border-slate-200 bg-slate-50/50 px-2.5 py-2.5 text-xs text-slate-800 outline-none focus:border-teal-600 focus:bg-white"
              />
            </div>
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-700">
              متن فارسی مقاله
            </label>
            <span className="text-[11px] text-slate-400">
              {toPersianDigits(text.length)} کاراکتر •{" "}
              {toPersianDigits(liveChunks.length)} قطعه واجی StyleTTS 2 (IPA)
            </span>
          </div>
          <textarea
            rows={4}
            required
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="متن مقاله را وارد کنید... (اعداد فارسی مانند 3.05، ٪۴۲٫۵ و $1,999 دقیق به حروف تبدیل می‌شوند و حروف و واژه‌های انگلیسی مانند StyleTTS 2، RTX 5090، GPT-4o، Galaxy A57 و A/B/C بدون تبدیل فارسی، دقیقاً انگلیسی خوانده می‌شوند)"
            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 text-sm leading-7 text-slate-900 outline-none transition focus:border-teal-600 focus:bg-white focus:ring-2 focus:ring-teal-600/15"
          />
        </div>

        {/* انتخاب گوینده و کنترل سرعت */}
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <label className="mb-1.5 block text-xs font-semibold text-slate-700">
              انتخاب گوینده (وزن فاین‌تیون‌شده دوبلور یا کلون صفر شات)
            </label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {speakers.map((sp) => {
                const active = sp.id === selectedSpeakerId;
                return (
                  <button
                    key={sp.id}
                    type="button"
                    onClick={() => setSpeakerId(sp.id)}
                    className={`rounded-xl border p-3 text-right transition ${
                      active
                        ? "border-teal-600 bg-teal-50/70 ring-1 ring-teal-600"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-bold text-slate-900 truncate">
                        {sp.displayName}
                      </span>
                      <span
                        className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                          sp.speakerCode === "dorsa_radmehr"
                            ? "bg-emerald-700 text-white"
                            : sp.speakerCode === "sara_tehrani"
                              ? "bg-indigo-700 text-white"
                              : sp.mode === "finetuned"
                                ? "bg-teal-700 text-white"
                                : "bg-slate-200 text-slate-700"
                        }`}
                      >
                        {sp.speakerCode === "dorsa_radmehr"
                          ? "مدل C جدید • StyleTTS 2"
                          : sp.speakerCode === "sara_tehrani"
                            ? "مدل B • FA+EN"
                            : sp.speakerCode === "arash_rad"
                              ? "مدل A • FA+EN"
                              : "کلون ref_s • FA+EN"}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-[11px] text-slate-500">
                      شباهت {toPersianDigits(sp.similarityScore)}٪ •{" "}
                      {sp.gender === "female" ? "زن" : "مرد"}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 lg:col-span-5">
            <div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700">
                  سرعت پایه سنتز صدا (speed)
                </span>
                <span className="ltr-code font-bold text-teal-700">
                  {speed.toFixed(2)}x
                </span>
              </div>
              <input
                type="range"
                min={0.7}
                max={1.5}
                step={0.05}
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
                className="mt-2 w-full accent-teal-700"
              />
            </div>

            <div>
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">
                حالت صدای انگلیسی (رفع باگ مدل B)
              </span>
              <div className="grid grid-cols-1 gap-1.5">
                <button
                  type="button"
                  onClick={() => setVoiceMode("unified-main")}
                  className={`rounded-lg border px-2.5 py-1.5 text-right text-[11px] font-semibold transition ${
                    voiceMode === "unified-main"
                      ? "border-teal-600 bg-teal-50 text-teal-900 ring-1 ring-teal-600"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                  }`}
                >
                  تک‌صدای اصلی ✓ پیش‌فرض — انگلیسی با همان صدای فارسی
                </button>
                <button
                  type="button"
                  onClick={() => setVoiceMode("unified-multilingual")}
                  className={`rounded-lg border px-2.5 py-1.5 text-right text-[11px] font-semibold transition ${
                    voiceMode === "unified-multilingual"
                      ? "border-indigo-600 bg-indigo-50 text-indigo-900 ring-1 ring-indigo-600"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                  }`}
                >
                  تک‌صدای چندزبانه — یک گوینده multilingual برای هر دو زبان
                </button>
                <button
                  type="button"
                  onClick={() => setVoiceMode("dual")}
                  className={`rounded-lg border px-2.5 py-1.5 text-right text-[11px] font-semibold transition ${
                    voiceMode === "dual"
                      ? "border-amber-600 bg-amber-50 text-amber-900 ring-1 ring-amber-600"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                  }`}
                >
                  دوصدایی قدیمی (فقط مقایسه) — صدای انگلیسی متفاوت!
                </button>
              </div>
            </div>

            <div>
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">
                پرسونای صوتی (سبک خوانش — کاملاً لوکال)
              </span>
              <div className="grid grid-cols-1 gap-1.5">
                {VOICE_PERSONAS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPersonaId(p.id)}
                    title={p.descriptionFa}
                    className={`rounded-lg border px-2.5 py-2 text-right text-[11px] transition ${
                      personaId === p.id
                        ? "border-emerald-600 bg-emerald-50 text-emerald-900 ring-1 ring-emerald-600"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    <span className="font-bold">{p.labelFa}</span>
                    <span className="mt-0.5 block text-[10px] font-normal leading-4">
                      سرعت {p.speed}× • کادنس {p.cadence.sentence}ms • {p.diffusionSteps} گام
                    </span>
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[10px] leading-4 text-slate-500">
                {getVoicePersona(personaId).descriptionFa}
              </p>
            </div>

            <div className="mt-2 flex items-center justify-between gap-2 text-xs">
              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="inline-flex items-center gap-1 font-medium text-slate-600 hover:text-teal-700"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                تنظیمات انتشار استایل StyleTTS 2
              </button>
              {liveChunks.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowChunksPreview((v) => !v)}
                  className="inline-flex items-center gap-1 font-medium text-teal-700 hover:underline"
                >
                  {showChunksPreview ? "بستن پیش‌نمایش" : "پیش‌نمایش دوزبانه (FA + EN)"}
                </button>
              )}
            </div>
          </div>
        </div>

        {showAdvanced && (
          <div className="mt-3 grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="flex justify-between text-xs">
                <span className="font-medium text-slate-700">
                  طنین آکوستیک (alpha)
                </span>
                <span className="ltr-code font-semibold text-slate-900">
                  {alpha.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min={0.0}
                max={0.8}
                step={0.02}
                value={alpha}
                onChange={(e) => setAlpha(Number(e.target.value))}
                className="mt-1.5 w-full accent-teal-700"
              />
              <p className="text-[10.5px] text-slate-500">
                ۰ = ۱۰۰٪ طنین ref_s • ۰.۲۸ بهینه‌ترین تعادل انسانی.
              </p>
            </div>
            <div>
              <div className="flex justify-between text-xs">
                <span className="font-medium text-slate-700">
                  تنوع پروزودی و لحن (beta)
                </span>
                <span className="ltr-code font-semibold text-slate-900">
                  {beta.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min={0.1}
                max={0.95}
                step={0.02}
                value={beta}
                onChange={(e) => setBeta(Number(e.target.value))}
                className="mt-1.5 w-full accent-teal-700"
              />
              <p className="text-[10.5px] text-slate-500">
                ۰.۶۵ تا ۰.۷۵ آهنگ طبیعی گوینده خبر و بررسی را می‌سازد.
              </p>
            </div>
            <div>
              <div className="flex justify-between text-xs">
                <span className="font-medium text-slate-700">
                  گام انتشار (diffusion_steps)
                </span>
                <span className="ltr-code font-semibold text-slate-900">
                  {diffusionSteps}
                </span>
              </div>
              <input
                type="range"
                min={4}
                max={20}
                step={1}
                value={diffusionSteps}
                onChange={(e) => setDiffusionSteps(Number(e.target.value))}
                className="mt-1.5 w-full accent-teal-700"
              />
              <p className="text-[10.5px] text-slate-500">
                نمونه‌بردار ADPM2 + Karras (۸ گام کیفیت استودیویی).
              </p>
            </div>
            <div>
              <div className="flex justify-between text-xs">
                <span className="font-medium text-slate-700">
                  هدایت PL-BERT (CFG scale)
                </span>
                <span className="ltr-code font-semibold text-slate-900">
                  {embeddingScale.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min={0.9}
                max={2.0}
                step={0.05}
                value={embeddingScale}
                onChange={(e) => setEmbeddingScale(Number(e.target.value))}
                className="mt-1.5 w-full accent-teal-700"
              />
              <p className="text-[10.5px] text-slate-500">
                ۱.۱۰ تا ۱.۲۵ برای بیان رسا بدون اغراق احساسی.
              </p>
            </div>
          </div>
        )}

        {showChunksPreview && liveChunks.length > 0 && (
          <div className="mt-3 rounded-xl border border-teal-200/80 bg-teal-50/40 p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-bold text-teal-900">
                خروجی دوزبانه StyleTTS 2 (اعداد حروفی فارسی + حفظ ۱۰۰٪ انگلیسی بومی):
              </span>
              <span className="text-[11px] text-teal-700">
                پیوستگی لحن LFinference (s_prev = 0.70)
              </span>
            </div>
            <div className="space-y-1.5">
              {liveChunks.map((ch, idx) => {
                const spans = segmentBilingualText(ch);
                return (
                  <div
                    key={idx}
                    className="flex items-start gap-2 rounded-lg bg-white/90 px-3 py-2 text-xs text-slate-800 ring-1 ring-teal-200/60"
                  >
                    <span className="shrink-0 rounded bg-teal-700 px-1.5 py-0.5 text-[10px] font-bold text-white">
                      قطعه {toPersianDigits(idx + 1)}
                    </span>
                    <div className="flex flex-wrap items-center gap-1 leading-6">
                      {spans.map((sp, sIdx) =>
                        sp.lang === "en" ? (
                          <span
                            key={sIdx}
                            dir="ltr"
                            title={`خوانش انگلیسی: ${sp.spoken}`}
                            className="ltr-code rounded bg-indigo-50 px-1.5 py-0.5 text-[11px] font-bold text-indigo-800 ring-1 ring-indigo-200"
                          >
                            {sp.text}
                          </span>
                        ) : (
                          <span key={sIdx}>{sp.text}</span>
                        )
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {feedback && (
          <div
            className={`mt-4 flex items-center gap-2 rounded-xl border px-4 py-3 text-xs font-medium ${
              feedback.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-rose-200 bg-rose-50 text-rose-800"
            }`}
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{feedback.message}</span>
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <span className="text-xs text-slate-500">
            ذخیره‌سازی مستقیم روی دیسک سرور داخلی • آماده فراخوانی فوری در ویجت JS
          </span>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-teal-800 disabled:opacity-60"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                در حال پردازش و سنتز صدا...
              </>
            ) : (
              <>
                <AudioLines className="h-4 w-4" />
                تأیید مقاله و تولید فایل صوتی
              </>
            )}
          </button>
        </div>
      </form>

      {/* لیست مقالات پردازش‌شده و فایل‌های صوتی روی سرور */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900">
            آرشیو مقالات صوتی آماده‌شده روی سرور ({toPersianDigits(articles.length)})
          </h3>
          <span className="text-xs text-slate-500">
            پشتیبانی از چند گوینده هم‌زمان برای هر مقاله
          </span>
        </div>

        {articles.map((article) => {
          const existingSpeakerIds = new Set(article.tracks.map((t) => t.speakerId));
          const missingSpeakers = speakers.filter(
            (s) => !existingSpeakerIds.has(s.id)
          );
          const isExpanded = expandedArticleId === article.id;

          return (
            <div
              key={article.id}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs transition hover:border-slate-300"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700 ring-1 ring-rose-200/70">
                      {article.publisherName}
                    </span>
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                      {article.category}
                    </span>
                    <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                      تأیید و ذخیره‌شده
                    </span>
                    <span className="ltr-code text-[11px] text-slate-400">
                      /{article.slug}
                    </span>
                  </div>
                  <h4 className="mt-2 text-base font-bold text-slate-900">
                    {article.title}
                  </h4>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenInWidget(article.slug)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-teal-600 hover:text-teal-700"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    تست در ویجت سایت
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteArticle(article.id)}
                    title="حذف مقاله و فایل‌های صوتی"
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {article.tracks.length > 0 && (
                <div className="mt-4">
                  <WaveformPlayer tracks={article.tracks} />
                </div>
              )}

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
                <div className="flex flex-wrap items-center gap-1.5">
                  {missingSpeakers.length > 0 && (
                    <>
                      <span className="text-slate-500">
                        تولید نسخه صوتی با گوینده دیگر:
                      </span>
                      {missingSpeakers.map((sp) => (
                        <button
                          key={sp.id}
                          type="button"
                          disabled={addingVoiceFor === article.id}
                          onClick={() =>
                            handleAddSpeakerToArticle(article.id, sp.id)
                          }
                          className="inline-flex items-center gap-1 rounded-lg border border-dashed border-slate-300 px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition hover:border-teal-600 hover:bg-teal-50 hover:text-teal-800 disabled:opacity-50"
                        >
                          {addingVoiceFor === article.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Plus className="h-3 w-3" />
                          )}
                          {sp.displayName}
                        </button>
                      ))}
                    </>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setExpandedArticleId(isExpanded ? null : article.id)
                  }
                  className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800"
                >
                  {isExpanded ? (
                    <>
                      بستن متن و قطعات
                      <ChevronUp className="h-3.5 w-3.5" />
                    </>
                  ) : (
                    <>
                      متن نرمال‌شده ({toPersianDigits(article.chunksJson.length)}{" "}
                      قطعه)
                      <ChevronDown className="h-3.5 w-3.5" />
                    </>
                  )}
                </button>
              </div>

              {isExpanded && (
                <div className="mt-3 space-y-2 rounded-xl border border-slate-100 bg-slate-50 p-3.5 text-xs text-slate-700">
                  <div>
                    <span className="font-bold text-slate-900">متن اصلی: </span>
                    <span className="leading-6">{article.rawText}</span>
                  </div>
                  <div className="border-t border-slate-200/80 pt-2">
                    <span className="font-bold text-teal-800">
                      متن دوزبانه آماده StyleTTS 2 (انگلیسی حفظ‌شده + اعداد دقیق):{" "}
                    </span>
                    <span className="leading-6">{article.normalizedText}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
