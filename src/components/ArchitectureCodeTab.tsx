"use client";

import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Check,
  Copy,
  Download,
  FileCode2,
  FolderTree,
  Loader2,
  PackageCheck,
  Shield,
} from "lucide-react";
import type { SdkFileItem } from "@/types/studio";
import { toPersianDigits } from "@/lib/persian-nlp";

const ARCH_STEPS = [
  {
    step: "۰۱",
    title: "پنل ادمین CMS سایت",
    sub: "ارسال متن مقاله + speaker_id",
    detail: "POST /api/v1/admin/synthesize",
  },
  {
    step: "۰۲",
    title: "صف پردازش ناهمگام",
    sub: "FastAPI + Celery + Redis",
    detail: "مدیریت بار ترافیکی و VRAM",
  },
  {
    step: "۰۳",
    title: "واج‌نگار IPA و StyleTTS 2",
    sub: "PL-BERT + Diffusion + iSTFTNet",
    detail: "FA+EN IPA • ref_s 256D • RTF 0.08x",
  },
  {
    step: "۰۴",
    title: "ذخیره‌سازی محلی سرور",
    sub: "WAV + manifest.json + Nginx",
    detail: "پشتیبانی از HTTP 206 Range",
  },
  {
    step: "۰۵",
    title: "ویجت سبک کاربر نهایی",
    sub: "Shadow DOM JS Player",
    detail: "انتخاب گوینده و سرعت ۰.۷۵x تا ۲x",
  },
];

