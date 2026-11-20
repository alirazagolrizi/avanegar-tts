/**
 * موتور حفظ و خوانش بومی انگلیسی (Native Bilingual FA + EN Code-Switching).
 *
 * قانون طلایی (طبق درخواست کاربر در دیباگ مدل B):
 *  - حروف، سرواژه‌ها، برندها، مدل‌ها و واژه‌های انگلیسی هرگز به فارسی تبدیل نمی‌شوند!
 *  - تمام عبارات انگلیسی (از تک‌حرف‌هایی مانند A و B تا RTX 5090، GPT-4o، iPhone 17 Pro،
 *    NVMe، LTPO، Galaxy S24 FE، Wi-Fi 7، USB-C، IPv6، FP8، 5G، 120Hz، 6000mAh، 32GB،
 *    PyTorch، Hugging Face، framework، inference و...) دقیقاً به صورت انگلیسی حفظ می‌شوند
 *    و در موتور سنتز دوزبانه با تلفظ اصیل و طبیعی انگلیسی (en-US Neural / XTTS lang="en")
 *    خوانده می‌شوند.
 */

import { normalizeDigitsToAscii } from "@/lib/persian-numbers";

export interface BilingualSpan {
  lang: "fa" | "en";
  /** متن اصلی حفظ‌شده (انگلیسی بدون تبدیل به فارسی، فارسی استانداردشده) */
  text: string;
  /** فرم بهینه ارسال به موتور صوتی همان زبان (برای en کاملاً انگلیسی و واضح) */
  spoken: string;
}

/**
 * سرواژه‌ها و اصطلاحات فنی انگلیسی که در موتور TTS انگلیسی باید با تفکیک دقیق حروف
 * یا تلفظ استاندارد انگلیسی خوانده شوند (خروجی ۱۰۰٪ انگلیسی است، نه فارسی!).
 */
export const ENGLISH_SPEECH_HINTS: Record<string, string> = {
  nvme: "N V M E",
  pcie: "P C I E",
  ltpo: "L T P O",
  vram: "V RAM",
  dram: "D RAM",
  sram: "S RAM",
  npu: "N P U",
  tpu: "T P U",
  gpu: "G P U",
  cpu: "C P U",
  apus: "A P Us",
  gpus: "G P Us",
  cpus: "C P Us",
  npus: "N P Us",
  ssd: "S S D",
  ssds: "S S Ds",
  hdd: "H D D",
  api: "A P I",
  apis: "A P Is",
  sdk: "S D K",
  cli: "C L I",
  gui: "G U I",
  llm: "L L M",
  llms: "L L Ms",
  tts: "T T S",
  asr: "A S R",
  ocr: "O C R",
  wer: "W E R",
  cer: "C E R",
  rtf: "R T F",
  lufs: "L U F S",
  vad: "V A D",
  styletts2: "Style T T S 2",
  styletts: "Style T T S",
  "pl-bert": "P L BERT",
  plbert: "P L BERT",
  wavlm: "Wave L M",
  istftnet: "I S T F T Net",
  istft: "I S T F T",
  "hifi-gan": "Hi-Fi GAN",
  hifigan: "Hi-Fi GAN",
  slm: "S L M",
  jdc: "J D C",
  ipa: "I P A",
  edm: "E D M",
  cfg: "C F G",
  ood: "O O D",
  bpe: "B P E",
  rtx: "R T X",
  gtx: "G T X",
  ddr4: "D D R 4",
  ddr5: "D D R 5",
  lpddr5: "L P D D R 5",
  lpddr5x: "L P D D R 5 X",
  gddr6: "G D D R 6",
  gddr7: "G D D R 7",
  fp4: "F P 4",
  fp8: "F P 8",
  fp16: "F P 16",
  fp32: "F P 32",
  bf16: "B F 16",
  int4: "int 4",
  int8: "int 8",
  ipv4: "I P v 4",
  ipv6: "I P v 6",
  "usb-c": "U S B C",
  "usb-a": "U S B A",
  usb: "U S B",
  hdmi: "H D M I",
  nfc: "N F C",
  gps: "G P S",
  lte: "L T E",
  "5g": "5 G",
  "4g": "4 G",
  "6g": "6 G",
  b2b: "B to B",
  b2c: "B to C",
  p2p: "P to P",
  e2e: "end to end",
  fe: "F E",
  se: "S E",
  ti: "T I",
  tsmc: "T S M C",
  sql: "S Q L",
  nosql: "No S Q L",
  "next.js": "Next J S",
  nextjs: "Next J S",
  "node.js": "Node J S",
  nodejs: "Node J S",
  "vue.js": "Vue J S",
  "c++": "C plus plus",
  "c#": "C sharp",
  "gpt-4o": "G P T 4 O",
  "gpt-4": "G P T 4",
  "gpt-5": "G P T 5",
  gpt: "G P T",
  chatgpt: "Chat G P T",
  openai: "Open A I",
  pytorch: "PyTorch",
  tensorrt: "Tensor R T",
  cudnn: "C U D N N",
  macos: "mac O S",
  ios: "i O S",
  ipados: "iPad O S",
  watchos: "watch O S",
  "wi-fi": "Wi-Fi",
  wifi: "Wi-Fi",
  rgb: "R G B",
  hdr: "H D R",
  "hdr10+": "H D R 10 plus",
  hdr10: "H D R 10",
  qhd: "Q H D",
  uhd: "U H D",
  fhd: "F H D",
  cms: "C M S",
  cors: "CORS",
  jwt: "J W T",
  http: "H T T P",
  https: "H T T P S",
  html: "H T M L",
  css: "C S S",
  dom: "DOM",
  srgb: "S R G B",
  dci: "D C I",
  csot: "C S O T",
  frc: "F R C",
  ldac: "L DAC",
  ssc: "S S C",
  aac: "A A C",
  sbc: "S B C",
  ufs: "U F S",
  soc: "S O C",
  ois: "O I S",
  eis: "E I S",
  pdaf: "P D A F",
  pwm: "P W M",
  esim: "E SIM",
  ai: "A I",
  ui: "U I",
  ux: "U X",
  os: "O S",
};

