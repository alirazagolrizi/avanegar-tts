"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AudioLines,
  Code2,
  Download,
  Layers,
  Bug,
  Loader2,
  Menu,
  Mic2,
  PlaySquare,
  WifiOff,
  X,
} from "lucide-react";
import type { StudioState } from "@/types/studio";
import { SynthesisStudioTab } from "@/components/SynthesisStudioTab";
import { SpeakersCloningTab } from "@/components/SpeakersCloningTab";
import { FineTuneTab } from "@/components/FineTuneTab";
import { WidgetIntegrationTab } from "@/components/WidgetIntegrationTab";
import { ArchitectureCodeTab } from "@/components/ArchitectureCodeTab";
import { DebugModelTab } from "@/components/DebugModelTab";
import { toPersianDigits } from "@/lib/persian-nlp";

type TabId =
  | "synthesis"
  | "speakers"
  | "finetune"
  | "widget"
  | "debug"
  | "codebase";

const NAV_ITEMS: Array<{
  id: TabId;
  label: string;
  subtitle: string;
  icon: typeof AudioLines;
}> = [
  {
    id: "synthesis",
    label: "استودیو تولید صدا",
    subtitle: "تأیید مقاله و صف پردازش",
    icon: AudioLines,
  },
  {
    id: "speakers",
    label: "گویندگان و کلونینگ",
    subtitle: "صفر شات و صدای دوبلور",
    icon: Mic2,
  },
  {
    id: "finetune",
    label: "فاین‌تیون StyleTTS 2",
    subtitle: "Diffusion + WavLM SLM + IPA",
    icon: Layers,
  },
  {
    id: "widget",
    label: "ویجت پخش‌کننده",
    subtitle: "دموی زومیت و مشتریان B2B",
    icon: PlaySquare,
  },
  {
    id: "debug",
    label: "دیباگ مدل C و تلفظ",
    subtitle: "StyleTTS 2 • EN بومی و اعداد",
    icon: Bug,
  },
  {
    id: "codebase",
    label: "معماری و کد پایتون",
    subtitle: "سورس کامل StyleTTS 2 و API",
    icon: Code2,
  },
];

