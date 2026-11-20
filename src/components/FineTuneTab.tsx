"use client";

import { useMemo, useState } from "react";
import {
  Check,
  CheckCircle2,
  Copy,
  Database,
  Layers,
  Loader2,
  Play,
  Sparkles,
  Terminal,
} from "lucide-react";
import type { FineTuneRunItem } from "@/types/studio";
import {
  buildLJSpeechPreviewFromScript,
  toBilingualIPAPreview,
  toPersianDigits,
} from "@/lib/persian-nlp";

const DEFAULT_STUDIO_SCRIPT =
  "در موتور مرکزی StyleTTS 2 با انکودر واجی PL-BERT، تراشه NVIDIA RTX 5090 و هوش مصنوعی GPT-4o دقیقاً به انگلیسی خوانده می‌شوند. اعداد تخصصی مانند 3.05، کاهش مصرف ٪۴۲٫۵ و قیمت $1,999 در نرخ ۲۴۰۰۰ هرتز با دقت کامل تلفظ می‌گردند. آموزش خصمانه WavLM SLM همراه با Style Diffusion شباهت صدای دوبلور را به سطح واقعی انسان می‌رساند.";

interface FineTuneTabProps {
  runs: FineTuneRunItem[];
  onRefresh: () => Promise<void>;
}

