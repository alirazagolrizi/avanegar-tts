/**
 * پل اجرای موتور «صدای واقعی انسان» از داخل Next.js.
 *
 * نسخه دیباگ‌شده:
 *  - PYTHONPATH به پوشه vendor داخل پروژه تنظیم می‌شود تا وابستگی به
 *    site-packages کاربر (که ممکن است در محیط سرور وجود نداشته باشد) از بین برود؛
 *    این همان ریشهٔ باگ «متن درخواستی خوانده نمی‌شود» بود (شکست خاموش موتور
 *    و جایگزینی با بوق مصنوعی).
 *  - تایم‌اوت تطبیقی بر پایه تعداد قطعات متن.
 *  - خودآزمایی (selftest) برای گزارش دقیق وضعیت موتور در پنل دیباگ مدل A.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export type VoiceMode = "unified-main" | "unified-multilingual" | "dual";

export interface HumanVoiceResult {
  ok: boolean;
  path?: string;
  engine?: string;
  architecture?: string;
  style_vector_dim?: number;
  bilingual?: boolean;
  english_preserved?: boolean;
  voice_mode?: VoiceMode;
  unified_voice?: string | null;
  voice_consistency?: number;
  f0_mean_hz?: number;
  persona?: string;
  persona_label?: string;
  persona_profile?: Record<string, unknown>;
  voice?: string;
  en_voice?: string;
  alpha?: number;
  beta?: number;
  diffusion_steps?: number;
  embedding_scale?: number;
  ipa_preview?: string;
  pitch?: string;
  rate?: string;
  duration_sec?: number;
  sample_rate?: number;
  waveform_peaks?: number[];
  chunk_count?: number;
  synthesized_chunks?: number;
  fa_spans?: number;
  en_spans?: number;
  english_terms_spoken?: Array<{ text: string; spoken: string }>;
  missing_chunks?: string[];
  coverage?: number;
  chars_per_sec?: number;
  spoken_text_chars?: number;
  error?: string;
  failed_chunks?: Array<{ index: number; text: string; error: string }>;
  selftest?: HumanVoiceSelfTest;
}

export interface HumanVoiceSelfTest {
  python: string;
  version: string;
  pythonpath: string;
  bilingual_voices?: {
    fa_female: string;
    en_female: string;
    fa_male: string;
    en_male: string;
  };
  imports: Record<string, boolean | string>;
}

const SCRIPT_PATH = path.join(process.cwd(), "voice-tools", "human_voice.py");
const VENDOR_DIR = path.join(process.cwd(), "voice-tools", "vendor");
const PY_ENGINE_DIR = path.join(process.cwd(), "python-engine");

function buildEnv(): NodeJS.ProcessEnv {
  const existing = process.env.PYTHONPATH ?? "";
  const parts = [VENDOR_DIR, PY_ENGINE_DIR, existing].filter(Boolean);
  return {
    ...process.env,
    PYTHONIOENCODING: "utf-8",
    PYTHONPATH: parts.join(path.delimiter),
  };
}

function resolveInterpreter(): string {
  return process.env.VOICE_PYTHON?.trim() || "python3";
}

function runScript(
  input: string,
  timeoutMs: number
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    if (!fs.existsSync(SCRIPT_PATH)) {
      resolve({ code: 127, stdout: "", stderr: "human_voice.py not found" });
      return;
    }
    const child = spawn(resolveInterpreter(), [SCRIPT_PATH], {
      cwd: process.cwd(),
      env: buildEnv(),
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({ code: null, stdout, stderr: stderr || "timeout" });
    }, timeoutMs);

    child.stdout.on("data", (c) => {
      stdout += c.toString("utf-8");
    });
    child.stderr.on("data", (c) => {
      stderr += c.toString("utf-8");
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ code: 127, stdout, stderr: err.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
    child.stdin.write(input);
    child.stdin.end();
  });
}

function parseLastJson(stdout: string): Record<string, unknown> | null {
  const lines = stdout.trim().split("\n").filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try {
      return JSON.parse(lines[i]) as Record<string, unknown>;
    } catch {
      // ادامه جست‌وجو برای آخرین JSON معتبر
    }
  }
  return null;
}

/** تایم‌اوت تطبیقی بر پایه طول متن (هر قطعه ~۱۲ ثانیه + زمان پایه). */
export function adaptiveTimeoutMs(text: string): number {
  const chunks = Math.max(1, Math.ceil(text.length / 170));
  return Math.min(420_000, 40_000 + chunks * 14_000);
}