const ENGLISH_UNIT_EXPANSIONS: Record<string, string> = {
  ghz: "gigahertz",
  mhz: "megahertz",
  khz: "kilohertz",
  hz: "hertz",
  mah: "milliamp hours",
  wh: "watt hours",
  kwh: "kilowatt hours",
  kw: "kilowatts",
  mw: "megawatts",
  tb: "terabytes",
  gb: "gigabytes",
  mb: "megabytes",
  kb: "kilobytes",
  gbps: "gigabits per second",
  mbps: "megabits per second",
  kbps: "kilobits per second",
  gbit: "gigabits",
  nm: "nanometers",
  mm: "millimeters",
  cm: "centimeters",
  km: "kilometers",
  kg: "kilograms",
  ms: "milliseconds",
  fps: "frames per second",
  mp: "megapixels",
  db: "decibels",
  lufs: "L U F S",
  w: "watts",
};

/**
 * فهرست آوانگاری‌های فارسی اشتباهِ نسخه قبلی که نباید در خروجی جدید تولید شوند
 * (برای شناسایی خودکار متون یا صداهای قدیمی در پنل دیباگ مدل B).
 */
const FORBIDDEN_TRANSLITERATIONS = [
  "آر‌تی‌اکس",
  "جی‌پی‌یو",
  "سی‌پی‌یو",
  "ان‌پی‌یو",
  "ان‌وی‌ام‌ای",
  "اِل‌تی‌پی‌او",
  "اف‌پی هشت",
  "اف‌پی شانزده",
  "چهار‌او",
  "اوپن‌ای‌آی",
  "یواس‌بی سی",
  "مک‌اواس",
  "آی‌اواس",
  "تنسور‌آر‌تی",
  "پای‌تورچ",
  "وی‌رَم",
  "ایکس‌تی‌تی‌اس",
  "هوگِگینگ",
  "آی‌پی نسخه شش",
];

