"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Bug,
  CheckCircle2,
  Cpu,
  Hash,
  Languages,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Sparkles,
  UserRound,
  Volume2,
  Wrench,
  XCircle,
} from "lucide-react";
import {
  pronunciationAudit,
  toBilingualIPAPreview,
  toPersianDigits,
} from "@/lib/persian-nlp";

interface DebugCheck {
  id: string;
  group: string;
  title: string;
  status: "pass" | "warn" | "fail";
  detail: string;
  fix?: string;
}

interface PronunciationSuiteRow {
  input: string;
  output: string;
  spoken: string;
  passed: boolean;
}

interface NumberSuiteRow {
  label: string;
  input: string;
  output: string;
  passed: boolean;
}

interface DebugReport {
  engine: string;
  modelC: {
    id: number;
    runName: string;
    speakerName: string;
    speakerDisplayName: string;
    checkpointPath: string;
    datasetName: string;
    epochs: number;
    batchSize: number;
    gradAccumSteps: number;
    learningRate: string;
    alpha: number;
    beta: number;
    diffusionSteps: number;
    slmAdversarial: boolean;
    initialMelLoss: number;
    finalMelLoss: number;
    trainSegments: number;
    evalSegments: number;
    tracksCount: number;
    isActive: boolean;
    faVoice: string;
    enVoice: string;
    calibratedPitch: string;
    styleVectorDim: number;
    ipaSymbols: number;
  } | null;
  modelB: {
    id: number;
    runName: string;
    speakerDisplayName: string;
    epochs: number;
    alpha: number;
    beta: number;
    diffusionSteps: number;
    initialMelLoss: number;
    finalMelLoss: number;
    isActive: boolean;
    faVoice: string;
    enVoice: string;
    calibratedPitch: string;
    persona?: string;
    personaLabel?: string;
    personaEffects?: string[];
    personaTracksCount?: number;
    tracksCount?: number;
  } | null;
  modelA: {
    id: number;
    runName: string;
    speakerDisplayName: string;
    epochs: number;
    initialMelLoss: number;
    finalMelLoss: number;
    isActive: boolean;
    faVoice: string;
    enVoice: string;
  } | null;
  pronunciation: {
    mode: string;
    ipaSymbols: number;
    hintsCount: number;
    suite: PronunciationSuiteRow[];
    numberSuite: NumberSuiteRow[];
    pythonParity: { passed: boolean; symbols: number; detail: string };
  };
  humanVoice: {
    engineAvailable: boolean;
    assets: number;
    defaultVoiceMode?: string;
    defaultVoices: { modelC: string; female: string; male: string };
    humanTracks: number;
    bilingualTracks: number;
    unifiedTracks?: number;
    splitVoiceTracks?: string[];
    totalTracks: number;
  };
  checks: DebugCheck[];
  defects: Array<{
    kind: string;
    id: number;
    filename: string;
    speaker: string;
    reason: string;
  }>;
  summary: {
    total: number;
    passed: number;
    warnings: number;
    failed: number;
    defects: number;
  };
  checkedAt: string;
}

interface RepairResult {
  ok: boolean;
  message: string;
  fixes: Array<{ filename: string; engine: string; reason: string }>;
}

interface LiveProbeResult {
  ok: boolean;
  engine: string;
  model: "C" | "B" | "A";
  voiceMode?: string;
  persona?: string;
  personaLabel?: string;
  personaProfile?: Record<string, unknown> | null;
  unifiedVoice?: string | null;
  voiceConsistency?: number;
  voicePlanDescription?: string;
  faVoice: string;
  enVoice: string;
  pitch: string;
  alpha: number;
  beta: number;
  diffusionSteps: number;
  normalizedText: string;
  ipaPreview: string;
  englishTermsSpoken: Array<{ text: string; spoken: string }>;
  durationSec: number;
  audioUrl: string;
}

const DEFAULT_PROBE_TEXT =
  "مدل C با موتور مرکزی StyleTTS 2، انکودر PL-BERT و WavLM، تراشه NVIDIA RTX 5090 و GPT-4o را با قیمت $1,999، دقت 3.05، رشد ٪۴۲٫۵، پورت A و B و نمایشگر LTPO 120Hz بدون خطا خواند.";