export async function generateHumanVoice(options: {
  text: string;
  output: string;
  voice: string;
  enVoice?: string;
  gender?: string;
  voiceMode?: VoiceMode;
  unifiedVoice?: string;
  persona?: string;
  speed?: number;
  pitchHz?: number;
  alpha?: number;
  beta?: number;
  diffusionSteps?: number;
  embeddingScale?: number;
  metaJson?: string;
  allowPartial?: boolean;
  attempts?: number;
  timeoutMs?: number;
}): Promise<HumanVoiceResult | null> {
  if (process.env.DISABLE_HUMAN_VOICE === "1") return null;
  if (!fs.existsSync(SCRIPT_PATH)) return null;

  const payload = JSON.stringify({
    text: options.text,
    output: options.output,
    voice: options.voice,
    en_voice: options.enVoice,
    gender: options.gender,
    voice_mode: options.voiceMode ?? "unified-main",
    unified_voice: options.unifiedVoice ?? null,
    persona: options.persona ?? "natural",
    speed: options.speed ?? 1.0,
    pitch_hz: options.pitchHz ?? 0,
    alpha: options.alpha ?? 0.28,
    beta: options.beta ?? 0.72,
    diffusion_steps: options.diffusionSteps ?? 8,
    embedding_scale: options.embeddingScale ?? 1.15,
    sample_rate: 24000,
    meta_json: options.metaJson,
    allow_partial: options.allowPartial ?? false,
    attempts: options.attempts ?? 3,
    chunk_delay_ms: 80,
  });

  const { code, stdout, stderr } = await runScript(
    payload,
    options.timeoutMs ?? adaptiveTimeoutMs(options.text)
  );

  const parsed = parseLastJson(stdout);
  if (parsed) return parsed as unknown as HumanVoiceResult;

  return {
    ok: false,
    error: stderr.trim() || `exit_${code ?? "null"}`,
  };
}

/** خودآزمایی موتور صدا برای نمایش در پنل دیباگ مدل A. */
export async function humanVoiceSelfTest(): Promise<{
  available: boolean;
  scriptFound: boolean;
  vendorFound: boolean;
  interpreter: string;
  detail?: HumanVoiceSelfTest;
  error?: string;
}> {
  const scriptFound = fs.existsSync(SCRIPT_PATH);
  const vendorFound = fs.existsSync(path.join(VENDOR_DIR, "edge_tts"));
  if (!scriptFound) {
    return {
      available: false,
      scriptFound,
      vendorFound,
      interpreter: resolveInterpreter(),
      error: "human_voice.py یافت نشد",
    };
  }
  const { stdout, stderr } = await runScript("--selftest", 25_000);
  const parsed = parseLastJson(stdout);
  if (!parsed?.ok) {
    return {
      available: false,
      scriptFound,
      vendorFound,
      interpreter: resolveInterpreter(),
      error: stderr.trim() || "selftest_failed",
    };
  }
  const detail = (parsed as { selftest?: HumanVoiceSelfTest }).selftest;
  const importsOk =
    !!detail &&
    Object.values(detail.imports).every((v) => v === true);
  return {
    available: importsOk,
    scriptFound,
    vendorFound,
    interpreter: resolveInterpreter(),
    detail,
    error: importsOk ? undefined : JSON.stringify(detail?.imports ?? {}),
  };
}