// الگوی واحدهای انگلیسی متصل یا با فاصله بعد از عدد (مثلاً 120Hz، 24000 Hz، 6000mAh، 32 GB، -16 LUFS، 2.4 GHz)
const UNIT_NAMES_PATTERN =
  "GHz|MHz|kHz|Hz|mAh|kWh|Wh|kW|MW|TB|GB|MB|KB|Gbps|Mbps|Kbps|Gbit|LUFS|fps|nm|mm|cm|km|kg|ms|dB|MP|W";

/**
 * الگوی جامع استخراج یک عبارت یکپارچه انگلیسی (شامل حروف، کلمات، سرواژه‌ها،
 * اعداد و نسخه‌های وابسته به انگلیسی مانند RTX 5090، GPT-4o، iPhone 17 Pro،
 * Galaxy S24 FE، Wi-Fi 7، 5G، 120Hz، 24000 Hz، 32GB، -16 LUFS، v2.4.0، C++، C#، A، B).
 */
const SINGLE_EN_ATOM = String.raw`(?:[-−+]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?[ \t]*(?:${UNIT_NAMES_PATTERN})(?![A-Za-z])|(?:\d+(?:\.\d+)?)(?:[GKM]B|[456]?G|K|p|x|X)(?![A-Za-z0-9])|[A-Za-z][A-Za-z0-9'’+#\-_./]*[A-Za-z0-9+#]|[A-Za-z])`;

// اتصال توکن‌های انگلیسی هم‌خط (بدون عبور از سطر جدید \n!) مانند iPhone 17 Pro، RTX 5090، Wi-Fi 7، Galaxy S25 FE
const CONTIGUOUS_EN_SPAN_RE = new RegExp(
  String.raw`${SINGLE_EN_ATOM}(?:(?:[ \t]+(?:&[ \t]+)?|[ \t]*[/][ \t]*)(?:${SINGLE_EN_ATOM}|(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)*(?:[+#xX])?(?!(?:[ \t]*(?:[%٪$€£]|ملیون|میلیون|میلیارد|تریلیون|هزار|تومان|ریال|دلار|یورو|درصد|بار|سال|ماه|روز|ساعت|دقیقه|ثانیه|نفر|عدد|واحد|نیت|متر|میلی‌متر|میلی‌ثانیه|کیلوگرم|گرم|بیتی|بیت|هرتز|وات|آمپر))|[A-Za-z\u0621-\u064A\u067E\u0686\u0698\u06A9\u06AF\u06CC%٪])))*`,
  "g"
);

export function hasLatin(text: string): boolean {
  return /[A-Za-z]/.test(text);
}

export function extractLatinTokens(text: string): string[] {
  if (!text) return [];
  const normalized = normalizeInlineEnglishDigits(text);
  const matches = normalized.match(CONTIGUOUS_EN_SPAN_RE) ?? [];
  return matches.map((m) => m.trim()).filter(Boolean);
}

/**
 * اگر عدد فارسی/عربی مستقیماً کنار حروف انگلیسی نوشته شده باشد (مثلاً «RTX ۵۰۹۰» یا «۱۲۰Hz» یا «Wi-Fi ۷»)،
 * رقم آن را به ASCII استاندارد تبدیل می‌کند تا یکپارچه با بخش انگلیسی خوانده شود.
 */
export function normalizeInlineEnglishDigits(text: string): string {
  if (!text) return "";
  let out = text;
  // ارقام چسبیده یا با یک فاصله بعد از توکن انگلیسی (RTX ۵۰۹۰، GPT-۴o، Wi-Fi ۷)
  out = out.replace(
    /([A-Za-z][-+]?\s*)([۰-۹٠-٩]+(?:[.,٫][۰-۹٠-٩]+)*)/g,
    (_m, pre: string, digs: string) =>
      `${pre}${normalizeDigitsToAscii(digs).replace(/٫/g, ".")}`
  );
  // ارقام قبل از واحد یا حرف انگلیسی (۱۲۰Hz، ۶۰۰۰mAh، ۵G، ۳۲ GB)
  out = out.replace(
    /([-−+]?[۰-۹٠-٩]+(?:[.,٫][۰-۹٠-٩]+)*)(\s*[A-Za-z])/g,
    (_m, digs: string, post: string) =>
      `${normalizeDigitsToAscii(digs).replace(/٫/g, ".")}${post}`
  );
  return out;
}