const STATUS_STYLES: Record<
  DebugCheck["status"],
  { label: string; className: string; icon: typeof CheckCircle2 }
> = {
  pass: {
    label: "سالم",
    className: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    icon: CheckCircle2,
  },
  warn: {
    label: "هشدار",
    className: "bg-amber-50 text-amber-800 ring-amber-200",
    icon: AlertTriangle,
  },
  fail: {
    label: "نیازمند تعمیر",
    className: "bg-rose-50 text-rose-800 ring-rose-200",
    icon: XCircle,
  },
};

export function DebugModelTab({ onRefresh }: { onRefresh: () => Promise<void> }) {
  const [report, setReport] = useState<DebugReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [repairing, setRepairing] = useState(false);
  const [repair, setRepair] = useState<RepairResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // آزمایشگاه زنده مدل جدید C (StyleTTS 2)
  const [probeText, setProbeText] = useState(DEFAULT_PROBE_TEXT);
  const [probeModel, setProbeModel] = useState<"C" | "B" | "A">("B");
  const [probeVoiceMode, setProbeVoiceMode] = useState<
    "unified-main" | "unified-multilingual" | "dual"
  >("unified-main");
  const [probeSpeed, setProbeSpeed] = useState(1.0);
  const [probeAlpha, setProbeAlpha] = useState(0.28);
  const [probeBeta, setProbeBeta] = useState(0.72);
  const [probeSteps, setProbeSteps] = useState(8);
  const [probePersona, setProbePersona] = useState<"natural" | "assistant-calm">(
    "assistant-calm"
  );
  const [probing, setProbing] = useState(false);
  const [probeResult, setProbeResult] = useState<LiveProbeResult | null>(null);
  const [probeError, setProbeError] = useState<string | null>(null);
  const [probePlaying, setProbePlaying] = useState(false);
  const probeAudioRef = useRef<HTMLAudioElement | null>(null);

  const liveAudit = useMemo(() => pronunciationAudit(probeText), [probeText]);
  const liveIpa = useMemo(
    () => toBilingualIPAPreview(liveAudit.normalized),
    [liveAudit.normalized]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/debug/model-a", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "خطا");
      setReport(data);
      setError(null);
    } catch {
      setError("دریافت گزارش ممیزی StyleTTS 2 ناموفق بود.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const runRepair = async () => {
    setRepairing(true);
    setRepair(null);
    setError(null);
    try {
      const res = await fetch("/api/debug/model-a", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "repair" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "خطا");
      setRepair(data);
      await load();
      await onRefresh();
    } catch {
      setError("اجرای تعمیر خودکار ناموفق بود.");
    } finally {
      setRepairing(false);
    }
  };

  const handleRunLiveProbe = async (e: React.FormEvent) => {
    e.preventDefault();
    setProbing(true);
    setProbeError(null);
    try {
      const res = await fetch("/api/debug/model-a", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "live_test",
          model: probeModel,
          text: probeText,
          speed: probeSpeed,
          alpha: probeAlpha,
          beta: probeBeta,
          diffusionSteps: probeSteps,
          voiceMode: probeVoiceMode,
          persona: probePersona,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setProbeError(data.error ?? "خطا در تولید تست صوتی StyleTTS 2");
        return;
      }
      setProbeResult(data);
      setTimeout(() => {
        probeAudioRef.current?.play().catch(() => {});
      }, 80);
    } catch {
      setProbeError("ارتباط با موتور مرکزی StyleTTS 2 برقرار نشد.");
    } finally {
      setProbing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[45vh] flex-col items-center justify-center gap-3 text-slate-500">
        <Loader2 className="h-7 w-7 animate-spin text-teal-700" />
        <span className="text-sm font-medium">
          در حال ممیزی مدل جدید C و موتور مرکزی StyleTTS 2...
        </span>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center text-sm text-rose-800">
        <p className="font-bold">{error}</p>
        <button
          type="button"
          onClick={load}
          className="mt-3 rounded-xl bg-rose-700 px-4 py-2 text-xs font-bold text-white"
        >
          تلاش مجدد
        </button>
      </div>
    );
  }

  const groups = Array.from(new Set(report.checks.map((c) => c.group)));

  return (
    <div className="space-y-6">
      {/* شاخص‌های سلامت کل خط لوله StyleTTS 2 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
          <div className="flex items-center gap-2 text-xs font-bold text-emerald-900">
            <CheckCircle2 className="h-4 w-4" />
            بررسی‌های StyleTTS 2
          </div>
          <div className="mt-1.5 text-2xl font-extrabold text-emerald-800">
            {toPersianDigits(report.summary.passed)}
            <span className="mr-1 text-xs font-medium text-emerald-700">
              از {toPersianDigits(report.summary.total)} سالم
            </span>
          </div>
        </div>
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50/70 p-4">
          <div className="flex items-center gap-2 text-xs font-bold text-indigo-900">
            <Languages className="h-4 w-4" />
            خوانش بومی EN (IPA)
          </div>
          <div className="mt-1.5 text-2xl font-extrabold text-indigo-900">
            {toPersianDigits(
              report.pronunciation.suite.filter((r) => r.passed).length
            )}
            <span className="mr-1 text-xs font-medium text-indigo-700">
              از {toPersianDigits(report.pronunciation.suite.length)} (
              {toPersianDigits(report.pronunciation.ipaSymbols)} نماد IPA)
            </span>
          </div>
        </div>
        <div className="rounded-2xl border border-teal-200 bg-teal-50/70 p-4">
          <div className="flex items-center gap-2 text-xs font-bold text-teal-900">
            <Hash className="h-4 w-4" />
            دقت خوانش اعداد
          </div>
          <div className="mt-1.5 text-2xl font-extrabold text-teal-900">
            {toPersianDigits(
              report.pronunciation.numberSuite.filter((r) => r.passed).length
            )}
            <span className="mr-1 text-xs font-medium text-teal-700">
              از {toPersianDigits(report.pronunciation.numberSuite.length)} الگو
            </span>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
            <UserRound className="h-4 w-4 text-teal-700" />
            صوت انسانی دوزبانه
          </div>
          <div className="mt-1.5 text-2xl font-extrabold text-slate-900">
            {toPersianDigits(report.humanVoice.bilingualTracks)}
            <span className="mr-1 text-xs font-medium text-slate-500">
              از {toPersianDigits(report.humanVoice.totalTracks)} فایل ۲۴kHz
            </span>
          </div>
        </div>
      </div>

      {/* کارت مدل جدید C (StyleTTS 2) */}
      {report.modelC && (
        <div className="rounded-2xl border border-teal-300 bg-white p-6 shadow-xs">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-700 text-white">
                <Cpu className="h-5 w-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-extrabold text-slate-900">
                    مدل جدید C — موتور مرکزی StyleTTS 2 (پیاده‌سازی کامل کل فرآیند)
                  </h2>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-0.5 text-[11px] font-bold text-white">
                    <Sparkles className="h-3 w-3" />
                    چک‌پوینت فعال سرور
                  </span>
                </div>
                <p className="ltr-code mt-1 text-xs text-slate-600">
                  {report.modelC.runName} • {report.modelC.speakerDisplayName} •{" "}
                  {report.modelC.faVoice} + {report.modelC.enVoice} (Pitch{" "}
                  {report.modelC.calibratedPitch})
                </p>
                <p className="ltr-code mt-0.5 truncate text-[11px] text-slate-400">
                  {report.modelC.checkpointPath}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={load}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 transition hover:border-teal-600 hover:text-teal-700"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                ممیزی مجدد
              </button>
              <button
                type="button"
                onClick={runRepair}
                disabled={repairing}
                className="inline-flex items-center gap-1.5 rounded-xl bg-teal-700 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-teal-800 disabled:opacity-60"
              >
                {repairing ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    در حال همگام‌سازی...
                  </>
                ) : (
                  <>
                    <Wrench className="h-3.5 w-3.5" />
                    تعمیر و همگام‌سازی StyleTTS 2
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
            {[
              {
                label: "Style Diffusion",
                value: `α=${report.modelC.alpha} β=${report.modelC.beta}`,
              },
              {
                label: "گام انتشار / SLM",
                value: `${report.modelC.diffusionSteps} steps • WavLM`,
              },
              {
                label: "بردار استایل ref_s",
                value: `${report.modelC.styleVectorDim}-D (128+128)`,
              },
              {
                label: "STFT Mel Loss",
                value: `${report.modelC.initialMelLoss} → ${report.modelC.finalMelLoss}`,
              },
              {
                label: "جدول واجی PL-BERT",
                value: `${report.modelC.ipaSymbols} IPA (fa+en)`,
              },
              {
                label: "اپوک / مقالات C",
                value: `${report.modelC.epochs} ep • ${report.modelC.tracksCount} فایل`,
              },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-xl border border-slate-200 bg-slate-50/70 p-2.5"
              >
                <div className="text-[10.5px] text-slate-500">{item.label}</div>
                <div className="ltr-code mt-0.5 text-xs font-bold text-slate-900">
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* کارت پرسونای صوتی مدل B */}
      {report.modelB && (
        <div className="rounded-2xl border border-emerald-300 bg-white p-6 shadow-xs">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-700 text-white">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-extrabold text-slate-900">
                    مدل B — پرسونای صوتی دستیار هوش مصنوعی (آرام و گرم)
                  </h2>
                  <span className="inline-flex items-center rounded-full bg-emerald-700 px-2.5 py-0.5 text-[11px] font-bold text-white">
                    ۱۰۰٪ لوکال
                  </span>
                </div>
                <p className="ltr-code mt-1 text-xs text-slate-600">
                  {report.modelB.runName} • {report.modelB.speakerDisplayName} •{" "}
                  {report.modelB.faVoice} (تک‌صدا)
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  پرسونا: <span className="font-bold text-emerald-800">{report.modelB.personaLabel ?? report.modelB.persona}</span>
                  {typeof report.modelB.personaTracksCount === "number" &&
                    typeof report.modelB.tracksCount === "number" && (
                      <span className="mr-1.5">
                        • {toPersianDigits(report.modelB.personaTracksCount)}/
                        {toPersianDigits(report.modelB.tracksCount)} فایل همگام
                      </span>
                    )}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={runRepair}
              disabled={repairing}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-800 disabled:opacity-60"
            >
              {repairing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  در حال بازتولید...
                </>
              ) : (
                <>
                  <Wrench className="h-3.5 w-3.5" />
                  بازتولید مدل B با پرسونای دستیار
                </>
              )}
            </button>
          </div>

          {report.modelB.personaEffects && (
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {report.modelB.personaEffects.map((effect) => (
                <div
                  key={effect}
                  className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-[11px] text-slate-700"
                >
                  {effect}
                </div>
              ))}
            </div>
          )}

          <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-3.5 py-2.5 text-[11px] leading-6 text-emerald-900">
            <span className="font-bold">نکته شفافیت: </span>
            این پرسونا «ویژگی‌های سبکی» یک دستیار صوتی مدرن را روی موتور محلی بازسازی می‌کند
            (گرمی طنین، کادنس آرام، فرود نرم پایان جمله، تراز ثابت). هیچ صدا، وزن مدل یا
            سرویس شرکت ثالثی دانلود یا کلون نمی‌شود و تمام پردازش روی سرور خودتان انجام می‌گیرد.
          </p>
        </div>
      )}

      {/* آزمایشگاه زنده سنتز و تلفظ مدل C (StyleTTS 2) */}
      <form
        onSubmit={handleRunLiveProbe}
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs"
      >
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-700 text-white">
              <Volume2 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900">
                آزمایشگاه زنده StyleTTS 2 روی مدل C، B و A (انگلیسی بومی + اعداد دقیق + IPA)
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">
                حروف و واژه‌های انگلیسی بدون تبدیل به فارسی با واج‌های اصیل{" "}
                <code className="ltr-code font-semibold text-indigo-700">en-us</code>{" "}
                و فارسی و اعداد با واج‌های{" "}
                <code className="ltr-code font-semibold text-teal-700">fa</code>{" "}
                توسط صدای واقعی انسان خوانده می‌شوند.
              </p>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1 text-xs">
              <button
                type="button"
                onClick={() => setProbeModel("C")}
                className={`rounded-lg px-3 py-1 font-bold transition ${
                  probeModel === "C"
                    ? "bg-teal-700 text-white shadow-xs"
                    : "text-slate-600"
                }`}
              >
                مدل C جدید (درسا)
              </button>
              <button
                type="button"
                onClick={() => setProbeModel("B")}
                className={`rounded-lg px-3 py-1 font-bold transition ${
                  probeModel === "B"
                    ? "bg-indigo-700 text-white shadow-xs"
                    : "text-slate-600"
                }`}
              >
                مدل B (سارا)
              </button>
              <button
                type="button"
                onClick={() => setProbeModel("A")}
                className={`rounded-lg px-3 py-1 font-bold transition ${
                  probeModel === "A"
                    ? "bg-slate-800 text-white shadow-xs"
                    : "text-slate-600"
                }`}
              >
                مدل A (آرش)
              </button>
            </div>
            <div className="inline-flex rounded-xl border border-teal-200 bg-teal-50/60 p-1 text-[11px]">
              <button
                type="button"
                onClick={() => setProbeVoiceMode("unified-main")}
                title="انگلیسی با همان صدای اصلی مدل — رفع باگ مدل B"
                className={`rounded-lg px-2.5 py-1 font-bold transition ${
                  probeVoiceMode === "unified-main"
                    ? "bg-teal-700 text-white shadow-xs"
                    : "text-slate-600"
                }`}
              >
                تک‌صدا ✓
              </button>
              <button
                type="button"
                onClick={() => setProbeVoiceMode("unified-multilingual")}
                title="یک گوینده چندزبانه برای هر دو زبان"
                className={`rounded-lg px-2.5 py-1 font-bold transition ${
                  probeVoiceMode === "unified-multilingual"
                    ? "bg-indigo-700 text-white shadow-xs"
                    : "text-slate-600"
                }`}
              >
                چندزبانه
              </button>
              <button
                type="button"
                onClick={() => setProbeVoiceMode("dual")}
                title="حالت قدیمی: دو گوینده متفاوت (برای مقایسه باگ)"
                className={`rounded-lg px-2.5 py-1 font-bold transition ${
                  probeVoiceMode === "dual"
                    ? "bg-amber-600 text-white shadow-xs"
                    : "text-slate-600"
                }`}
              >
                دوصدا (قدیمی)
              </button>
            </div>
            <div className="inline-flex rounded-xl border border-emerald-200 bg-emerald-50/60 p-1 text-[11px]">
              <button
                type="button"
                onClick={() => setProbePersona("assistant-calm")}
                title="سبک دستیار هوش مصنوعی: آرام، گرم و یکنواخت (لوکال)"
                className={`rounded-lg px-2.5 py-1 font-bold transition ${
                  probePersona === "assistant-calm"
                    ? "bg-emerald-700 text-white shadow-xs"
                    : "text-slate-600"
                }`}
              >
                پرسونای دستیار
              </button>
              <button
                type="button"
                onClick={() => setProbePersona("natural")}
                title="خوانش خبری طبیعی"
                className={`rounded-lg px-2.5 py-1 font-bold transition ${
                  probePersona === "natural"
                    ? "bg-slate-700 text-white shadow-xs"
                    : "text-slate-600"
                }`}
              >
                طبیعی
              </button>
            </div>
          </div>
        </div>

        <textarea
          rows={2}
          value={probeText}
          onChange={(e) => setProbeText(e.target.value)}
          className="mt-4 w-full rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-sm leading-7 text-slate-900 outline-none focus:border-teal-600 focus:bg-white"
        />

        {/* پارامترهای Style Diffusion */}
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">alpha (طنین)</span>
              <span className="ltr-code font-bold text-slate-900">
                {probeAlpha.toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={0.8}
              step={0.02}
              value={probeAlpha}
              onChange={(e) => setProbeAlpha(Number(e.target.value))}
              className="mt-1 w-full accent-teal-700"
            />
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">beta (پروزودی)</span>
              <span className="ltr-code font-bold text-slate-900">
                {probeBeta.toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min={0.1}
              max={0.95}
              step={0.02}
              value={probeBeta}
              onChange={(e) => setProbeBeta(Number(e.target.value))}
              className="mt-1 w-full accent-teal-700"
            />
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">diffusion_steps</span>
              <span className="ltr-code font-bold text-slate-900">
                {probeSteps}
              </span>
            </div>
            <input
              type="range"
              min={4}
              max={20}
              step={1}
              value={probeSteps}
              onChange={(e) => setProbeSteps(Number(e.target.value))}
              className="mt-1 w-full accent-teal-700"
            />
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">speed (سرعت)</span>
              <span className="ltr-code font-bold text-slate-900">
                {probeSpeed.toFixed(2)}x
              </span>
            </div>
            <input
              type="range"
              min={0.75}
              max={1.45}
              step={0.05}
              value={probeSpeed}
              onChange={(e) => setProbeSpeed(Number(e.target.value))}
              className="mt-1 w-full accent-teal-700"
            />
          </div>
        </div>

        {/* پیش‌نمایش سگمنت‌های دوزبانه + دنباله واجی IPA */}
        {liveAudit.spans.length > 0 && (
          <div className="mt-3 space-y-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {liveAudit.spans.map((sp, idx) =>
                sp.lang === "en" ? (
                  <span
                    key={idx}
                    dir="ltr"
                    title={`خوانش انگلیسی: ${sp.spoken}`}
                    className="ltr-code inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2 py-0.5 text-[11px] font-semibold text-white"
                  >
                    <span>{sp.text}</span>
                    {sp.spoken !== sp.text && (
                      <span className="rounded bg-white/20 px-1 text-[9.5px] font-normal">
                        {sp.spoken}
                      </span>
                    )}
                  </span>
                ) : (
                  <span
                    key={idx}
                    className="rounded-lg bg-white px-2 py-0.5 text-xs text-slate-800 ring-1 ring-teal-200"
                  >
                    {sp.text}
                  </span>
                )
              )}
            </div>
            <div className="ltr-code truncate rounded-lg bg-slate-900 px-2.5 py-1.5 text-[10.5px] text-teal-300">
              PL-BERT IPA: /{probeResult?.ipaPreview || liveIpa}/
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          {probeResult ? (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-teal-200 bg-teal-50/60 px-3.5 py-2">
              <audio
                ref={probeAudioRef}
                src={probeResult.audioUrl}
                onPlay={() => setProbePlaying(true)}
                onPause={() => setProbePlaying(false)}
                onEnded={() => setProbePlaying(false)}
              />
              <button
                type="button"
                onClick={() => {
                  const el = probeAudioRef.current;
                  if (!el) return;
                  if (el.paused) el.play().catch(() => {});
                  else el.pause();
                }}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-700 text-white transition hover:bg-teal-800"
              >
                {probePlaying ? (
                  <Pause className="h-4 w-4 fill-current" />
                ) : (
                  <Play className="h-4 w-4 fill-current" />
                )}
              </button>
              <div className="text-xs">
                <div className="font-bold text-teal-950">
                  خروجی StyleTTS 2 مدل {probeResult.model} ({toPersianDigits(probeResult.durationSec)} ثانیه)
                  {probeResult.voiceConsistency === 1 ? (
                    <span className="mr-2 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white">
                      تک‌صدا ✓ یکدست
                    </span>
                  ) : (
                    <span className="mr-2 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white">
                      دوصدا (قدیمی)
                    </span>
                  )}
                </div>
                <div className="ltr-code text-[10.5px] text-teal-800">
                  {probeResult.voiceMode === "dual"
                    ? `${probeResult.faVoice} + ${probeResult.enVoice}`
                    : probeResult.unifiedVoice ?? probeResult.faVoice}{" "}
                  • α={probeResult.alpha} β={probeResult.beta} steps={probeResult.diffusionSteps}
                </div>
                {probeResult.personaLabel && (
                  <div className="mt-0.5 text-[10.5px] font-semibold text-emerald-800">
                    پرسونا: {probeResult.personaLabel} ({probeResult.persona})
                  </div>
                )}
                {probeResult.voicePlanDescription && (
                  <div className="mt-0.5 text-[10.5px] text-slate-600">
                    {probeResult.voicePlanDescription}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <span className="text-xs text-slate-500">
              برای شنیدن مستقیم تلفظ دوزبانه و اعداد در مدل C جدید روی دکمه روبه‌رو کلیک کنید.
            </span>
          )}

          <button
            type="submit"
            disabled={probing}
            className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-teal-800 disabled:opacity-60"
          >
            {probing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                در حال سنتز StyleTTS 2 (مدل {probeModel})...
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5 fill-current" />
                تولید و پخش زنده با مدل {probeModel}
              </>
            )}
          </button>
        </div>

        {probeError && (
          <p className="mt-2 text-xs font-semibold text-rose-600">{probeError}</p>
        )}
      </form>

      {/* جداول ۱۲گانه آزمون خوانش بومی انگلیسی و اعداد دقیق */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-5">
        <div>
          <div className="mb-2 text-xs font-bold text-slate-800">
            ۱. آزمون حفظ و خوانش بومی انگلیسی در StyleTTS 2 (عدم تبدیل به فارسی):
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {report.pronunciation.suite.map((row) => (
              <div
                key={row.input}
                className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="ltr-code text-xs font-bold text-slate-900">
                    {row.output}
                  </span>
                  <span
                    className={`text-[10px] font-bold ${
                      row.passed ? "text-emerald-700" : "text-rose-700"
                    }`}
                  >
                    {row.passed ? "✓ EN بومی" : "✗ خطا"}
                  </span>
                </div>
                <div className="ltr-code mt-0.5 text-[10.5px] text-indigo-700">
                  spoken: &quot;{row.spoken}&quot;
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs font-bold text-slate-800">
            ۲. آزمون ۱۲گانه خوانش دقیق اعداد (اعشار 3.05، ممیز فارسی، منفی، درصد، ارز، هزارگان و ترتیبی):
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {report.pronunciation.numberSuite.map((row) => (
              <div
                key={row.label}
                className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-slate-800">
                    {row.label}
                  </span>
                  <span
                    className={`text-[10px] font-bold ${
                      row.passed ? "text-emerald-700" : "text-rose-700"
                    }`}
                  >
                    {row.passed ? "✓ دقیق" : "✗ خطا"}
                  </span>
                </div>
                <div className="mt-0.5 text-[10.5px] text-slate-500">{row.input}</div>
                <div className="mt-0.5 text-[11px] font-medium text-teal-800">
                  ← {row.output}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-[11px] leading-6 text-slate-600">
          <span className="font-bold text-slate-800">
            هم‌ارزی موتور پایتون StyleTTS 2 و واج‌نگار IPA:{" "}
          </span>
          {report.pronunciation.pythonParity.detail}
        </div>
      </div>

      {repair && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-900">
          <div className="flex items-center gap-2 font-bold">
            <CheckCircle2 className="h-4 w-4" />
            {repair.message}
          </div>
        </div>
      )}

      {/* جزئیات بررسی‌ها */}
      <div className="space-y-4">
        {groups.map((group) => (
          <div
            key={group}
            className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs"
          >
            <div className="border-b border-slate-100 bg-slate-50/70 px-4 py-2.5 text-xs font-bold text-slate-800">
              {group}
            </div>
            <div className="divide-y divide-slate-100">
              {report.checks
                .filter((c) => c.group === group)
                .map((check) => {
                  const style = STATUS_STYLES[check.status];
                  const Icon = style.icon;
                  return (
                    <div
                      key={check.id}
                      className="flex flex-wrap items-start gap-3 px-4 py-3"
                    >
                      <span
                        className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-bold ring-1 ${style.className}`}
                      >
                        <Icon className="h-3 w-3" />
                        {style.label}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold text-slate-900">
                          {check.title}
                        </div>
                        <div className="mt-0.5 text-[11px] leading-5 text-slate-500">
                          {check.detail}
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        ))}
      </div>

      {report.defects.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
          <h3 className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-900">
            <Bug className="h-4 w-4" />
            موارد نیازمند بازتولید ({toPersianDigits(report.defects.length)})
          </h3>
          <ul className="mt-2 space-y-1.5">
            {report.defects.map((defect) => (
              <li
                key={`${defect.kind}-${defect.id}`}
                className="rounded-lg bg-white px-3 py-2 text-[11px] text-slate-700 ring-1 ring-amber-200"
              >
                <span className="ltr-code font-semibold text-slate-900">
                  {defect.filename}
                </span>
                <span className="mx-1.5 text-slate-400">|</span>
                {defect.speaker}
                <span className="mx-1.5 text-slate-400">|</span>
                <span className="text-amber-800">{defect.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-center text-[11px] text-slate-400">
        آخرین ممیزی StyleTTS 2: {new Date(report.checkedAt).toLocaleString("fa-IR")}
      </p>
    </div>
  );
}
