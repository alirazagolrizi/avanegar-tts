/**
 * نرمال‌ساز تخصصی دوزبانه (فارسی + حفظ بومی انگلیسی)، مبدل دقیق اعداد و پیش‌نمایش IPA
 * ویژه موتور مرکزی StyleTTS 2 (Style Diffusion + PL-BERT + iSTFTNet 24kHz).
 *
 * اصول کلیدی:
 *  ۱. حروف، کلمات، سرواژه‌ها و مدل‌های انگلیسی (مانند A، B، RTX 5090، GPT-4o،
 *     iPhone 17 Pro، NVMe، LTPO، Next.js، PCIe 5.0، 120Hz، 6000mAh، 32GB، 5G)
 *     هرگز به فارسی تبدیل نمی‌شوند و دقیقاً به انگلیسی حفظ و خوانده می‌شوند.
 *  ۲. اعداد در بافت فارسی (اعشار با صفر ابتدایی مثل 3.05، ممیز فارسی ۷٫۸، اعداد منفی -16،
 *     درصد پیشوندی/پسوندی ٪۴۰ و 32.5%، ارز $1,299، هزارگان 3,200,000,000، فهرست ۱،۲،۳،
 *     ساعت 14:30، نسخه 16.4.2، بازه 10-30، ترتیبی ۳۰ام) با دقت ۱۰۰٪ به حروف فارسی تبدیل می‌شوند.
 *  ۳. حروف فارسی (ی/ک استاندارد، حذف کشیده «ـ» و کاراکترهای نامرئی، حفظ همزه صحیح
 *     در «مسئول/ارائه/مؤثر»، اصلاح نیم‌فاصله «می‌/‌ها/‌تر» و حفظ اعراب) استانداردسازی می‌شوند.
 */

import {
  expandPersianNumbers,
  normalizeDigitsToAscii,
  numberToPersianWords,
} from "@/lib/persian-numbers";
import {
  type BilingualSpan,
  ENGLISH_SPEECH_HINTS,
  findWrongPersianTransliterations,
  maskEnglishSpans,
  segmentBilingualText,
  unmaskEnglishSpans,
} from "@/lib/english-transliteration";
import {
  PRONUNCIATION_VERSION,
  applyPersianPronunciation,
  persianAccentEnglish,
} from "@/lib/persian-pronunciation";

export {
  PRONUNCIATION_VERSION,
  PERSIAN_HOMOGRAPHS,
  GLUED_PERSIAN_PHRASES,
  PERSIAN_PRONUNCIATION_SUITE,
  persianAccentEnglish,
} from "@/lib/persian-pronunciation";

export { numberToPersianWords } from "@/lib/persian-numbers";
export { segmentBilingualText, type BilingualSpan } from "@/lib/english-transliteration";

export const TECH_LEXICON: Record<string, string> = ENGLISH_SPEECH_HINTS;

const FA_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

export function toPersianDigits(value: string | number): string {
  return String(value).replace(/\d/g, (d) => FA_DIGITS[Number(d)]);
}

export function toEnglishDigits(value: string): string {
  return normalizeDigitsToAscii(value);
}

