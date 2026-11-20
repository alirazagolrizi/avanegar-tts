/**
 * AvaNegar On-Premise StyleTTS 2 Bilingual Neural Player Widget v3.0
 * ویجت سبک، مستقل و بدون وابستگی خارجی (پشتیبانی از مدل C، B و A • کنترل سرعت و موج صوتی)
 *
 * نحوه استفاده در صفحه مقاله:
 * <div data-avanegar-article="zoomit-blackwell-gpu-review" data-accent="#E11D48" data-theme="light"></div>
 * <script src="https://tts.zoomit.ir/widget/avanegar-player.js" data-api-base="https://tts.zoomit.ir" async></script>
 */
(function (window, document) {
  "use strict";

  const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];
  const FA_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

  function toPersianDigits(input) {
    return String(input).replace(/\d/g, (d) => FA_DIGITS[Number(d)]);
  }

  function formatTime(sec) {
    if (!Number.isFinite(sec) || sec < 0) return "۰۰:۰۰";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return toPersianDigits(String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0"));
  }

  function buildStyles(accent, theme) {
    const isDark = theme === "dark";
    const bg = isDark ? "#0f172a" : "#ffffff";
    const surface = isDark ? "#1e293b" : "#f8fafc";
    const border = isDark ? "#334155" : "#e2e8f0";
    const text = isDark ? "#f8fafc" : "#0f172a";
    const muted = isDark ? "#94a3b8" : "#64748b";
    const barIdle = isDark ? "#334155" : "#cbd5e1";

    return `
      :host { display: block; font-family: Vazirmatn, Tahoma, system-ui, sans-serif; direction: rtl; }
      * { box-sizing: border-box; }
      .avn-card {
        background: ${bg};
        color: ${text};
        border: 1px solid ${border};
        border-radius: 16px;
        padding: 14px 16px;
        box-shadow: 0 4px 20px rgba(15, 23, 42, ${isDark ? "0.35" : "0.05"});
      }
      .avn-top {
        display: flex; align-items: center; justify-content: space-between;
        gap: 10px; margin-bottom: 12px; flex-wrap: wrap;
      }
      .avn-badge-row { display: flex; align-items: center; gap: 8px; min-width: 0; }
      .avn-dot {
        width: 8px; height: 8px; border-radius: 999px; background: ${accent};
        box-shadow: 0 0 0 3px ${accent}24; flex-shrink: 0;
      }
      .avn-label { font-size: 12px; font-weight: 700; color: ${text}; white-space: nowrap; }
      .avn-sub { font-size: 11px; color: ${muted}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .avn-controls-meta { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
      .avn-select, .avn-speed, .avn-dl {
        background: ${surface}; color: ${text}; border: 1px solid ${border};
        border-radius: 9px; padding: 5px 9px; font-family: inherit;
        font-size: 11.5px; font-weight: 600; cursor: pointer; transition: border-color 0.15s, background 0.15s;
        text-decoration: none; display: inline-flex; align-items: center; gap: 4px;
      }
      .avn-select:hover, .avn-speed:hover, .avn-dl:hover { border-color: ${accent}; }
      .avn-speed { direction: ltr; min-width: 52px; justify-content: center; color: ${accent}; font-weight: 700; }
      .avn-main { display: flex; align-items: center; gap: 12px; }
      .avn-play {
        width: 44px; height: 44px; border-radius: 999px; border: none;
        background: ${accent}; color: #ffffff; cursor: pointer; flex-shrink: 0;
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 6px 16px ${accent}40; transition: transform 0.15s, opacity 0.15s;
      }
      .avn-play:hover { transform: scale(1.04); }
      .avn-play:active { transform: scale(0.97); }
      .avn-skip {
        width: 30px; height: 30px; border-radius: 8px; border: 1px solid ${border};
        background: ${surface}; color: ${muted}; font-family: inherit; font-size: 10px;
        font-weight: 700; cursor: pointer; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
      }
      .avn-skip:hover { color: ${text}; border-color: ${accent}; }
      .avn-wave-wrap { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 5px; }
      .avn-wave {
        height: 36px; display: flex; align-items: center; gap: 2px;
        cursor: pointer; direction: ltr; user-select: none; padding: 2px 0;
      }
      .avn-bar {
        flex: 1; min-width: 2px; border-radius: 999px; background: ${barIdle};
        transition: background-color 0.12s, transform 0.12s;
      }
      .avn-bar.played { background: ${accent}; }
      .avn-time-row {
        display: flex; justify-content: space-between; font-size: 11px;
        color: ${muted}; direction: ltr; font-variant-numeric: tabular-nums;
      }
      .avn-error { font-size: 12px; color: #e11d48; padding: 6px 2px; }
      .avn-loading { font-size: 12px; color: ${muted}; padding: 6px 2px; }
    `;
  }

  function mountWidget(host, opts) {
    const options = opts || {};
    const slug = options.articleSlug || host.getAttribute("data-avanegar-article");
    if (!slug) return null;

    const apiBase = (
      options.apiBase ||
      host.getAttribute("data-api-base") ||
      document.currentScript?.getAttribute("data-api-base") ||
      window.location.origin
    ).replace(/\/$/, "");

    const endpointPath =
      options.endpointPath ||
      host.getAttribute("data-endpoint-path") ||
      "/api/widget/articles";
    const accent = options.accent || host.getAttribute("data-accent") || "#0f766e";
    const theme = options.theme || host.getAttribute("data-theme") || "light";

    const shadow = host.shadowRoot || host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<style>${buildStyles(accent, theme)}</style>
      <div class="avn-card"><div class="avn-loading">در حال دریافت نسخه صوتی مقاله از سرور محلی...</div></div>`;

    const audio = new Audio();
    audio.preload = "metadata";
    let speedIdx = 1; // 1.0x
    let voices = [];
    let currentVoice = null;
    let barEls = [];

    function applyPlaybackRate() {
      const rate = SPEEDS[speedIdx];
      audio.playbackRate = rate;
      if ("preservesPitch" in audio) audio.preservesPitch = true;
      if ("webkitPreservesPitch" in audio) audio.webkitPreservesPitch = true;
      const btn = shadow.querySelector(".avn-speed");
      if (btn) btn.textContent = toPersianDigits(rate) + "×";
    }

    function updateProgress() {
      const dur = audio.duration || (currentVoice ? currentVoice.duration_sec : 0) || 1;
      const cur = audio.currentTime || 0;
      const ratio = Math.max(0, Math.min(1, cur / dur));
      const activeBars = Math.round(ratio * barEls.length);
      for (let i = 0; i < barEls.length; i++) {
        barEls[i].classList.toggle("played", i < activeBars);
      }
      const curEl = shadow.querySelector("[data-cur]");
      const durEl = shadow.querySelector("[data-dur]");
      if (curEl) curEl.textContent = formatTime(cur);
      if (durEl) durEl.textContent = formatTime(dur);
    }

    function updatePlayIcon(playing) {
      const btn = shadow.querySelector(".avn-play");
      if (!btn) return;
      btn.setAttribute("aria-label", playing ? "توقف پخش" : "پخش نسخه صوتی");
      btn.innerHTML = playing
        ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1.2"/><rect x="14" y="5" width="4" height="14" rx="1.2"/></svg>'
        : '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.14v13.72a1 1 0 0 0 1.52.85l10.8-6.86a1 1 0 0 0 0-1.7L9.52 4.29A1 1 0 0 0 8 5.14z"/></svg>';
    }

    function selectVoice(speakerId, autoPlay) {
      const found = voices.find((v) => v.speaker_id === speakerId) || voices[0];
      if (!found) return;
      currentVoice = found;
      audio.pause();
      audio.src = found.audio_url.startsWith("http")
        ? found.audio_url
        : apiBase + found.audio_url;
      audio.load();
      applyPlaybackRate();

      const wave = shadow.querySelector(".avn-wave");
      const peaks = Array.isArray(found.waveform_peaks) && found.waveform_peaks.length
        ? found.waveform_peaks
        : new Array(48).fill(0.45);
      if (wave) {
        wave.innerHTML = "";
        barEls = peaks.map((p) => {
          const b = document.createElement("span");
          b.className = "avn-bar";
          b.style.height = Math.max(16, Math.round(Number(p) * 100)) + "%";
          wave.appendChild(b);
          return b;
        });
      }

      const dl = shadow.querySelector(".avn-dl");
      if (dl) dl.href = audio.src;

      updateProgress();
      updatePlayIcon(false);
      if (autoPlay) {
        audio.play().catch(() => {});
      }
    }

    function render(manifest) {
      voices = manifest.voices || [];
      if (!voices.length) {
        shadow.innerHTML = `<style>${buildStyles(accent, theme)}</style>
          <div class="avn-card"><div class="avn-error">فایل صوتی برای این مقاله ثبت نشده است.</div></div>`;
        return;
      }

      const optionsHtml = voices
        .map((v) => `<option value="${v.speaker_id}">گوینده: ${v.speaker_label}</option>`)
        .join("");

      shadow.innerHTML = `
        <style>${buildStyles(accent, theme)}</style>
        <div class="avn-card" role="region" aria-label="پخش‌کننده صوتی مقاله">
          <div class="avn-top">
            <div class="avn-badge-row">
              <span class="avn-dot"></span>
              <span class="avn-label">شنیدن نسخه صوتی مقاله</span>
              <span class="avn-sub">${manifest.article_title || ""}</span>
            </div>
            <div class="avn-controls-meta">
              <select class="avn-select" aria-label="انتخاب گوینده">${optionsHtml}</select>
              <button type="button" class="avn-speed" title="تغییر سرعت پخش">۱×</button>
              <a class="avn-dl" download title="دانلود فایل صوتی">دانلود</a>
            </div>
          </div>
          <div class="avn-main">
            <button type="button" class="avn-play" aria-label="پخش نسخه صوتی"></button>
            <button type="button" class="avn-skip" data-skip="-15" title="۱۵ ثانیه عقب">-۱۵</button>
            <div class="avn-wave-wrap">
              <div class="avn-wave" title="جابه‌جایی در فایل صوتی"></div>
              <div class="avn-time-row">
                <span data-cur>۰۰:۰۰</span>
                <span data-dur>۰۰:۰۰</span>
              </div>
            </div>
            <button type="button" class="avn-skip" data-skip="15" title="۱۵ ثانیه جلو">+۱۵</button>
          </div>
        </div>
      `;

      shadow.querySelector(".avn-play").addEventListener("click", () => {
        if (audio.paused) audio.play().catch(() => {});
        else audio.pause();
      });

      shadow.querySelector(".avn-select").addEventListener("change", (e) => {
        const wasPlaying = !audio.paused;
        selectVoice(e.target.value, wasPlaying);
      });

      shadow.querySelector(".avn-speed").addEventListener("click", () => {
        speedIdx = (speedIdx + 1) % SPEEDS.length;
        applyPlaybackRate();
      });

      shadow.querySelectorAll(".avn-skip").forEach((btn) => {
        btn.addEventListener("click", () => {
          const delta = Number(btn.getAttribute("data-skip") || 0);
          const dur = audio.duration || currentVoice?.duration_sec || 0;
          audio.currentTime = Math.max(0, Math.min(dur, (audio.currentTime || 0) + delta));
          updateProgress();
        });
      });

      shadow.querySelector(".avn-wave").addEventListener("click", (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const dur = audio.duration || currentVoice?.duration_sec || 0;
        if (dur > 0) {
          audio.currentTime = ratio * dur;
          updateProgress();
        }
      });

      audio.addEventListener("play", () => updatePlayIcon(true));
      audio.addEventListener("pause", () => updatePlayIcon(false));
      audio.addEventListener("ended", () => updatePlayIcon(false));
      audio.addEventListener("timeupdate", updateProgress);
      audio.addEventListener("loadedmetadata", updateProgress);

      selectVoice(voices[0].speaker_id, false);
    }

    fetch(`${apiBase}${endpointPath}/${encodeURIComponent(slug)}`)
      .then((res) => {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(render)
      .catch(() => {
        shadow.innerHTML = `<style>${buildStyles(accent, theme)}</style>
          <div class="avn-card"><div class="avn-error">ارتباط با سرور صوتی مقاله برقرار نشد.</div></div>`;
      });

    return {
      destroy() {
        audio.pause();
        audio.src = "";
      },
    };
  }

  function initAll() {
    document.querySelectorAll("[data-avanegar-article]").forEach((el) => {
      if (!el.dataset.avanegarMounted) {
        el.dataset.avanegarMounted = "1";
        mountWidget(el);
      }
    });
  }

  window.AvaNegarPlayer = { mount: mountWidget, initAll: initAll, version: "3.0.0" };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAll);
  } else {
    initAll();
  }
})(window, document);