export function StudioShell() {
  const [activeTab, setActiveTab] = useState<TabId>("synthesis");
  const [studio, setStudio] = useState<StudioState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [widgetTargetSlug, setWidgetTargetSlug] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const fetchStudio = useCallback(async () => {
    try {
      const res = await fetch("/api/studio", { cache: "no-store" });
      if (!res.ok) throw new Error("خطا در واکشی اطلاعات سرور");
      const data: StudioState = await res.json();
      setStudio(data);
      setError(null);
    } catch {
      setError("ارتباط با پایگاه داده سرور برقرار نشد.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStudio();
  }, [fetchStudio]);

  const handleOpenInWidget = (slug: string) => {
    setWidgetTargetSlug(slug);
    setActiveTab("widget");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const currentNav =
    NAV_ITEMS.find((n) => n.id === activeTab) ?? NAV_ITEMS[0];

  const getTabCount = (id: TabId): string | null => {
    if (!studio) return null;
    if (id === "synthesis") return toPersianDigits(studio.stats.totalArticles);
    if (id === "speakers") return toPersianDigits(studio.stats.totalSpeakers);
    if (id === "finetune") return toPersianDigits(studio.stats.finetunedModels);
    if (id === "widget") return toPersianDigits(studio.publisherClients.length);
    if (id === "debug") return "C";
    if (id === "codebase") return toPersianDigits(18);
    return null;
  };

  return (
    <div className="flex min-h-screen bg-[#f8f9fb] text-slate-900">
      {/* سایدبار راست‌به‌چپ دسکتاپ */}
      <aside className="sticky top-0 hidden h-screen w-68 shrink-0 flex-col justify-between border-l border-slate-200 bg-white p-5 lg:flex">
        <div>
          {/* لوگو و هویت برند */}
          <div className="flex items-center gap-3 px-1 pb-6 border-b border-slate-100">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-700 text-white shadow-sm">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
              >
                <path d="M4 10v4" />
                <path d="M8 6v12" />
                <path d="M12 3v18" />
                <path d="M16 7v10" />
                <path d="M20 10v4" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-base font-extrabold tracking-tight text-slate-900">
                  آوانگار
                </span>
                <span className="ltr-code rounded bg-teal-50 px-1.5 py-0.5 text-[10px] font-bold text-teal-800 ring-1 ring-teal-200">
                  StyleTTS 2
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                زیرساخت لوکال تبدیل متن به گفتار
              </p>
            </div>
          </div>

          {/* آیتم‌های ناوبری */}
          <nav className="mt-5 space-y-1.5" aria-label="بخش‌های سیستم">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              const badge = getTabCount(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-right transition ${
                    active
                      ? "bg-teal-700 text-white shadow-xs"
                      : "text-slate-700 hover:bg-slate-100/80"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon
                      className={`h-4 w-4 shrink-0 ${
                        active ? "text-white" : "text-slate-500"
                      }`}
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-bold truncate">
                        {item.label}
                      </div>
                      <div
                        className={`text-[10.5px] truncate ${
                          active ? "text-teal-100" : "text-slate-400"
                        }`}
                      >
                        {item.subtitle}
                      </div>
                    </div>
                  </div>
                  {badge && (
                    <span
                      className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10.5px] font-bold ${
                        active
                          ? "bg-white/20 text-white"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* کارت وضعیت استقرار آفلاین */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
          <div className="flex items-center gap-2 text-xs font-bold text-emerald-800">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            اجرای ۱۰۰٪ لوکال (On-Premise)
          </div>
          <p className="mt-1 text-[11px] leading-5 text-slate-500">
            موتور مرکزی StyleTTS 2 (PL-BERT + Style Diffusion + WavLM SLM) کاملاً آفلاین روی سرور مشتری اجرا می‌شود.
          </p>
          {studio && (
            <div className="mt-2 rounded-lg bg-white px-2 py-1.5 ring-1 ring-slate-200">
              <div className="text-[9.5px] font-bold text-teal-800">
                مدل C جدید • StyleTTS 2
              </div>
              <div className="ltr-code truncate text-[10px] font-medium text-slate-700">
                {studio.stats.activeCheckpoint}
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* منوی موبایل */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative z-10 flex w-72 flex-col justify-between bg-white p-5 shadow-xl">
            <div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <span className="text-base font-extrabold text-slate-900">
                  آوانگار StyleTTS 2
                </span>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <nav className="mt-4 space-y-1.5">
                {NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const active = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setActiveTab(item.id);
                        setMobileMenuOpen(false);
                      }}
                      className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-right ${
                        active
                          ? "bg-teal-700 text-white"
                          : "text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <div>
                        <div className="text-xs font-bold">{item.label}</div>
                        <div
                          className={`text-[10.5px] ${
                            active ? "text-teal-100" : "text-slate-400"
                          }`}
                        >
                          {item.subtitle}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </nav>
            </div>
          </div>
        </div>
      )}

      {/* ناحیه اصلی محتوا */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur-md sm:px-7">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="باز کردن منو"
              className="rounded-xl border border-slate-200 p-2 text-slate-700 lg:hidden"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-extrabold text-slate-900 sm:text-base">
                {currentNav.label}
              </h1>
              <p className="hidden text-[11px] text-slate-500 sm:block">
                {currentNav.subtitle}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2.5">
            <span className="hidden items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-800 ring-1 ring-emerald-200 md:inline-flex">
              <WifiOff className="h-3.5 w-3.5" />
              بدون API خارجی
            </span>

            <a
              href="/api/sdk/download"
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-slate-800"
            >
              <Download className="h-3.5 w-3.5" />
              <span>دانلود پکیج سرور پایتون</span>
            </a>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-7">
          {loading ? (
            <div className="flex min-h-[55vh] flex-col items-center justify-center gap-3 text-slate-500">
              <Loader2 className="h-7 w-7 animate-spin text-teal-700" />
              <span className="text-sm font-medium">
                در حال آماده‌سازی استودیو صوتی آوانگار...
              </span>
            </div>
          ) : error || !studio ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center text-sm text-rose-800">
              <p className="font-bold">{error}</p>
              <button
                type="button"
                onClick={fetchStudio}
                className="mt-3 rounded-xl bg-rose-700 px-4 py-2 text-xs font-bold text-white"
              >
                تلاش مجدد
              </button>
            </div>
          ) : (
            <>
              {activeTab === "synthesis" && (
                <SynthesisStudioTab
                  stats={studio.stats}
                  speakers={studio.speakers}
                  articles={studio.articles}
                  onRefresh={fetchStudio}
                  onOpenInWidget={handleOpenInWidget}
                />
              )}
              {activeTab === "speakers" && (
                <SpeakersCloningTab
                  speakers={studio.speakers}
                  onRefresh={fetchStudio}
                />
              )}
              {activeTab === "finetune" && (
                <FineTuneTab
                  runs={studio.finetuneRuns}
                  onRefresh={fetchStudio}
                />
              )}
              {activeTab === "widget" && (
                <WidgetIntegrationTab
                  articles={studio.articles}
                  clients={studio.publisherClients}
                  initialSlug={widgetTargetSlug}
                  onRefresh={fetchStudio}
                />
              )}
              {activeTab === "debug" && (
                <DebugModelTab onRefresh={fetchStudio} />
              )}
              {activeTab === "codebase" && <ArchitectureCodeTab />}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
