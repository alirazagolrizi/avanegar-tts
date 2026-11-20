/**
 * مدیریت دارایی‌های صدای واقعی انسان (گویندگان عصبی فارسی) و متادیتای موتور هر فایل.
 *
 * فایل‌های WAV انسانی در public/voice/human ذخیره می‌شوند و در زمان seed داخل
 * data/audio و data/speakers کپی می‌شوند تا پخش‌کننده/ویجت مستقیماً صدای انسان
 * را پخش کند. برای هر فایل یک sidecar با پسوند .meta.json نگهداری می‌شود.
 */
import fs from "node:fs";
import path from "node:path";
import { PRONUNCIATION_VERSION } from "@/lib/persian-pronunciation";

export const HUMAN_VOICE_DIR = path.join(
  process.cwd(),
  "public",
  "voice",
  "human"
);

export interface HumanVoiceAsset {
  filename: string;
  absolutePath: string;
  voice: string;
  durationSec?: number;
}

export type VoiceMode = "unified-main" | "unified-multilingual" | "dual";

export interface AudioMeta {
  engine: string;
  architecture?: string;
  style_vector_dim?: number;
  voice: string;
  en_voice?: string;
  voice_mode?: VoiceMode;
  unified_voice?: string | null;
  voice_consistency?: number;
  f0_mean_hz?: number;
  accent_lock?: boolean;
  pronunciation_version?: string;
  persona?: string;
  persona_label?: string;
  persona_profile?: Record<string, unknown>;
  alpha?: number;
  beta?: number;
  diffusion_steps?: number;
  embedding_scale?: number;
  ipa_preview?: string;
  bilingual?: boolean;
  english_preserved?: boolean;
  en_spans?: number;
  fa_spans?: number;
  durationSec: number;
  sampleRate: number;
  source?: string;
  generatedAt?: string;
}

/** بررسی اینکه آیا فایل صوتی با موتور صدای واقعی انسان تولید شده است. */
export function isHumanEngine(engine?: string | null): boolean {
  return engine === "styletts2-human" || engine === "edge-neural-human";
}

interface HumanManifestEntry {
  filename: string;
  voice: string;
  engine?: string;
  duration_sec?: number;
}

let cachedManifest: Record<string, HumanManifestEntry> | null = null;

function loadHumanManifest(): Record<string, HumanManifestEntry> {
  if (cachedManifest) return cachedManifest;
  const manifestPath = path.join(HUMAN_VOICE_DIR, "manifest.json");
  try {
    cachedManifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  } catch {
    cachedManifest = {};
  }
  return cachedManifest!;
}

/** یافتن نمونه صدای انسانی متناظر با نام فایل صوتی. */
export function humanVoiceAssetLookup(filename: string): HumanVoiceAsset | null {
  const base = path.basename(filename);
  const absolutePath = path.join(HUMAN_VOICE_DIR, base);
  if (!fs.existsSync(absolutePath)) return null;
  const manifest = loadHumanManifest();
  return {
    filename: base,
    absolutePath,
    voice: manifest[base]?.voice ?? "fa-IR-Neural",
    durationSec: manifest[base]?.duration_sec,
  };
}

export function listHumanVoiceAssets(): HumanVoiceAsset[] {
  const manifest = loadHumanManifest();
  const assets: HumanVoiceAsset[] = [];
  for (const entry of Object.values(manifest)) {
    const absolutePath = path.join(HUMAN_VOICE_DIR, entry.filename);
    if (!fs.existsSync(absolutePath)) continue;
    assets.push({
      filename: entry.filename,
      absolutePath,
      voice: entry.voice,
      durationSec: entry.duration_sec,
    });
  }
  return assets;
}

export function audioMetaPath(targetDir: string, filename: string): string {
  return path.join(targetDir, `${path.basename(filename)}.meta.json`);
}

export function readAudioMeta(
  targetDir: string,
  filename: string
): AudioMeta | null {
  const metaPath = audioMetaPath(targetDir, filename);
  if (!fs.existsSync(metaPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(metaPath, "utf-8")) as AudioMeta;
  } catch {
    return null;
  }
}

export function installHumanVoiceAsset(
  targetDir: string,
  filename: string,
  payload: Omit<AudioMeta, "generatedAt"> & Record<string, unknown>
): AudioMeta {
  fs.mkdirSync(targetDir, { recursive: true });
  const metaPath = audioMetaPath(targetDir, filename);
  // ادغام با متادیتای موجود تا فیلدهای راستی‌آزمایی موتور (spoken_text و…) پاک نشوند
  let existing: Record<string, unknown> = {};
  try {
    existing = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
  } catch {
    existing = {};
  }
  const meta = {
    ...existing,
    pronunciation_version:
      (payload as Record<string, unknown>).pronunciation_version ??
      PRONUNCIATION_VERSION,
    ...payload,
    generatedAt: new Date().toISOString(),
  } as AudioMeta;
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf-8");
  return meta;
}

/** خواندن خام متادیتا شامل فیلدهای راستی‌آزمایی موتور صدای انسانی. */
export function readRawAudioMeta(
  targetDir: string,
  filename: string
): Record<string, unknown> {
  const metaPath = audioMetaPath(targetDir, filename);
  if (!fs.existsSync(metaPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(metaPath, "utf-8"));
  } catch {
    return {};
  }
}

