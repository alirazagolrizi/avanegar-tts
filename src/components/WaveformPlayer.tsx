"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Pause, Play, Volume2 } from "lucide-react";
import type { AudioTrackItem } from "@/types/studio";
import { formatDurationFa, toPersianDigits } from "@/lib/persian-nlp";

const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5, 1.75, 2];

interface WaveformPlayerProps {
  tracks: AudioTrackItem[];
  compact?: boolean;
}

export function WaveformPlayer({ tracks, compact = false }: WaveformPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [selectedTrackId, setSelectedTrackId] = useState<number>(
    tracks[0]?.id ?? 0
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(tracks[0]?.durationSec ?? 0);
  const [speedIndex, setSpeedIndex] = useState(1); // 1x

  const activeTrack =
    tracks.find((t) => t.id === selectedTrackId) ?? tracks[0] ?? null;

  useEffect(() => {
    if (!tracks.some((t) => t.id === selectedTrackId) && tracks[0]) {
      setSelectedTrackId(tracks[0].id);
    }
  }, [tracks, selectedTrackId]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el || !activeTrack) return;
    setCurrentTime(0);
    setDuration(activeTrack.durationSec);
    setIsPlaying(false);
    el.pause();
    el.load();
    el.playbackRate = SPEED_OPTIONS[speedIndex];
  }, [activeTrack?.id, activeTrack?.audioUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const applyRate = (nextIndex: number) => {
    setSpeedIndex(nextIndex);
    const el = audioRef.current;
    if (el) {
      el.playbackRate = SPEED_OPTIONS[nextIndex];
      if ("preservesPitch" in el) {
        el.preservesPitch = true;
      }
      const legacyEl = el as HTMLAudioElement & { webkitPreservesPitch?: boolean };
      if ("webkitPreservesPitch" in legacyEl) {
        legacyEl.webkitPreservesPitch = true;
      }
    }
  };

  const togglePlay = async () => {
    const el = audioRef.current;
    if (!el) return;
    el.playbackRate = SPEED_OPTIONS[speedIndex];
    if (el.paused) {
      try {
        await el.play();
      } catch {
        setIsPlaying(false);
      }
    } else {
      el.pause();
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = audioRef.current;
    if (!el) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const total = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : duration;
    if (total > 0) {
      el.currentTime = ratio * total;
      setCurrentTime(ratio * total);
    }
  };

  const handleVoiceChange = async (trackId: number) => {
    const wasPlaying = isPlaying;
    setSelectedTrackId(trackId);
    if (wasPlaying) {
      setTimeout(() => {
        const el = audioRef.current;
        if (el) {
          el.playbackRate = SPEED_OPTIONS[speedIndex];
          el.play().catch(() => {});
        }
      }, 60);
    }
  };

  if (!activeTrack) return null;

  const peaks =
    activeTrack.waveformPeaks && activeTrack.waveformPeaks.length > 0
      ? activeTrack.waveformPeaks
      : Array.from({ length: 48 }, (_, i) => 0.25 + ((i * 17) % 60) / 100);

  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;
  const activeBars = Math.round(progress * peaks.length);
  const currentSpeed = SPEED_OPTIONS[speedIndex];

  return (
    <div className="rounded-xl border border-slate-200/90 bg-slate-50/80 p-3.5">
      <audio
        ref={audioRef}
        src={activeTrack.audioUrl}
        preload="metadata"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false);
          setCurrentTime(0);
        }}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setDuration(d);
        }}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
      />

      {!compact && (
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500">
              <Volume2 className="h-3.5 w-3.5 text-teal-700" />
              گوینده:
            </span>
            {tracks.map((track) => {
              const selected = track.id === activeTrack.id;
              return (
                <button
                  key={track.id}
                  type="button"
                  onClick={() => handleVoiceChange(track.id)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                    selected
                      ? "bg-teal-700 text-white shadow-xs"
                      : "border border-slate-200 bg-white text-slate-700 hover:border-teal-500"
                  }`}
                >
                  {track.speakerName}
                  <span
                    className={`mr-1.5 text-[10px] font-normal ${
                      selected ? "text-teal-100" : "text-slate-400"
                    }`}
                  >
                    {track.speakerCode === "dorsa_radmehr"
                      ? "مدل C"
                      : track.speakerCode === "sara_tehrani"
                        ? "مدل B"
                        : track.speakerCode === "arash_rad"
                          ? "مدل A"
                          : "ref_s"}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
            <span className="ltr-code rounded-md bg-white px-2 py-0.5 font-medium text-slate-600 ring-1 ring-slate-200">
              24 kHz • α={activeTrack.alpha ?? 0.28} β={activeTrack.beta ?? 0.72}
            </span>
            <span
              className={`rounded-md px-2 py-0.5 font-semibold ring-1 ${
                activeTrack.engine === "styletts2-human" ||
                activeTrack.engine === "edge-neural-human"
                  ? activeTrack.unified === false
                    ? "bg-amber-50 text-amber-800 ring-amber-200"
                    : "bg-teal-50 text-teal-800 ring-teal-200"
                  : "bg-amber-50 text-amber-800 ring-amber-200"
              }`}
              title={
                activeTrack.unified === false
                  ? `دوصدایی قدیمی (باگ مدل B): فارسی ${activeTrack.voice} ≠ انگلیسی ${activeTrack.enVoice}`
                  : `تک‌صدا ✓ فارسی و انگلیسی با ${activeTrack.unifiedVoice ?? activeTrack.voice}`
              }
            >
              {activeTrack.engine === "styletts2-human" ||
              activeTrack.engine === "edge-neural-human"
                ? activeTrack.unified === false
                  ? "دوصدا ⚠ نیازمند تعمیر"
                  : activeTrack.bilingual
                    ? "تک‌صدا ✓ انسان (FA+EN)"
                    : "StyleTTS 2 • صدای انسان"
                : "موتور محلی"}
            </span>
            <span className="ltr-code rounded-md bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700 ring-1 ring-emerald-200/80">
              RTF {activeTrack.rtf}x
            </span>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={togglePlay}
          aria-label={isPlaying ? "توقف پخش" : "پخش فایل صوتی"}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-700 text-white shadow-sm transition hover:bg-teal-800 active:scale-95"
        >
          {isPlaying ? (
            <Pause className="h-4 w-4 fill-current" />
          ) : (
            <Play className="h-4 w-4 fill-current translate-x-[-1px]" />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div
            onClick={handleSeek}
            dir="ltr"
            title="کلیک برای جابه‌جایی در فایل صوتی"
            className="flex h-8 cursor-pointer items-center gap-[2px] select-none"
          >
            {peaks.map((peak, idx) => {
              const played = idx < activeBars;
              return (
                <span
                  key={idx}
                  style={{ height: `${Math.max(18, Math.round(peak * 100))}%` }}
                  className={`min-w-[2px] flex-1 rounded-full transition-colors ${
                    played
                      ? "bg-teal-600"
                      : "bg-slate-300/90 hover:bg-teal-400/70"
                  }`}
                />
              );
            })}
          </div>
          <div
            dir="ltr"
            className="mt-0.5 flex items-center justify-between text-[11px] font-medium text-slate-500 tabular-nums"
          >
            <span>{formatDurationFa(currentTime)}</span>
            <span>{formatDurationFa(duration)}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => applyRate((speedIndex + 1) % SPEED_OPTIONS.length)}
          title="تغییر سرعت پخش"
          dir="ltr"
          className="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-teal-700 transition hover:border-teal-500 hover:bg-teal-50"
        >
          {toPersianDigits(currentSpeed)}×
        </button>

        <a
          href={activeTrack.audioUrl}
          download={activeTrack.audioFilename}
          title="دانلود فایل WAV ذخیره‌شده در سرور"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:border-teal-500 hover:text-teal-700"
        >
          <Download className="h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  );
}
