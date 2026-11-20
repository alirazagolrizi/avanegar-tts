"use client";

import { useEffect, useRef, useState } from "react";
import {
  Building2,
  Check,
  Code2,
  Copy,
  Download,
  Globe,
  KeyRound,
  Loader2,
  Moon,
  Plus,
  Server,
  Sun,
  Trash2,
} from "lucide-react";
import type { ArticleItem, PublisherClientItem } from "@/types/studio";
import { toPersianDigits } from "@/lib/persian-nlp";

declare global {
  interface Window {
    AvaNegarPlayer?: {
      mount: (
        host: HTMLElement,
        opts?: {
          articleSlug?: string;
          apiBase?: string;
          endpointPath?: string;
          accent?: string;
          theme?: "light" | "dark";
        }
      ) => { destroy: () => void } | null;
      version: string;
    };
  }
}

const ACCENT_PRESETS = [
  { label: "زومیت", color: "#e11d48" },
  { label: "آوانگار", color: "#0f766e" },
  { label: "دیجیاتو", color: "#2563eb" },
  { label: "کلاسیک", color: "#0f172a" },
];

interface WidgetIntegrationTabProps {
  articles: ArticleItem[];
  clients: PublisherClientItem[];
  initialSlug?: string | null;
  onRefresh: () => Promise<void>;
}