/** نگاشت جنسیت گوینده به شناسه گوینده عصبی فارسی. */
export function voiceForGender(gender: string): string {
  return gender === "female" ? "fa-IR-DilaraNeural" : "fa-IR-FaridNeural";
}

/**
 * نگاشت گوینده به صدای عصبی بومی انگلیسی (فقط برای حالت قدیمی dual جهت مقایسه A/B).
 * مدل C جدید (dorsa_radmehr) از صدای پرچم‌دار en-US-AvaNeural، مدل B از en-US-JennyNeural،
 * مدل A از en-US-GuyNeural و کاوه پارسا از en-US-ChristopherNeural استفاده می‌کند.
 */
export function englishVoiceForGender(
  gender: string,
  speakerCode?: string
): string {
  if (speakerCode === "dorsa_radmehr") return "en-US-AvaNeural";
  if (speakerCode === "sara_tehrani") return "en-US-JennyNeural";
  if (speakerCode === "kaveh_parsa") return "en-US-ChristopherNeural";
  if (speakerCode === "arash_rad") return "en-US-GuyNeural";
  return gender === "female" ? "en-US-AvaNeural" : "en-US-GuyNeural";
}

/**
 * گوینده چندزبانه تک‌صدا (می‌تواند فارسی و انگلیسی را با یک طنین بخواند).
 * زن: en-US-AvaMultilingualNeural | مرد: en-US-AndrewMultilingualNeural
 */
export function multilingualVoiceForGender(gender: string): string {
  return gender === "female"
    ? "en-US-AvaMultilingualNeural"
    : "en-US-AndrewMultilingualNeural";
}

export interface ResolvedVoicePlan {
  voiceMode: VoiceMode;
  /** گوینده فارسی (در حالت تک‌صدا همان گوینده واحد است) */
  faVoice: string;
  /** گوینده انگلیسی (در حالت تک‌صدا دقیقاً برابر faVoice است) */
  enVoice: string;
  unifiedVoice: string | null;
  unified: boolean;
  descriptionFa: string;
}

/**
 * تعیین نقشه صوتی نهایی هر گوینده بر اساس حالت انتخابی.
 * - unified-main (پیش‌فرض و رفع باگ مدل B): هر دو زبان با گوینده اصلی مدل.
 * - unified-multilingual: هر دو زبان با یک گوینده چندزبانه هم‌جنس.
 * - dual (قدیمی): فارسی و انگلیسی با دو گوینده متفاوت (فقط برای مقایسه).
 */
export function resolveVoicePlan(
  speakerCode: string | undefined,
  gender: string,
  voiceMode: VoiceMode = "unified-main"
): ResolvedVoicePlan {
  const faVoice = voiceForGender(gender);
  if (voiceMode === "unified-multilingual") {
    const uni = multilingualVoiceForGender(gender);
    return {
      voiceMode,
      faVoice: uni,
      enVoice: uni,
      unifiedVoice: uni,
      unified: true,
      descriptionFa: `تک‌صدای چندزبانه (${uni}) برای فارسی و انگلیسی`,
    };
  }
  if (voiceMode === "dual") {
    const enVoice = englishVoiceForGender(gender, speakerCode);
    return {
      voiceMode,
      faVoice,
      enVoice,
      unifiedVoice: null,
      unified: false,
      descriptionFa: `دو صدای جدا: فارسی (${faVoice}) + انگلیسی (${enVoice})`,
    };
  }
  return {
    voiceMode: "unified-main",
    faVoice,
    enVoice: faVoice,
    unifiedVoice: faVoice,
    unified: true,
    descriptionFa: `تک‌صدای اصلی مدل (${faVoice}) برای فارسی و انگلیسی`,
  };
}

/** آیا این فایل صوتی با حالت تک‌صدا (یکدست) تولید شده است؟ */
export function isUnifiedVoiceMeta(meta: {
  voice_mode?: string;
  unified_voice?: string | null;
  voice?: string;
  en_voice?: string;
} | null): boolean {
  if (!meta) return false;
  if (meta.voice_mode === "unified-main" || meta.voice_mode === "unified-multilingual")
    return true;
  // سازگاری با فایل‌های قدیمی: اگر en_voice برابر voice باشد یعنی تک‌صدا
  if (meta.voice && meta.en_voice && meta.voice === meta.en_voice) return true;
  return false;
}

/**
 * محاسبه کالیبره‌شده جابه‌جایی زیر و بمی بر اساس فرکانس پایه واقعی هر جنسیت.
 * رفع باگ مدل B: قبلاً فرکانس پایه زن (204Hz) از مرجع مرد (120Hz) کم می‌شد و +40Hz
 * اعمال می‌گردید که باعث اعوجاج شدید حروف، اعداد و سوت‌زدگی صدا می‌شد!
 */
export function pitchOffsetFor(basePitchHz: number, gender?: string): number {
  const isFemale = gender === "female" || (!gender && basePitchHz >= 165);
  const nominalHz = isFemale ? 200 : 118;
  const offset = Math.round((basePitchHz - nominalHz) * 0.25);
  return Math.max(-6, Math.min(6, offset));
}
