"use client";

import { useRef, useState } from "react";
import {
  CheckCircle2,
  Fingerprint,
  Loader2,
  Mic,
  Pause,
  Play,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import type { SpeakerItem } from "@/types/studio";
import { toPersianDigits } from "@/lib/persian-nlp";

interface SpeakersCloningTabProps {
  speakers: SpeakerItem[];
  onRefresh: () => Promise<void>;
}

export function SpeakersCloningTab({
  speakers,
  onRefresh,
}: SpeakersCloningTabProps) {
  const [displayName, setDisplayName] = useState("");
  const [speakerCode, setSpeakerCode] = useState("");
  const [roleTitle, setRoleTitle] = useState("گوینده اختصاصی تحریریه (کلون صفر شات)");
  const [gender, setGender] = useState<"male" | "female">("male");
  const [basePitchHz, setBasePitchHz] = useState(126);
  const [sampleScript, setSampleScript] = useState("");
  const [wavFile, setWavFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [playingId, setPlayingId] = useState<number | null>(null);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const toggleSamplePlay = (sp: SpeakerItem) => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.addEventListener("ended", () => setPlayingId(null));
      audioRef.current.addEventListener("pause", () => setPlayingId(null));
    }
    const el = audioRef.current;
    if (playingId === sp.id) {
      el.pause();
      setPlayingId(null);
      return;
    }
    el.src = sp.refAudioUrl;
    el.play()
      .then(() => setPlayingId(sp.id))
      .catch(() => setPlayingId(null));
  };

  const handleCloneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("displayName", displayName);
      formData.append("speakerCode", speakerCode);
      formData.append("roleTitle", roleTitle);
      formData.append("gender", gender);
      formData.append("basePitchHz", String(basePitchHz));
      if (sampleScript.trim()) {
        formData.append("sampleScript", sampleScript.trim());
      }
      if (wavFile) {
        formData.append("referenceWav", wavFile);
      }

      const res = await fetch("/api/speakers", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({
          type: "error",
          text: data.error || "خطا در ثبت گوینده جدید",
        });
      } else if (data.warning) {
        setMessage({ type: "error", text: `${data.message} ${data.warning}` });
        await onRefresh();
      } else {
        setMessage({
          type: "success",
          text: data.message,
        });
        setDisplayName("");
        setSpeakerCode("");
        setSampleScript("");
        setWavFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        await onRefresh();
      }
    } catch {
      setMessage({
        type: "error",
        text: "خطا در ارسال فایل مرجع به سرور.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    const res = await fetch(`/api/speakers?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      if (playingId === id && audioRef.current) {
        audioRef.current.pause();
      }
      await onRefresh();
    }
  };

  return (
    <div className="space-y-6">
      {/* کارت‌های گویندگان ثبت‌شده */}
      <div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              بانک گویندگان و پروفایل‌های صوتی سرور
            </h2>
            <p className="text-xs text-slate-500">
              بردار استایل ۲۵۶ بعدی{" "}
              <code className="ltr-code rounded bg-slate-200/70 px-1.5 py-0.5 text-[11px]">
                ref_s = [s_acoustic(128) ⊕ s_prosodic(128)]
              </code>{" "}
              هر گوینده توسط StyleTTS 2 با فرمت <code className="ltr-code">.pt</code> کش شده است.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800 ring-1 ring-teal-200">
            <ShieldCheck className="h-3.5 w-3.5" />
            مالکیت صوتی اختصاصی مشتری
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {speakers.map((sp) => {
            const isPlaying = playingId === sp.id;
            return (
              <div
                key={sp.id}
                className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-xs transition hover:border-teal-300"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-11 w-11 items-center justify-center rounded-xl font-bold text-white ${
                          sp.mode === "finetuned"
                            ? "bg-teal-700"
                            : "bg-slate-700"
                        }`}
                      >
                        <Mic className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">
                          {sp.displayName}
                        </h3>
                        <p className="ltr-code text-[11px] text-slate-400">
                          id: {sp.speakerCode}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <span
                        className={`rounded-lg px-2 py-0.5 text-[11px] font-semibold ${
                          sp.speakerCode === "dorsa_radmehr"
                            ? "bg-emerald-700 text-white"
                            : sp.mode === "finetuned"
                              ? "bg-teal-50 text-teal-800 ring-1 ring-teal-200"
                              : "bg-slate-100 text-slate-700 ring-1 ring-slate-200"
                        }`}
                      >
                        {sp.speakerCode === "dorsa_radmehr"
                          ? "مدل C جدید • StyleTTS 2"
                          : sp.mode === "finetuned"
                            ? "فاین‌تیون StyleTTS 2"
                            : "کلون ref_s (256D)"}
                      </span>
                      <span
                        className={`rounded-lg px-2 py-0.5 text-[10px] font-semibold ring-1 ${
                          sp.refEngine === "styletts2-human" ||
                          sp.refEngine === "edge-neural-human"
                            ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
                            : "bg-amber-50 text-amber-800 ring-amber-200"
                        }`}
                        title={
                          sp.refEnVoice
                            ? `${sp.refVoice} + ${sp.refEnVoice}`
                            : (sp.refVoice ?? "")
                        }
                      >
                        {sp.refEngine === "styletts2-human" ||
                        sp.refEngine === "edge-neural-human"
                          ? "صدای انسان (FA+EN)"
                          : "موتور محلی"}
                      </span>
                    </div>
                  </div>

                  <p className="mt-3 text-xs text-slate-600">{sp.roleTitle}</p>

                  <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-2.5 text-center text-[11px]">
                    <div>
                      <div className="text-slate-400">شباهت صوتی</div>
                      <div className="mt-0.5 font-bold text-emerald-700">
                        {toPersianDigits(sp.similarityScore)}٪
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-400">مدت مرجع</div>
                      <div className="mt-0.5 font-bold text-slate-800">
                        {toPersianDigits(sp.refDurationSec)} ثانیه
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-400">فرکانس پایه</div>
                      <div className="ltr-code mt-0.5 font-bold text-slate-800">
                        {Math.round(sp.basePitchHz)} Hz
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3.5">
                  <button
                    type="button"
                    onClick={() => toggleSamplePlay(sp)}
                    className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                      isPlaying
                        ? "bg-teal-700 text-white"
                        : "border border-slate-200 bg-white text-slate-700 hover:border-teal-600 hover:text-teal-700"
                    }`}
                  >
                    {isPlaying ? (
                      <>
                        <Pause className="h-3.5 w-3.5 fill-current" />
                        توقف نمونه مرجع
                      </>
                    ) : (
                      <>
                        <Play className="h-3.5 w-3.5 fill-current" />
                        پخش صدای مرجع
                      </>
                    )}
                  </button>

                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-400">
                      {toPersianDigits(sp.generatedCount)} مقاله
                    </span>
                    {speakers.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleDelete(sp.id)}
                        title="حذف گوینده"
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* فرم کلونینگ صفر شات گوینده جدید */}
      <form
        onSubmit={handleCloneSubmit}
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs"
      >
        <div className="flex items-start gap-3 border-b border-slate-100 pb-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-700 text-white">
            <Fingerprint className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">
              کلونینگ صفر شات گوینده با بردار استایل ۲۵۶ بعدی StyleTTS 2 (Zero-Shot ref_s)
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              یک فایل صوتی مرجع تمیز WAV (۵ تا ۳۰ ثانیه، نرخ ۲۴۰۰۰ هرتز) آپلود کنید تا انکودرهای آکوستیک و پروزودی StyleTTS 2 بردار استایل ref_s گوینده را استخراج و برای خوانش دوزبانه (FA + EN) آماده سازند.
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-700">
              نام نمایشی گوینده
            </label>
            <input
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="مثلاً: نیما بهرامی"
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm outline-none focus:border-teal-600 focus:bg-white"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-700">
              شناسه لاتین (speaker_id)
            </label>
            <input
              type="text"
              required
              dir="ltr"
              value={speakerCode}
              onChange={(e) => setSpeakerCode(e.target.value)}
              placeholder="nima_bahrami"
              className="ltr-code w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-xs outline-none focus:border-teal-600 focus:bg-white"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-700">
              عنوان و سبک خوانش
            </label>
            <input
              type="text"
              value={roleTitle}
              onChange={(e) => setRoleTitle(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-xs outline-none focus:border-teal-600 focus:bg-white"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-700">
              بافت صدا و فرکانس پایه
            </label>
            <div className="flex gap-2">
              <select
                value={gender}
                onChange={(e) => {
                  const g = e.target.value as "male" | "female";
                  setGender(g);
                  setBasePitchHz(g === "female" ? 198 : 118);
                }}
                className="w-1/2 rounded-xl border border-slate-200 bg-slate-50/50 px-2.5 py-2.5 text-xs font-medium outline-none focus:border-teal-600 focus:bg-white"
              >
                <option value="male">مرد (باریتون/تنور)</option>
                <option value="female">زن (سوپرانو/آلتو)</option>
              </select>
              <input
                type="number"
                min={90}
                max={245}
                dir="ltr"
                value={basePitchHz}
                onChange={(e) => setBasePitchHz(Number(e.target.value))}
                className="ltr-code w-1/2 rounded-xl border border-slate-200 bg-slate-50/50 px-2.5 py-2.5 text-xs outline-none focus:border-teal-600 focus:bg-white"
                title="فرکانس پایه هرتز"
              />
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-4">
            <label className="flex cursor-pointer items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-teal-700 shadow-xs ring-1 ring-slate-200">
                <Upload className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-slate-800">
                  {wavFile
                    ? wavFile.name
                    : "آپلود فایل صوتی مرجع WAV (اختیاری برای تست سریع)"}
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500">
                  استاندارد پیشنهادی: Mono، نرخ ۲۲۰۵۰ یا ۲۴۰۰۰ هرتز، طول ۱۰ تا ۳۰ ثانیه
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".wav,audio/wav"
                onChange={(e) => setWavFile(e.target.files?.[0] ?? null)}
                className="hidden"
              />
            </label>
          </div>

          <div>
            <input
              type="text"
              value={sampleScript}
              onChange={(e) => setSampleScript(e.target.value)}
              placeholder="متن کالیبراسیون مرجع (در صورت عدم آپلود WAV، نمونه استودیویی با این متن ساخته می‌شود)"
              className="h-full w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-3 text-xs outline-none focus:border-teal-600 focus:bg-white"
            />
          </div>
        </div>

        {message && (
          <div
            className={`mt-4 flex items-center gap-2 rounded-xl border px-4 py-3 text-xs font-medium ${
              message.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-rose-200 bg-rose-50 text-rose-800"
            }`}
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{message.text}</span>
          </div>
        )}

        <div className="mt-5 flex justify-end">
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                در حال استخراج بردار صوتی...
              </>
            ) : (
              <>
                <Fingerprint className="h-4 w-4" />
                ثبت گوینده و استخراج بردار کلونینگ
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