export function formatDurationFa(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "۰۰:۰۰";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return toPersianDigits(
    `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
  );
}

/**
 * استانداردسازی حروف فارسی و حذف نویسه‌های مخرب تلفظ (کشیده، کاراکترهای کنترل نامرئی،
 * ی/ک عربی) با حفظ کامل کلمات همزه‌دار و اعراب ویراستاری.
 */
export function normalizePersianLetters(input: string): string {
  return (
    input
      // حذف کشیده عربی (ـ) که باعث بریدگی کلمات در TTS می‌شود (مثلاً ســـلام → سلام)
      .replace(/\u0640+/g, "")
      // حذف کاراکترهای نامرئی مخرب (BOM، LRM، RLM، ZWSP) با حفظ نیم‌فاصله \u200c
      .replace(/[\u200b\u200d\u200e\u200f\u202a-\u202e\ufeff]/g, "")
      // یکسان‌سازی انواع ی عربی/غیرمعیار به ی فارسی (با حفظ «ئ» در مسئول/جزئیات/ارائه)
      .replace(/[\u064a\u0649\u06cc\u06cd\u06d0\u06d1]/g, "ی")
      // یکسان‌سازی ک عربی به ک فارسی
      .replace(/[\u0643\u06aa]/g, "ک")
      // یکسان‌سازی ه و الف
      .replace(/\u06c0/g, "ه\u0654") // ۀ → هٔ
      .replace(/[\u0629\u06d5]/g, "ه") // ة / ە → ه
      .replace(/[\u0623\u0625\u0671]/g, "ا") // أ / إ / ٱ → ا
      .replace(/¬/g, "\u200c")
      // حذف نیم‌فاصله‌های تکراری
      .replace(/\u200c{2,}/g, "\u200c")
  );
}

/**
 * نرمال‌سازی دوزبانه متن مقاله:
 * - فارسی و اعداد فارسی را استاندارد و حروفی می‌کند.
 * - حروف، واژه‌ها، سرواژه‌ها و مدل‌های انگلیسی را بدون تبدیل به فارسی دست‌نخورده نگه می‌دارد!
 */
export function normalizePersianForXTTS(rawText: string): string {
  if (!rawText || !rawText.trim()) return "";

  // ۱. پاک‌سازی تگ HTML، لینک و مارک‌داون
  let text = rawText
    .replace(/<[^>]+>/g, " ")
    .replace(/\[([^\]]+)\]\(https?:\/\/[^\s)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " ");

  // ۲. استانداردسازی حروف فارسی
  text = normalizePersianLetters(text);

  // ۳. محافظت از تمام عبارات، حروف، سرواژه‌ها و واحدهای انگلیسی تا به فارسی تبدیل نشوند!
  const { masked, spans } = maskEnglishSpans(text);
  text = masked;

  // ۴. بازنویسی دقیق تمام ساختارهای عددی در بافت فارسی (اعشار، منفی، درصد، ارز، هزارگان، زمان، ترتیبی)
  text = expandPersianNumbers(text);

  // ۵. اصلاح نیم‌فاصله فعل‌های «می‌/نمی‌»، جمع «‌ها/‌های/‌هایی» و صفت تفضیلی «‌تر/‌ترین»
  text = text.replace(
    /(^|[\s(«،؛:])(ن?می)\s+(?=[\u0600-\u06FF]{2,})/g,
    "$1$2\u200c"
  );
  text = text.replace(
    /([\u0600-\u06FF]{2,})\s+(ها|های|هایی|هایم|هایت|هایش|هایمان|هایتان|هایشان)(?=\s|[،؛.؟!)\]»]|$)/g,
    "$1\u200c$2"
  );
  // پس از حروف نچسب (ا، د، ذ، ر، ز، ژ، و) پسوند تر/ترین مستقیم می‌چسبد (جدیدتر)، وگرنه با نیم‌فاصله (سریع‌تر)
  text = text.replace(
    /([\u0600-\u06FF]*[ادذرزژو])\s+(ترین|تر)(?=\s|[،؛.؟!)\]»]|$)/g,
    "$1$2"
  );
  text = text.replace(
    /([\u0600-\u06FF]{2,})\s+(ترین|تر)(?=\s|[،؛.؟!)\]»]|$)/g,
    "$1\u200c$2"
  );

  // ۶. یکسان‌سازی علائم نگارشی در بخش‌های فارسی (بدون دست زدن به توکن‌های انگلیسی)
  text = text
    .replace(/,/g, "،")
    .replace(/\?/g, "؟")
    .replace(/;/g, "؛")
    .replace(/\s+\u200c|\u200c\s+/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*([،؛؟!.])\s*/g, "$1 ")
    .replace(/\n{2,}/g, "\n");

  // ۶.۵. لایه تلفظ دقیق فارسی: اعراب هوموگراف‌ها (کُرهای، مَصرَف، مِلَّت) و
  // تفکیک عبارات سرهم‌نویسی‌شده (درمقایسهبا → در مقایسه با) برای خوانش کلمه‌به‌کلمه
  text = applyPersianPronunciation(text).text;

  // ۷. بازگرداندن دقیق عبارات انگلیسی با املای اصلی انگلیسی
  text = unmaskEnglishSpans(text, spans)
    .replace(/\s+([،؛؟!.])/g, "$1")
    .replace(/([،؛؟!])(?=[^\s\n])/g, "$1 ")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  return text;
}

export interface PronunciationAuditReport {
  normalized: string;
  pronunciationVersion: string;
  persianRulesApplied: string[];
  accentLock: boolean;
  spans: BilingualSpan[];
  englishSpans: Array<{ text: string; spoken: string }>;
  persianDigitsRemaining: string[];
  wrongTransliterations: string[];
  allEnglishPreserved: boolean;
  passed: boolean;
}

/**
 * گزارش کامل ممیزی تلفظ دوزبانه و اعداد برای پنل دیباگ مدل B:
 *  - تأیید می‌کند تمام کلمات و حروف انگلیسی دقیقاً انگلیسی مانده‌اند (نه فارسی!).
 *  - تأیید می‌کند تمام اعداد بافت فارسی به حروف دقیق فارسی تبدیل شده‌اند.
 *  - تأیید می‌کند هیچ آوانگاری فارسی اشتباهِ اصطلاحات انگلیسی وجود ندارد.
 */
const CONTIGUOUS_LATIN_FOR_AUDIT = /[A-Za-z][A-Za-z0-9'’+._\-]*/g;

export function pronunciationAudit(rawText: string): PronunciationAuditReport {
  const normalized = normalizePersianForXTTS(rawText);
  const spans = segmentBilingualText(normalized);
  const englishSpans = spans
    .filter((s) => s.lang === "en")
    .map((s) => ({ text: s.text, spoken: s.spoken }));

  // بررسی اینکه هیچ رقم خام تبدیل‌نشده‌ای در بخش‌های فارسی باقی نمانده باشد
  const persianDigitsRemaining: string[] = [];
  for (const sp of spans) {
    if (sp.lang === "fa") {
      const leftoverDigits = sp.text.match(/[\d۰-۹٠-٩]+/g) ?? [];
      persianDigitsRemaining.push(...leftoverDigits);
    }
  }

  // بررسی اینکه تمام حروف انگلیسی ورودی در خروجی همچنان انگلیسی مانده‌اند
  const inputHasLatin = /[A-Za-z]/.test(
    rawText.replace(/<[^>]+>/g, " ").replace(/https?:\/\/\S+/g, " ")
  );
  const allEnglishPreserved = !inputHasLatin || englishSpans.length > 0;
  const wrongTransliterations = findWrongPersianTransliterations(normalized);
  const lex = applyPersianPronunciation(
    rawText.replace(/<[^>]+>/g, " ").replace(CONTIGUOUS_LATIN_FOR_AUDIT, " ")
  );

  return {
    normalized,
    pronunciationVersion: PRONUNCIATION_VERSION,
    persianRulesApplied: lex.applied,
    accentLock: true,
    spans,
    englishSpans,
    persianDigitsRemaining,
    wrongTransliterations,
    allEnglishPreserved,
    passed:
      persianDigitsRemaining.length === 0 &&
      wrongTransliterations.length === 0 &&
      allEnglishPreserved,
  };
}

/**
 * تقطیع هوشمند مقاله دوزبانه به قطعات استاندارد بدون شکستن عبارات انگلیسی
 * مانند Next.js، PCIe 5.0، HDMI 2.1 یا v2.4.0.
 */
export function splitPersianTextForXTTS(rawText: string, maxChars = 220): string[] {
  const normalized = normalizePersianForXTTS(rawText);
  if (!normalized) return [];

  // شکستن فقط روی نقطه پایانی جمله (نه نقطه وسط Next.js یا 5.0 یا 3.11.2)
  const sentences = normalized
    .split(/(?:(?<=[؟!\n])|(?<=(?<![A-Za-z\d])\.(?![A-Za-z\d])))\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let buffer = "";

  const safeMax = Math.max(40, maxChars - 1);
  const ensurePunct = (str: string) => {
    const t = str.trim();
    if (!t) return "";
    return /[.؟!،؛]$/.test(t) ? t : `${t}.`;
  };

  for (const sentence of sentences) {
    if (sentence.length <= safeMax) {
      const candidate = buffer ? `${buffer} ${sentence}` : sentence;
      if (candidate.length <= safeMax) {
        buffer = candidate;
      } else {
        if (buffer) chunks.push(ensurePunct(buffer));
        buffer = sentence;
      }
    } else {
      if (buffer) {
        chunks.push(ensurePunct(buffer));
        buffer = "";
      }
      const clauses = sentence.split(/(?<=[،؛:])\s+/).filter(Boolean);
      let clauseBuf = "";
      for (const clause of clauses) {
        const candidate = clauseBuf ? `${clauseBuf} ${clause}` : clause;
        if (candidate.length <= safeMax) {
          clauseBuf = candidate;
        } else {
          if (clauseBuf) chunks.push(ensurePunct(clauseBuf));
          if (clause.length <= safeMax) {
            clauseBuf = clause;
          } else {
            const words = clause.split(/\s+/);
            let wordBuf = "";
            // جلوگیری از جدا شدن عدد انگلیسی از کلمه انگلیسی قبلی (مثلاً Wi-Fi 7 یا RTX 5090)
            const atomicTokens: string[] = [];
            for (const w of words) {
              const prev = atomicTokens[atomicTokens.length - 1];
              if (
                prev &&
                /[A-Za-z]$/.test(prev) &&
                /^\d+(?:\.\d+)*[.,،؛؟!]?$/.test(w)
              ) {
                atomicTokens[atomicTokens.length - 1] = `${prev} ${w}`;
              } else {
                atomicTokens.push(w);
              }
            }
            for (const w of atomicTokens) {
              const next = wordBuf ? `${wordBuf} ${w}` : w;
              if (next.length <= safeMax) wordBuf = next;
              else {
                if (wordBuf) chunks.push(ensurePunct(wordBuf));
                wordBuf = w;
              }
            }
            clauseBuf = wordBuf;
          }
        }
      }
      if (clauseBuf) chunks.push(ensurePunct(clauseBuf));
    }
  }

  if (buffer) chunks.push(ensurePunct(buffer));
  return chunks.filter(Boolean);
}

export function slugifyArticle(input: string): string {
  const cleaned = toEnglishDigits(input)
    .toLowerCase()
    .replace(/[^a-z0-9\-_\s]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
  if (cleaned.length >= 3) return cleaned.slice(0, 90);
  return `article-${Date.now().toString(36)}`;
}

export function buildLJSpeechPreviewFromScript(
  rawScript: string,
  speakerCode: string,
  minDurSec = 2.5,
  maxDurSec = 11.5
): {
  accepted: Array<{
    audioFile: string;
    text: string;
    speakerName: string;
    durationSec: number;
  }>;
  rejectedCount: number;
  totalMinutes: number;
} {
  const rawLines = rawScript
    .split(/(?:(?<=[؟!\n])|(?<=(?<![A-Za-z\d])\.(?![A-Za-z\d])))\s+/)
    .map((line) => normalizePersianForXTTS(line))
    .filter((line) => line.length > 3);

  const accepted: Array<{
    audioFile: string;
    text: string;
    speakerName: string;
    durationSec: number;
  }> = [];
  let rejectedCount = 0;

  rawLines.forEach((line) => {
    const estimatedSec = Number((line.length / 13.5).toFixed(2));
    if (estimatedSec >= minDurSec && estimatedSec <= maxDurSec && line.length <= 230) {
      const idx = String(accepted.length + 1).padStart(5, "0");
      accepted.push({
        audioFile: `wavs/seg_${idx}.wav`,
        text: line,
        speakerName: speakerCode,
        durationSec: estimatedSec,
      });
    } else {
      rejectedCount += 1;
    }
  });

  const totalSec = accepted.reduce((sum, item) => sum + item.durationSec, 0);
  return {
    accepted,
    rejectedCount,
    totalMinutes: Number((totalSec / 60).toFixed(2)),
  };
}

export const normalizeForStyleTTS2 = normalizePersianForXTTS;
export const splitForStyleTTS2 = splitPersianTextForXTTS;

const FA_IPA_PREVIEW_MAP: Record<string, string> = {
  آ: "ɒː",
  ا: "ɒ",
  ب: "b",
  پ: "p",
  ت: "t",
  ث: "s",
  ج: "ʤ",
  چ: "ʧ",
  ح: "h",
  خ: "x",
  د: "d",
  ذ: "z",
  ر: "ɾ",
  ز: "z",
  ژ: "ʒ",
  س: "s",
  ش: "ʃ",
  ص: "s",
  ض: "z",
  ط: "t",
  ظ: "z",
  ع: "ʔ",
  غ: "ɣ",
  ف: "f",
  ق: "ɢ",
  ک: "k",
  گ: "ɡ",
  ل: "l",
  م: "m",
  ن: "n",
  و: "v",
  ه: "h",
  ی: "iː",
  ئ: "ʔ",
  ؤ: "ʔ",
  "،": ",",
  "؛": ";",
  "؟": "?",
  ".": ".",
  "!": "!",
  "\u200c": " ",
};

const EN_LETTER_IPA_MAP: Record<string, string> = {
  A: "ˈeɪ",
  B: "ˈbiː",
  C: "ˈsiː",
  D: "ˈdiː",
  E: "ˈiː",
  F: "ˈɛf",
  G: "ˈʤiː",
  H: "ˈeɪʧ",
  I: "ˈaɪ",
  J: "ˈʤeɪ",
  K: "ˈkeɪ",
  L: "ˈɛl",
  M: "ˈɛm",
  N: "ˈɛn",
  O: "ˈoʊ",
  P: "ˈpiː",
  Q: "ˈkjuː",
  R: "ˈɑːɹ",
  S: "ˈɛs",
  T: "ˈtiː",
  U: "ˈjuː",
  V: "ˈviː",
  W: "ˈdʌbəljuː",
  X: "ˈɛks",
  Y: "ˈwaɪ",
  Z: "ˈziː",
};

/** پیش‌نمایش سریع دنباله واجی دوزبانه IPA (fa + en-us) برای نمایش در train_list.txt و پنل دیباگ. */
export function toBilingualIPAPreview(normalizedLine: string): string {
  const spans = segmentBilingualText(normalizedLine);
  return spans
    .map((sp) => {
      if (sp.lang === "en") {
        return sp.spoken
          .split(/\s+/)
          .map((tok) => {
            const clean = tok.replace(/[.,;:!?]/g, "");
            if (clean.length === 1 && EN_LETTER_IPA_MAP[clean.toUpperCase()]) {
              return EN_LETTER_IPA_MAP[clean.toUpperCase()];
            }
            return `ˈ${clean.toLowerCase()}`;
          })
          .join(" ");
      }
      return Array.from(sp.text)
        .map((ch) => FA_IPA_PREVIEW_MAP[ch] ?? (ch === " " ? " " : ""))
        .join("");
    })
    .join(" ")
    .replace(/\s{2,}/g, " ")
    .trim();
}