export function ArchitectureCodeTab() {
  const [files, setFiles] = useState<SdkFileItem[]>([]);
  const [projectTree, setProjectTree] = useState("");
  const [selectedId, setSelectedId] = useState("styletts2_engine");
  const [activeCategory, setActiveCategory] = useState("همه");
  const [showTree, setShowTree] = useState(false);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/sdk/files")
      .then((res) => res.json())
      .then((data) => {
        setFiles(data.files ?? []);
        setProjectTree(data.projectTree ?? "");
      })
      .finally(() => setLoading(false));
  }, []);

  const categories = [
    "همه",
    ...Array.from(new Set(files.map((f) => f.category))),
  ];

  const filteredFiles =
    activeCategory === "همه"
      ? files
      : files.filter((f) => f.category === activeCategory);

  const activeFile =
    files.find((f) => f.id === selectedId) ?? filteredFiles[0] ?? null;

  const handleCopyCode = async () => {
    if (!activeFile) return;
    await navigator.clipboard.writeText(activeFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleDownloadSingle = () => {
    if (!activeFile) return;
    const blob = new Blob([activeFile.content], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = activeFile.relativePath.split("/").pop() || "file.py";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* دیاگرام معماری استقرار آفلاین */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-bold text-emerald-800 ring-1 ring-emerald-200">
              <Shield className="h-3.5 w-3.5" />
              معماری Air-Gapped On-Premise بدون وابستگی به اینترنت و API خارجی
            </div>
            <h2 className="mt-2.5 text-lg font-bold text-slate-900">
              معماری کامل مهندسی پروژه پایتون StyleTTS 2 دوزبانه (Diffusion + PL-BERT + WavLM SLM)
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowTree((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-bold text-slate-700 transition hover:border-teal-600 hover:text-teal-700"
            >
              <FolderTree className="h-4 w-4" />
              {showTree ? "بستن درخت پوشه‌ها" : "ساختار پوشه‌بندی پروژه"}
            </button>
            <a
              href="/api/sdk/download"
              className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-teal-800"
            >
              <PackageCheck className="h-4 w-4" />
              دانلود کل پروژه پایتون + ویجت (ZIP)
            </a>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-5">
          {ARCH_STEPS.map((item, idx) => (
            <div
              key={item.step}
              className="relative rounded-xl border border-slate-200 bg-slate-50/70 p-3.5"
            >
              <div className="flex items-center justify-between">
                <span className="rounded-md bg-teal-700 px-2 py-0.5 text-[11px] font-bold text-white">
                  {item.step}
                </span>
                {idx < ARCH_STEPS.length - 1 && (
                  <ArrowLeft className="hidden h-3.5 w-3.5 text-slate-400 md:block" />
                )}
              </div>
              <h3 className="mt-2 text-xs font-bold text-slate-900">
                {item.title}
              </h3>
              <p className="mt-0.5 text-[11px] text-slate-600">{item.sub}</p>
              <p className="ltr-code mt-2 truncate rounded bg-white px-2 py-1 text-[10px] text-teal-800 ring-1 ring-slate-200/80">
                {item.detail}
              </p>
            </div>
          ))}
        </div>

        {showTree && projectTree && (
          <div className="mt-4 rounded-xl bg-[#0b1120] p-4 text-slate-200">
            <div className="mb-2 text-xs font-bold text-teal-400">
              درخت کامل پوشه‌بندی بسته قابل تحویل به مشتری:
            </div>
            <pre className="ltr-code overflow-x-auto text-xs leading-6 text-slate-200">
              {projectTree}
            </pre>
          </div>
        )}
      </div>

      {/* مرورگر کدهای اجرایی پایتون و ویجت */}
      {loading ? (
        <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white p-14 text-sm text-slate-500">
          <Loader2 className="ml-2 h-5 w-5 animate-spin text-teal-700" />
          در حال بارگذاری ماژول‌های پایتون...
        </div>
      ) : (
        <div className="space-y-4">
          {/* فیلتر دسته‌بندی فایل‌ها */}
          <div className="flex flex-wrap items-center gap-2">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => {
                  setActiveCategory(cat);
                  const first =
                    cat === "همه"
                      ? files[0]
                      : files.find((f) => f.category === cat);
                  if (first) setSelectedId(first.id);
                }}
                className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
                  activeCategory === cat
                    ? "bg-slate-900 text-white"
                    : "border border-slate-200 bg-white text-slate-600 hover:border-teal-600"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            {/* ستون لیست فایل‌ها */}
            <div className="space-y-2 lg:col-span-4">
              {filteredFiles.map((file) => {
                const selected = activeFile?.id === file.id;
                const shortPath = file.relativePath.replace(
                  /^python-engine\//,
                  ""
                );
                return (
                  <button
                    key={file.id}
                    type="button"
                    onClick={() => setSelectedId(file.id)}
                    className={`w-full rounded-xl border p-3.5 text-right transition ${
                      selected
                        ? "border-teal-600 bg-teal-50/70 ring-1 ring-teal-600"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-900">
                        <FileCode2 className="h-3.5 w-3.5 shrink-0 text-teal-700" />
                        {file.title}
                      </span>
                      <span className="shrink-0 text-[10px] text-slate-400">
                        {toPersianDigits(file.lines)} خط
                      </span>
                    </div>
                    <div className="ltr-code mt-1 truncate text-[11px] font-medium text-teal-800">
                      {shortPath}
                    </div>
                    <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-slate-500">
                      {file.description}
                    </p>
                  </button>
                );
              })}
            </div>

            {/* پنجره نمایش کد */}
            {activeFile && (
              <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-800 bg-[#0b1120] text-slate-100 shadow-sm lg:col-span-8">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-slate-900/80 px-4 py-3">
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white">
                      {activeFile.title}
                    </div>
                    <div className="ltr-code truncate text-[11px] text-teal-400">
                      {activeFile.relativePath}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCopyCode}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:bg-slate-700"
                    >
                      {copied ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-400" />
                          کپی شد
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          کپی کد
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadSingle}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-teal-600"
                    >
                      <Download className="h-3.5 w-3.5" />
                      دانلود فایل
                    </button>
                  </div>
                </div>

                <div className="border-b border-slate-800/80 bg-slate-900/40 px-4 py-2 text-[11.5px] text-slate-300">
                  {activeFile.description}
                </div>

                <div className="max-h-[640px] overflow-auto p-4">
                  <pre className="ltr-code text-[12px] leading-6 text-slate-200">
                    {activeFile.content.split("\n").map((line, i) => (
                      <div key={i} className="flex hover:bg-slate-800/40">
                        <span className="w-10 shrink-0 select-none pr-3 text-right text-slate-600">
                          {i + 1}
                        </span>
                        <span className="whitespace-pre">{line}</span>
                      </div>
                    ))}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