export function FineTuneTab({ runs, onRefresh }: FineTuneTabProps) {
  const [speakerDisplayName, setSpeakerDisplayName] = useState("");
  const [speakerName, setSpeakerName] = useState("");
  const [runName, setRunName] = useState("");
  const [gender, setGender] = useState<"male" | "female">("female");
  const [datasetHours, setDatasetHours] = useState(3.5);
  const [epochs, setEpochs] = useState(30);
  const [batchSize, setBatchSize] = useState(8);
  const [gradAccumSteps, setGradAccumSteps] = useState(4);
  const [learningRate, setLearningRate] = useState("1e-4");
  const [alpha, setAlpha] = useState(0.28);
  const [beta, setBeta] = useState(0.72);
  const [diffusionSteps, setDiffusionSteps] = useState(8);
  const [slmAdversarial, setSlmAdversarial] = useState(true);
  const [studioScript, setStudioScript] = useState(DEFAULT_STUDIO_SCRIPT);
  const [submitting, setSubmitting] = useState(false);
  const [activatingId, setActivatingId] = useState<number | null>(null);
  const [copiedCli, setCopiedCli] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const effectiveBatch = batchSize * gradAccumSteps;
  const codeSlug =
    speakerName.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_") ||
    "new_dubber";
  const resolvedRunName =
    runName.trim().toLowerCase().replace(/[^a-z0-9_\-]/g, "_") ||
    `styletts2_${codeSlug}_v1`;

  const ipaPreview = useMemo(
    () => buildLJSpeechPreviewFromScript(studioScript, codeSlug, 1.8, 12.0),
    [studioScript, codeSlug]
  );

  const cliCommand = `python -m app.finetune.train_styletts2 \\
  --run-name ${resolvedRunName} \\
  --speaker-name ${codeSlug} \\
  --dataset-dir /srv/avanegar/storage/datasets/${codeSlug}_24khz_ipa \\
  --base-model-dir /srv/avanegar/models/styletts2_fa_en_base \\
  --config configs/config_ft.yml \\
  --output-dir /srv/avanegar/models/checkpoints \\
  --speaker-ref /srv/avanegar/storage/speakers/${codeSlug}.wav \\
  --epochs ${epochs} --batch-size ${batchSize} --grad-accum ${gradAccumSteps} --lr ${learningRate} \\
  --alpha ${alpha} --beta ${beta} --diffusion-steps ${diffusionSteps}`;

  const handleCopyCli = async () => {
    await navigator.clipboard.writeText(cliCommand);
    setCopiedCli(true);
    setTimeout(() => setCopiedCli(false), 1800);
  };

  const handleStartFinetune = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/finetune", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runName: resolvedRunName,
          speakerName: codeSlug,
          speakerDisplayName,
          gender,
          datasetName: `${codeSlug}_24khz_ipa`,
          datasetHours,
          epochs,
          batchSize,
          gradAccumSteps,
          learningRate,
          alpha,
          beta,
          diffusionSteps,
          slmAdversarial,
          studioScript,
          activateNow: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({
          type: "error",
          text: data.error || "خطا در ثبت فاین‌تیون StyleTTS 2",
        });
      } else {
        setFeedback({ type: "success", text: data.message });
        setSpeakerDisplayName("");
        setSpeakerName("");
        setRunName("");
        await onRefresh();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleActivate = async (runId: number) => {
    setActivatingId(runId);
    try {
      const res = await fetch("/api/finetune", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId }),
      });
      if (res.ok) {
        await onRefresh();
      }
    } finally {
      setActivatingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleStartFinetune}
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs"
      >
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              فاین‌تیون اختصاصی موتور مرکزی StyleTTS 2 (Style Diffusion + WavLM SLM)
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              تقطیع ۲۴ کیلوهرتز فایل‌های استودیویی دوبلور، واج‌نگاری دوزبانه IPA (فارسی{" "}
              <code className="ltr-code rounded bg-slate-100 px-1 py-0.5 text-[10.5px]">fa</code>{" "}
              + انگلیسی بومی{" "}
              <code className="ltr-code rounded bg-slate-100 px-1 py-0.5 text-[10.5px]">en-us</code>
              )، ساخت <code className="ltr-code">train_list.txt</code> /{" "}
              <code className="ltr-code">OOD_texts.txt</code> و ذخیره{" "}
              <code className="ltr-code rounded bg-slate-100 px-1.5 py-0.5 text-[11px]">
                epoch_2nd_best.pth
              </code>{" "}
              به صورت ۱۰۰٪ آفلاین.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800 ring-1 ring-emerald-200">
            <Sparkles className="h-3.5 w-3.5" />
            دسته مؤثر: {toPersianDigits(effectiveBatch)} •{" "}
            {slmAdversarial ? "WavLM SLM فعال" : "بدون SLM"}
          </span>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-700">
              نام دوبلور مدل جدید
            </label>
            <input
              type="text"
              required
              value={speakerDisplayName}
              onChange={(e) => setSpeakerDisplayName(e.target.value)}
              placeholder="مثلاً: پندار نیکزاد"
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm outline-none focus:border-teal-600 focus:bg-white"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-700">
              شناسه دوبلور (speaker_name)
            </label>
            <input
              type="text"
              required
              dir="ltr"
              value={speakerName}
              onChange={(e) => setSpeakerName(e.target.value)}
              placeholder="pendar_nikzad"
              className="ltr-code w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-xs outline-none focus:border-teal-600 focus:bg-white"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-700">
              نام چک‌پوینت StyleTTS 2
            </label>
            <input
              type="text"
              dir="ltr"
              value={runName}
              onChange={(e) => setRunName(e.target.value)}
              placeholder={resolvedRunName}
              className="ltr-code w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-xs outline-none focus:border-teal-600 focus:bg-white"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-700">
              جنسیت و حجم دیتاست ۲۴kHz (ساعت)
            </label>
            <div className="flex gap-2">
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value as "male" | "female")}
                className="w-1/2 rounded-xl border border-slate-200 bg-slate-50/50 px-2.5 py-2.5 text-xs font-medium outline-none focus:border-teal-600 focus:bg-white"
              >
                <option value="female">دوبلور زن</option>
                <option value="male">دوبلور مرد</option>
              </select>
              <input
                type="number"
                step={0.5}
                min={0.5}
                max={30}
                dir="ltr"
                value={datasetHours}
                onChange={(e) => setDatasetHours(Number(e.target.value))}
                className="ltr-code w-1/2 rounded-xl border border-slate-200 bg-slate-50/50 px-2.5 py-2.5 text-xs outline-none focus:border-teal-600 focus:bg-white"
              />
            </div>
          </div>
        </div>

        {/* هایپرپارامترهای رسمی config_ft.yml در StyleTTS 2 */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-2.5">
            <label className="block text-[10.5px] font-medium text-slate-500">
              اپوک (Epochs)
            </label>
            <input
              type="number"
              min={5}
              max={100}
              dir="ltr"
              value={epochs}
              onChange={(e) => setEpochs(Number(e.target.value))}
              className="ltr-code mt-1 w-full bg-transparent text-sm font-bold text-slate-900 outline-none"
            />
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-2.5">
            <label className="block text-[10.5px] font-medium text-slate-500">
              Batch Size
            </label>
            <input
              type="number"
              min={2}
              max={32}
              dir="ltr"
              value={batchSize}
              onChange={(e) => setBatchSize(Number(e.target.value))}
              className="ltr-code mt-1 w-full bg-transparent text-sm font-bold text-slate-900 outline-none"
            />
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-2.5">
            <label className="block text-[10.5px] font-medium text-slate-500">
              Grad Accum
            </label>
            <input
              type="number"
              min={1}
              max={32}
              dir="ltr"
              value={gradAccumSteps}
              onChange={(e) => setGradAccumSteps(Number(e.target.value))}
              className="ltr-code mt-1 w-full bg-transparent text-sm font-bold text-slate-900 outline-none"
            />
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-2.5">
            <label className="block text-[10.5px] font-medium text-slate-500">
              نرخ یادگیری (ft_lr)
            </label>
            <select
              dir="ltr"
              value={learningRate}
              onChange={(e) => setLearningRate(e.target.value)}
              className="ltr-code mt-1 w-full bg-transparent text-sm font-bold text-slate-900 outline-none"
            >
              <option value="1e-4">1e-4</option>
              <option value="5e-5">5e-5</option>
              <option value="2e-4">2e-4</option>
            </select>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-2.5">
            <label className="block text-[10.5px] font-medium text-slate-500">
              طنین (alpha)
            </label>
            <input
              type="number"
              step={0.02}
              min={0}
              max={1}
              dir="ltr"
              value={alpha}
              onChange={(e) => setAlpha(Number(e.target.value))}
              className="ltr-code mt-1 w-full bg-transparent text-sm font-bold text-teal-800 outline-none"
            />
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-2.5">
            <label className="block text-[10.5px] font-medium text-slate-500">
              لحن (beta)
            </label>
            <input
              type="number"
              step={0.02}
              min={0}
              max={1}
              dir="ltr"
              value={beta}
              onChange={(e) => setBeta(Number(e.target.value))}
              className="ltr-code mt-1 w-full bg-transparent text-sm font-bold text-teal-800 outline-none"
            />
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-2.5">
            <label className="block text-[10.5px] font-medium text-slate-500">
              Diffusion / SLM
            </label>
            <div className="mt-1 flex items-center justify-between gap-1">
              <input
                type="number"
                min={4}
                max={20}
                dir="ltr"
                value={diffusionSteps}
                onChange={(e) => setDiffusionSteps(Number(e.target.value))}
                className="ltr-code w-10 bg-transparent text-sm font-bold text-slate-900 outline-none"
              />
              <button
                type="button"
                onClick={() => setSlmAdversarial((v) => !v)}
                className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                  slmAdversarial
                    ? "bg-teal-700 text-white"
                    : "bg-slate-200 text-slate-600"
                }`}
              >
                SLM
              </button>
            </div>
          </div>
        </div>

        {/* پیش‌نمایش زنده ساخت train_list.txt واجی IPA دوزبانه */}
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-700">
              <Database className="h-3.5 w-3.5 text-teal-700" />
              اسکریپت استودیویی دوزبانه (پیش‌نمایش تقطیع ۲۴kHz و واج‌نگاری IPA)
            </label>
            <textarea
              rows={4}
              value={studioScript}
              onChange={(e) => setStudioScript(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-xs leading-6 outline-none focus:border-teal-600 focus:bg-white"
            />
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="font-bold text-slate-800">
                پیش‌نمایش <code className="ltr-code">train_list.txt</code> (178 IPA)
              </span>
              <span className="text-[11px] font-semibold text-emerald-700">
                {toPersianDigits(ipaPreview.accepted.length)} قطعه ۲۴kHz | OOD آماده
              </span>
            </div>
            <div className="max-h-32 space-y-1.5 overflow-y-auto">
              {ipaPreview.accepted.map((row) => (
                <div
                  key={row.audioFile}
                  className="rounded-lg bg-white px-2.5 py-1.5 text-[11px] ring-1 ring-slate-200/80"
                >
                  <div className="flex items-center justify-between">
                    <span className="ltr-code font-semibold text-teal-700">
                      {row.audioFile}|0
                    </span>
                    <span className="text-slate-400">
                      {toPersianDigits(row.durationSec)} ثانیه
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-slate-700">{row.text}</p>
                  <p className="ltr-code mt-0.5 truncate text-[10px] text-indigo-700">
                    IPA: {toBilingualIPAPreview(row.text)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* دستور اجرای مستقیم روی سرور GPU */}
        <div className="mt-4 rounded-xl bg-[#0b1120] p-4 text-slate-200">
          <div className="mb-2 flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-300">
              <Terminal className="h-3.5 w-3.5 text-teal-400" />
              دستور رسمی اجرای فاین‌تیون StyleTTS 2 روی سرور GPU لینوکس مشتری
            </span>
            <button
              type="button"
              onClick={handleCopyCli}
              className="inline-flex items-center gap-1 rounded-lg bg-slate-800 px-2.5 py-1 text-[11px] font-medium text-slate-200 hover:bg-slate-700"
            >
              {copiedCli ? (
                <>
                  <Check className="h-3 w-3 text-emerald-400" />
                  کپی شد
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  کپی دستور
                </>
              )}
            </button>
          </div>
          <pre className="ltr-code overflow-x-auto text-[11.5px] leading-5 text-teal-300">
            {cliCommand}
          </pre>
        </div>

        {feedback && (
          <div
            className={`mt-4 flex items-center gap-2 rounded-xl border px-4 py-3 text-xs font-medium ${
              feedback.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-rose-200 bg-rose-50 text-rose-800"
            }`}
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{feedback.text}</span>
          </div>
        )}

        <div className="mt-5 flex justify-end">
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-teal-800 disabled:opacity-60"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                در حال آموزش مدل جدید StyleTTS 2...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 fill-current" />
                ساخت دیتاست IPA و آموزش مدل جدید StyleTTS 2
              </>
            )}
          </button>
        </div>
      </form>

      {/* رجیستری وزن‌های فاین‌تیون‌شده StyleTTS 2 */}
      <div className="space-y-4">
        <h3 className="text-base font-bold text-slate-900">
          رجیستری مدل‌های آموزش‌دیده با موتور StyleTTS 2 ({toPersianDigits(runs.length)})
        </h3>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {runs.map((run) => {
            const pts = run.lossHistory.length > 0 ? run.lossHistory : [];
            const maxLoss = Math.max(...pts.map((p) => p.melLoss), 0.8);
            const minLoss = Math.min(...pts.map((p) => p.melLoss), 0.14);
            const svgPath = pts
              .map((pt, i) => {
                const x =
                  pts.length === 1 ? 150 : (i / (pts.length - 1)) * 280 + 10;
                const y =
                  58 -
                  ((pt.melLoss - minLoss) / Math.max(0.1, maxLoss - minLoss)) *
                    46;
                return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
              })
              .join(" ");

            return (
              <div
                key={run.id}
                className={`rounded-2xl border bg-white p-5 shadow-xs ${
                  run.isActive
                    ? "border-teal-600 ring-1 ring-teal-600/40"
                    : "border-slate-200"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <Layers className="h-4 w-4 text-teal-700" />
                      <span className="ltr-code text-sm font-bold text-slate-900">
                        {run.runName}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-600">
                      {run.speakerDisplayName} • دیتاست{" "}
                      {toPersianDigits(run.datasetDurationMin)} دقیقه (24kHz IPA)
                    </p>
                  </div>

                  {run.isActive ? (
                    <span className="rounded-full bg-teal-700 px-3 py-1 text-[11px] font-bold text-white">
                      مدل مرکزی فعال
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={activatingId === run.id}
                      onClick={() => handleActivate(run.id)}
                      className="rounded-xl border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:border-teal-600 hover:text-teal-700"
                    >
                      {activatingId === run.id
                        ? "در حال بارگذاری..."
                        : "فعال‌سازی روی سرور"}
                    </button>
                  )}
                </div>

                <div className="mt-4 grid grid-cols-4 gap-2 rounded-xl bg-slate-50 p-2.5 text-center text-[11px]">
                  <div>
                    <div className="text-slate-400">train / val</div>
                    <div className="mt-0.5 font-bold text-slate-800">
                      {toPersianDigits(run.trainSegments)} /{" "}
                      {toPersianDigits(run.evalSegments)}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400">α / β / steps</div>
                    <div className="ltr-code mt-0.5 font-bold text-teal-800">
                      {run.alpha ?? 0.28}/{run.beta ?? 0.72}/{run.diffusionSteps ?? 8}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400">اپوک / LR</div>
                    <div className="ltr-code mt-0.5 font-bold text-slate-800">
                      {run.epochs} • {run.learningRate}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400">STFT Mel Loss</div>
                    <div className="ltr-code mt-0.5 font-bold text-emerald-700">
                      {run.initialMelLoss} → {run.finalMelLoss}
                    </div>
                  </div>
                </div>

                {pts.length > 1 && (
                  <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2">
                    <div className="mb-1 flex items-center justify-between text-[10px] text-slate-400">
                      <span>همگرایی Multi-Res STFT Mel + Style Diffusion + WavLM SLM</span>
                      <span className="ltr-code">
                        batch {run.batchSize} × accum {run.gradAccumSteps}
                      </span>
                    </div>
                    <svg
                      viewBox="0 0 300 66"
                      className="h-14 w-full overflow-visible"
                      direction="ltr"
                    >
                      <path
                        d={svgPath}
                        fill="none"
                        stroke="#0f766e"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      {pts.map((pt, idx) => {
                        const x = (idx / (pts.length - 1)) * 280 + 10;
                        const y =
                          58 -
                          ((pt.melLoss - minLoss) /
                            Math.max(0.1, maxLoss - minLoss)) *
                            46;
                        return (
                          <circle
                            key={pt.epoch}
                            cx={x}
                            cy={y}
                            r="3"
                            fill="#ffffff"
                            stroke="#0f766e"
                            strokeWidth="2"
                          />
                        );
                      })}
                    </svg>
                  </div>
                )}

                <div className="ltr-code mt-3 truncate rounded-lg bg-slate-100 px-2.5 py-1.5 text-[10.5px] text-slate-600">
                  {run.checkpointPath}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