export function WidgetIntegrationTab({
  articles,
  clients,
  initialSlug,
  onRefresh,
}: WidgetIntegrationTabProps) {
  const [selectedSlug, setSelectedSlug] = useState<string>(
    initialSlug || articles[0]?.slug || ""
  );
  const [accent, setAccent] = useState("#e11d48");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [copiedEmbed, setCopiedEmbed] = useState(false);
  const [scriptReady, setScriptReady] = useState(false);

  // فرم صدور لایسنس مشتری B2B
  const [clientName, setClientName] = useState("");
  const [clientDomain, setClientDomain] = useState("");
  const [gpuSpec, setGpuSpec] = useState("NVIDIA L4 24GB (CUDA 12.1)");
  const [creatingClient, setCreatingClient] = useState(false);
  const [issuedKey, setIssuedKey] = useState<string | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);

  const widgetHostRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<{ destroy: () => void } | null>(null);

  useEffect(() => {
    if (initialSlug) {
      setSelectedSlug(initialSlug);
    } else if (!selectedSlug && articles[0]) {
      setSelectedSlug(articles[0].slug);
    }
  }, [initialSlug, articles, selectedSlug]);

  // بارگذاری اسکریپت واقعی ویجت از public/widget/avanegar-player.js
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.AvaNegarPlayer) {
      setScriptReady(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "/widget/avanegar-player.js";
    script.async = true;
    script.onload = () => setScriptReady(true);
    document.body.appendChild(script);
  }, []);

  // نصب و به‌روزرسانی زنده ویجت Shadow DOM با هر تغییر تنظیمات
  useEffect(() => {
    if (!scriptReady || !widgetHostRef.current || !selectedSlug) return;
    if (instanceRef.current) {
      instanceRef.current.destroy();
      instanceRef.current = null;
    }
    if (window.AvaNegarPlayer) {
      instanceRef.current = window.AvaNegarPlayer.mount(widgetHostRef.current, {
        articleSlug: selectedSlug,
        apiBase: window.location.origin,
        endpointPath: "/api/widget/articles",
        accent,
        theme,
      });
    }
    return () => {
      if (instanceRef.current) {
        instanceRef.current.destroy();
        instanceRef.current = null;
      }
    };
  }, [scriptReady, selectedSlug, accent, theme, articles]);

  const activeArticle =
    articles.find((a) => a.slug === selectedSlug) ?? articles[0] ?? null;

  const embedCode = `<!-- ویجت سبک پخش‌کننده صوتی آوانگار (بدون وابستگی خارجی • ایزوله با Shadow DOM) -->
<div
  data-avanegar-article="${selectedSlug || "zoomit-article-slug"}"
  data-accent="${accent}"
  data-theme="${theme}"
  data-endpoint-path="/api/v1/widget/articles"
></div>
<script
  src="https://tts.zoomit.ir/widget/avanegar-player.js"
  data-api-base="https://tts.zoomit.ir"
  async
></script>`;

  const handleCopyEmbed = async () => {
    await navigator.clipboard.writeText(embedCode);
    setCopiedEmbed(true);
    setTimeout(() => setCopiedEmbed(false), 1800);
  };

  const handleAddClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setClientError(null);
    setIssuedKey(null);
    setCreatingClient(true);
    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: clientName,
          domain: clientDomain,
          gpuSpec,
          accentColor: accent,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setClientError(data.error || "خطا در صدور لایسنس");
      } else {
        setIssuedKey(data.plainApiKey);
        setClientName("");
        setClientDomain("");
        await onRefresh();
      }
    } finally {
      setCreatingClient(false);
    }
  };

  const handleDeleteClient = async (id: number) => {
    const res = await fetch(`/api/clients?id=${id}`, { method: "DELETE" });
    if (res.ok) await onRefresh();
  };

  return (
    <div className="space-y-6">
      {/* کنترل‌های سفارشی‌سازی و پیش‌نمایش زنده در سایت مشتری */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              پیش‌نمایش زنده ویجت جاوااسکریپت در صفحه مقاله مشتری
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              پخش‌کننده زیر مستقیماً توسط فایل مستقل{" "}
              <code className="ltr-code rounded bg-slate-100 px-1.5 py-0.5 text-[11px]">
                avanegar-player.js
              </code>{" "}
              با Shadow DOM رندر شده و فایل‌های صوتی را از اندپوینت سرور فراخوانی می‌کند.
            </p>
          </div>
          <a
            href="/widget/avanegar-player.js"
            download="avanegar-player.js"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-800 transition hover:border-teal-600 hover:text-teal-700"
          >
            <Download className="h-3.5 w-3.5" />
            دانلود فایل ویجت (JS)
          </a>
        </div>

        {/* تنظیمات ویجت */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-[240px] flex-1">
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              انتخاب مقاله صوتی‌شده:
            </label>
            <select
              value={selectedSlug}
              onChange={(e) => setSelectedSlug(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-teal-600 focus:bg-white"
            >
              {articles.map((art) => (
                <option key={art.id} value={art.slug}>
                  [{art.publisherName}] {art.title} (
                  {toPersianDigits(art.tracks.length)} گوینده)
                </option>
              ))}
            </select>
          </div>

          <div>
            <span className="mb-1 block text-xs font-semibold text-slate-600">
              رنگ سازمانی سایت مشتری:
            </span>
            <div className="flex items-center gap-2">
              {ACCENT_PRESETS.map((p) => (
                <button
                  key={p.color}
                  type="button"
                  onClick={() => setAccent(p.color)}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                    accent === p.color
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-700"
                  }`}
                >
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: p.color }}
                  />
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="mb-1 block text-xs font-semibold text-slate-600">
              پوسته نمایش:
            </span>
            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
              <button
                type="button"
                onClick={() => setTheme("light")}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold ${
                  theme === "light"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-500"
                }`}
              >
                <Sun className="h-3.5 w-3.5" />
                روشن
              </button>
              <button
                type="button"
                onClick={() => setTheme("dark")}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold ${
                  theme === "dark"
                    ? "bg-slate-900 text-white shadow-xs"
                    : "text-slate-500"
                }`}
              >
                <Moon className="h-3.5 w-3.5" />
                تیره
              </button>
            </div>
          </div>
        </div>

        {/* قاب شبیه‌سازی‌شده مقاله زومیت */}
        {activeArticle && (
          <div
            className={`mt-5 rounded-2xl border p-6 transition ${
              theme === "dark"
                ? "border-slate-800 bg-slate-950 text-slate-100"
                : "border-slate-200 bg-[#fcfcfd] text-slate-900"
            }`}
          >
            <div className="mb-4 flex items-center justify-between border-b border-slate-200/20 pb-3">
              <div className="flex items-center gap-2.5">
                <span
                  className="rounded-lg px-2.5 py-1 text-xs font-extrabold text-white"
                  style={{ backgroundColor: accent }}
                >
                  {activeArticle.publisherName}
                </span>
                <span
                  className={`text-xs ${
                    theme === "dark" ? "text-slate-400" : "text-slate-500"
                  }`}
                >
                  {activeArticle.category} • مطالعه و شنیدن مقاله
                </span>
              </div>
              <span className="ltr-code text-[11px] text-slate-400">
                Shadow DOM Widget v2.4
              </span>
            </div>

            <h3 className="text-lg font-extrabold leading-8">
              {activeArticle.title}
            </h3>

            {/* محل دقیق نصب ویجت جاوااسکریپت مشتری */}
            <div className="my-5" ref={widgetHostRef} />

            <p
              className={`text-sm leading-8 ${
                theme === "dark" ? "text-slate-300" : "text-slate-700"
              }`}
            >
              {activeArticle.rawText}
            </p>
          </div>
        )}
      </div>

      {/* کد جاگذاری و معماری ارتباط ویجت با سرور */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="rounded-2xl border border-slate-200 bg-[#0b1120] p-5 text-slate-200 lg:col-span-7">
          <div className="mb-3 flex items-center justify-between">
            <span className="inline-flex items-center gap-2 text-xs font-bold text-white">
              <Code2 className="h-4 w-4 text-teal-400" />
              کد یکپارچه‌سازی ویجت در قالب سایت مشتری
            </span>
            <button
              type="button"
              onClick={handleCopyEmbed}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:bg-slate-700"
            >
              {copiedEmbed ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                  کپی شد
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  کپی اسنیپت HTML
                </>
              )}
            </button>
          </div>
          <pre className="ltr-code overflow-x-auto rounded-xl bg-slate-900/90 p-4 text-xs leading-6 text-teal-300">
            {embedCode}
          </pre>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 lg:col-span-5">
          <h3 className="text-sm font-bold text-slate-900">
            چرخه‌کار فنی ارتباط ویجت و سرور لوکال
          </h3>
          <ol className="mt-3 space-y-2.5 text-xs leading-6 text-slate-600">
            <li className="flex gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-50 text-[11px] font-bold text-teal-800">
                ۱
              </span>
              <span>
                ویجت با خواندن صفت{" "}
                <code className="ltr-code text-[11px] text-slate-800">
                  data-avanegar-article
                </code>{" "}
                درخواست سبک GET به سرور داخلی مشتری ارسال می‌کند.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-50 text-[11px] font-bold text-teal-800">
                ۲
              </span>
              <span>
                سرور فهرست صداهای از پیش تولیدشده (دوبلور رسمی و کلون‌ها) به همراه آرایه ۶۴تایی موج صوتی را برمی‌گرداند.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-50 text-[11px] font-bold text-teal-800">
                ۳
              </span>
              <span>
                کاربر گوینده دلخواه و سرعت پخش (۰.۷۵× تا ۲× با حفظ زیر و بمی صدا{" "}
                <code className="ltr-code text-[11px] text-slate-800">
                  preservesPitch
                </code>
                ) را انتخاب کرده و فایل صوتی با{" "}
                <code className="ltr-code text-[11px] text-slate-800">
                  HTTP 206 Range
                </code>{" "}
                بدون مکث پخش می‌شود.
              </span>
            </li>
          </ol>
        </div>
      </div>

      {/* مدیریت مشتریان سازمانی B2B (تحویل مدل لوکال) */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex items-center gap-2.5 border-b border-slate-100 pb-4">
          <Building2 className="h-5 w-5 text-teal-700" />
          <div>
            <h3 className="text-base font-bold text-slate-900">
              مشتریان سازمانی B2B و لایسنس استقرار On-Premise ({toPersianDigits(clients.length)})
            </h3>
            <p className="text-xs text-slate-500">
              مدیریت دامنه‌های مجاز دانلود وزن‌های آفلاین موتور مرکزی StyleTTS 2 دوزبانه (FA + EN) و کلید امنیتی پنل هر مشتری
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          {clients.map((cl) => (
            <div
              key={cl.id}
              className="flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50/60 p-4"
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: cl.accentColor }}
                    />
                    <span className="text-sm font-bold text-slate-900">
                      {cl.name}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteClient(cl.id)}
                    className="text-slate-400 hover:text-rose-600"
                    title="حذف لایسنس"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="mt-2 space-y-1 text-[11px] text-slate-600">
                  <div className="flex items-center gap-1.5">
                    <Globe className="h-3.5 w-3.5 text-slate-400" />
                    <span className="ltr-code">{cl.domain}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Server className="h-3.5 w-3.5 text-slate-400" />
                    <span className="ltr-code">{cl.gpuSpec}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <KeyRound className="h-3.5 w-3.5 text-slate-400" />
                    <span className="ltr-code text-teal-800">
                      {cl.apiKeyPrefix}••••••••
                    </span>
                  </div>
                </div>
              </div>
              <div className="mt-3 border-t border-slate-200/70 pt-2 flex items-center justify-between text-[10.5px]">
                <span className="ltr-code text-slate-500">{cl.bundleVersion}</span>
                <span className="font-bold text-emerald-700">مستقر در سرور داخلی</span>
              </div>
            </div>
          ))}
        </div>

        <form
          onSubmit={handleAddClient}
          className="mt-5 grid grid-cols-1 gap-3 border-t border-slate-100 pt-4 sm:grid-cols-4"
        >
          <input
            type="text"
            required
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            placeholder="نام رسانه جدید (مثلاً: ترنجی)"
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none focus:border-teal-600 focus:bg-white"
          />
          <input
            type="text"
            required
            dir="ltr"
            value={clientDomain}
            onChange={(e) => setClientDomain(e.target.value)}
            placeholder="toranji.ir"
            className="ltr-code rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none focus:border-teal-600 focus:bg-white"
          />
          <input
            type="text"
            dir="ltr"
            value={gpuSpec}
            onChange={(e) => setGpuSpec(e.target.value)}
            className="ltr-code rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none focus:border-teal-600 focus:bg-white"
          />
          <button
            type="submit"
            disabled={creatingClient}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            {creatingClient ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            صدور لایسنس و کلید API
          </button>
        </form>

        {issuedKey && (
          <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
            <span className="font-bold">کلید یک‌بار نمایش X-API-Key صادر شد: </span>
            <code className="ltr-code mr-2 rounded bg-white px-2 py-1 text-[11px] font-bold text-slate-900 ring-1 ring-emerald-300">
              {issuedKey}
            </code>
          </div>
        )}
        {clientError && (
          <p className="mt-2 text-xs font-medium text-rose-600">{clientError}</p>
        )}
      </div>
    </div>
  );
}