/**
 * بهینه‌سازی رشته انگلیسی برای تلفظ ۱۰۰٪ دقیق و طبیعی توسط گوینده بومی انگلیسی (en-US).
 * نکته کلیدی: خروجی همیشه ۱۰۰٪ انگلیسی است و هیچ حرف فارسی در آن تولید نمی‌شود!
 */
export function formatEnglishForSpeech(rawEnglish: string): string {
  const trimmed = normalizeDigitsToAscii(rawEnglish)
    .replace(/[()[\]«»"]/g, " ")
    .replace(/^[.,;:!?\s]+|[.,;:!?\s]+$/g, "")
    .replace(/\bbit\+/gi, "bit plus")
    .trim();
  if (!trimmed) return "";

  // ۱. تک‌حرف انگلیسی (مثل A در «مدل A» یا B در «مدل B» یا C در «پورت C»)
  if (/^[A-Za-z]$/.test(trimmed)) {
    return `${trimmed.toUpperCase()}.`;
  }

  let spoken = trimmed;

  // ۲. جایگزینی دقیق عبارات چندبخشی یا خاص (C++، C#، HDR10+، Next.js، USB-C، GPT-4o، B2B)
  const specialKeys = Object.keys(ENGLISH_SPEECH_HINTS)
    .filter((k) => /[.\-+#0-9]/.test(k))
    .sort((a, b) => b.length - a.length);

  for (const key of specialKeys) {
    const esc = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(?<![A-Za-z0-9])${esc}(?![A-Za-z0-9+#])`, "gi");
    spoken = spoken.replace(re, ENGLISH_SPEECH_HINTS[key]);
  }

  // ۳. پیشوند نسخه: v2.4.0 یا V3.1 → version 2 point 4 point 0
  spoken = spoken.replace(
    /(?<![A-Za-z])[vV](\d+(?:\.\d+)+)\b/g,
    (_m, ver: string) => `version ${ver.split(".").join(" point ")}`
  );

  // ۴. نسخه‌های چندنقطه‌ای (3.11.2 → 3 point 11 point 2)
  spoken = spoken.replace(/\b(\d+(?:\.\d+){2,})\b/g, (m) =>
    m.split(".").join(" point ")
  );

  // ۵. اعداد منفی متصل به واحد انگلیسی (-16 LUFS → minus 16 L U F S، -42 dB → minus 42 decibels)
  spoken = spoken.replace(
    /(?<=^|\s)[-−](\d+(?:\.\d+)?)\s*(?=[A-Za-z])/g,
    "minus $1 "
  );

  // ۶. عدد + واحد انگلیسی (120Hz → 120 hertz، 6000mAh → 6000 milliamp hours، 32GB → 32 gigabytes، 1.5x → 1.5 times)
  spoken = spoken.replace(
    new RegExp(
      String.raw`\b(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?\s*(${UNIT_NAMES_PATTERN})\b`,
      "g"
    ),
    (_m, whole: string, frac: string | undefined, unit: string) => {
      const unitSpoken = ENGLISH_UNIT_EXPANSIONS[unit.toLowerCase()] ?? unit;
      const numStr = frac !== undefined ? `${whole}.${frac}` : whole;
      return `${numStr} ${unitSpoken}`;
    }
  );
  spoken = spoken.replace(
    /\b(\d+(?:\.\d+)?)[xX]\b/g,
    (_m, num: string) => `${num} times`
  );

  // ۷. کدهای مدل حرف+عدد (S24 → S 24، M4 → M 4، L4 → L 4، A10 → A 10، H100 → H 100، B200 → B 200، 4o → 4 O)
  spoken = spoken.replace(
    /\b([A-Z]{1,2})(\d{1,4})([A-Za-z])?\b/g,
    (_m, letters: string, digs: string, tail?: string) => {
      const spacedLetters = letters.split("").join(" ");
      const spacedTail = tail ? ` ${tail.toUpperCase()}` : "";
      return `${spacedLetters} ${digs}${spacedTail}`;
    }
  );
  spoken = spoken.replace(
    /\b(\d+)([oO])\b/g,
    (_m, digs: string) => `${digs} O`
  );

  // ۸. سرواژه‌ها و واژگان فنی تک‌کلمه‌ای (NVMe، LTPO، VRAM، GPU، NPU، PCIe، macOS، iOS)
  spoken = spoken.replace(/\b[A-Za-z][A-Za-z0-9]*\b/g, (word) => {
    const hint = ENGLISH_SPEECH_HINTS[word.toLowerCase()];
    if (hint) return hint;
    // تک‌حرف بزرگ در میان عبارت (مثل S 24 یا USB C) بدون تغییر می‌ماند
    return word;
  });

  // قفل لهجه فارسی: بازنویسی آوانگاری سازگار با خوانش فارسی (حروف لاتین حفظ می‌شوند)
  const { persianAccentEnglish } = require("@/lib/persian-pronunciation") as {
    persianAccentEnglish: (input: string) => string;
  };
  return persianAccentEnglish(spoken.replace(/\s{2,}/g, " ").trim());
}

/**
 * محافظت از تمام بخش‌های انگلیسی با توکن موقت تا نرمال‌ساز اعداد و حروف فارسی
 * هیچ تغییری روی حروف، اعداد و علائم انگلیسی اعمال نکند.
 */
export function maskEnglishSpans(rawText: string): {
  masked: string;
  spans: string[];
} {
  const prepared = normalizeInlineEnglishDigits(rawText);
  const spans: string[] = [];

  const masked = prepared.replace(CONTIGUOUS_EN_SPAN_RE, (match) => {
    // جدا کردن علائم پایانی جمله از انتهای عبارت انگلیسی (مثلاً "NVIDIA." → span="NVIDIA" + ".")
    const trailMatch = /([.,;:!?]+)$/.exec(match);
    let core = match;
    let trailing = "";
    if (trailMatch) {
      core = match.slice(0, -trailMatch[1].length);
      trailing = trailMatch[1];
    }
    const cleanCore = core.trim();
    if (!cleanCore || !/[A-Za-z]/.test(cleanCore)) {
      return match;
    }
    const idx = spans.length;
    spans.push(cleanCore);
    // استفاده از نویسه بدون رقم در ناحیه خصوصی یونیکد تا مبدل اعداد هرگز آن را تغییر ندهد
    const marker = String.fromCharCode(0xe100 + idx);
    return ` \uE000${marker}\uE001${trailing} `;
  });

  return { masked, spans };
}

/**
 * بازگرداندن دقیق عبارات انگلیسی به متن پس از نرمال‌سازی بخش‌های فارسی.
 */
export function unmaskEnglishSpans(maskedText: string, spans: string[]): string {
  return maskedText.replace(/\uE000([\uE100-\uF7FF])\uE001/g, (_m, ch: string) => {
    return spans[ch.charCodeAt(0) - 0xe100] ?? "";
  });
}

/**
 * تقطیع دقیق دوزبانه یک متن نرمال‌شده به زنجیره‌ای از سگمنت‌های فارسی (fa) و انگلیسی (en)
 * برای خوانش دوگانه (فارسی با گوینده فارسی، انگلیسی با گوینده بومی انگلیسی).
 */
export function segmentBilingualText(text: string): BilingualSpan[] {
  if (!text || !text.trim()) return [];
  const prepared = normalizeInlineEnglishDigits(text);
  const result: BilingualSpan[] = [];
  let lastIndex = 0;

  CONTIGUOUS_EN_SPAN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = CONTIGUOUS_EN_SPAN_RE.exec(prepared)) !== null) {
    const fullMatch = match[0];
    const trailMatch = /([.,;:!?]+)$/.exec(fullMatch);
    const core = trailMatch
      ? fullMatch.slice(0, -trailMatch[1].length)
      : fullMatch;
    const coreEnd = match.index + core.length;

    if (!core.trim() || !/[A-Za-z]/.test(core)) {
      continue;
    }

    if (match.index > lastIndex) {
      const faPart = prepared.slice(lastIndex, match.index).trim();
      if (faPart && /[\u0600-\u06FF\d]/.test(faPart)) {
        result.push({ lang: "fa", text: faPart, spoken: faPart });
      } else if (faPart && result.length > 0) {
        // الصاق علائم نگارشی (مثل «،» یا «.») به سگمنت قبلی برای حفظ مکث طبیعی
        result[result.length - 1].text += faPart;
        result[result.length - 1].spoken += faPart;
      }
    }

    const enClean = core.trim();
    result.push({
      lang: "en",
      text: enClean,
      spoken: formatEnglishForSpeech(enClean),
    });

    lastIndex = coreEnd;
  }

  if (lastIndex < prepared.length) {
    const tail = prepared.slice(lastIndex).trim();
    if (tail && /[\u0600-\u06FF\d]/.test(tail)) {
      result.push({ lang: "fa", text: tail, spoken: tail });
    } else if (tail && result.length > 0) {
      result[result.length - 1].text += tail;
      result[result.length - 1].spoken += tail;
    }
  }

  return result;
}

/**
 * شناسایی آوانگاری‌های فارسی اشتباهِ اصطلاحات انگلیسی (باگ نسخه قبلی).
 */
export function findWrongPersianTransliterations(text: string): string[] {
  if (!text) return [];
  return FORBIDDEN_TRANSLITERATIONS.filter((bad) => text.includes(bad));
}

export interface PronunciationCase {
  input: string;
  expectedEnglish: string;
  expectedSpokenContains: string;
}

/** مجموعه آزمون حفظ و تلفظ بومی انگلیسی برای مدل جدید StyleTTS 2 (مدل C) و مدل‌های B و A. */
export const PRONUNCIATION_TEST_SUITE: PronunciationCase[] = [
  { input: "StyleTTS 2", expectedEnglish: "StyleTTS 2", expectedSpokenContains: "Style T T S 2" },
  { input: "PL-BERT", expectedEnglish: "PL-BERT", expectedSpokenContains: "P L BERT" },
  { input: "WavLM", expectedEnglish: "WavLM", expectedSpokenContains: "Wave L M" },
  { input: "RTX 5090", expectedEnglish: "RTX 5090", expectedSpokenContains: "R T X 5090" },
  { input: "GPT-4o", expectedEnglish: "GPT-4o", expectedSpokenContains: "G P T 4 O" },
  { input: "iPhone 17 Pro", expectedEnglish: "iPhone 17 Pro", expectedSpokenContains: "iPhone 17 Pro" },
  { input: "Galaxy A57", expectedEnglish: "Galaxy A57", expectedSpokenContains: "Galaxy A 57" },
  { input: "NVMe", expectedEnglish: "NVMe", expectedSpokenContains: "N V M E" },
  { input: "LTPO", expectedEnglish: "LTPO", expectedSpokenContains: "L T P O" },
  { input: "USB-C", expectedEnglish: "USB-C", expectedSpokenContains: "U S B C" },
  { input: "120Hz", expectedEnglish: "120Hz", expectedSpokenContains: "120 hertz" },
  { input: "Model C", expectedEnglish: "Model C", expectedSpokenContains: "Model C" },
];

export interface PronunciationResult {
  input: string;
  preservedText: string;
  spokenEnglish: string;
  convertedToPersian: boolean;
  passed: boolean;
}

/** ارزیابی اینکه تمام عبارات انگلیسی بدون تبدیل به فارسی حفظ شده و فرم تلفظ انگلیسی دقیق دارند. */
export function evaluatePronunciation(text: string): PronunciationResult[] {
  const spans = segmentBilingualText(text).filter((s) => s.lang === "en");
  return spans.map((sp) => {
    const convertedToPersian = /[\u0600-\u06FF]/.test(sp.text) || /[\u0600-\u06FF]/.test(sp.spoken);
    return {
      input: sp.text,
      preservedText: sp.text,
      spokenEnglish: sp.spoken,
      convertedToPersian,
      passed: !convertedToPersian && /[A-Za-z]/.test(sp.spoken),
    };
  });
}
