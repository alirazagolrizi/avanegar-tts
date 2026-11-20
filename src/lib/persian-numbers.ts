/**
 * موتور دقیق تبدیل اعداد فارسی و عربی به حروف استاندارد گفتاری فارسی.
 *
 * باگ‌های رفع‌شده در نسخه دیباگ مدل B:
 *  ۱. اعشار دارای صفر ابتدایی: «3.05» → «سه ممیز پنج صدم» (قبلاً «سه ممیز پنج» = ۳.۵ خوانده می‌شد!)
 *     و «1.005» → «یک ممیز پنج هزارم» و «0.0025» → «صفر ممیز صفر صفر دو پنج».
 *  ۲. ممیز فارسی «٫» (U+066B): «۷٫۸» → «هفت ممیز هشت دهم»، «۰٫۷۵» → «صفر ممیز هفتاد و پنج صدم».
 *  ۳. اعداد منفی و مثبت: «-16» / «−۴۲» → «منفی شانزده» / «منفی چهل و دو»، «+15» → «مثبت پانزده».
 *  ۴. درصد پیشوندی و پسوندی: هم «٪۴۰»/«%32.5» و هم «۴۰٪»/«32.5%» → «چهل درصد» / «سی و دو ممیز پنج دهم درصد».
 *  ۵. ارز پیشوندی و پسوندی: هم «$1,299»/«€250»/«£80» و هم «500$» → «هزار و دویست و نود و نه دلار».
 *  ۶. جداکننده هزارگان ایمن: فقط گروه‌های دقیق ۳ رقمی با «,» یا «٬» ادغام می‌شوند؛
 *     فهرست فارسی «۱،۲،۳» هرگز به «صد و بیست و سه» تبدیل نمی‌شود و «یک، دو، سه» خوانده می‌شود.
 *  ۷. نسخه‌های چندنقطه‌ای: «16.4.2» → «شانزده نقطه چهار نقطه دو» (بدون شکستن وسط جمله).
 *  ۸. زمان («14:30» → «چهارده و سی دقیقه»)، کسر («1/2» → «یک دوم»)، بازه («10-30» → «ده تا سی»)،
 *     ضرب («4×64» → «چهار در شصت و چهار»)، اعداد ترتیبی («۳۰ام» → «سی‌ام»، «۱ام» → «اول»)
 *     و اعداد بزرگ تا کوادریلیون (بدون از دست رفتن دقت با پردازش رشته‌ای).
 */

const ONES = ["", "یک", "دو", "سه", "چهار", "پنج", "شش", "هفت", "هشت", "نه"];
const SINGLE_DIGITS = ["صفر", "یک", "دو", "سه", "چهار", "پنج", "شش", "هفت", "هشت", "نه"];
const TEENS = [
  "ده",
  "یازده",
  "دوازده",
  "سیزده",
  "چهارده",
  "پانزده",
  "شانزده",
  "هفده",
  "هجده",
  "نوزده",
];
const TENS = ["", "", "بیست", "سی", "چهل", "پنجاه", "شصت", "هفتاد", "هشتاد", "نود"];
const HUNDREDS = [
  "",
  "صد",
  "دویست",
  "سیصد",
  "چهارصد",
  "پانصد",
  "ششصد",
  "هفتصد",
  "هشتصد",
  "نهصد",
];
const SCALES = ["", "هزار", "میلیون", "میلیارد", "تریلیون", "کوادریلیون"];

const CURRENCY_WORDS: Record<string, string> = {
  $: "دلار",
  "€": "یورو",
  "£": "پوند",
};

const COMMON_FRACTIONS: Record<string, string> = {
  "1/2": "یک دوم",
  "1/3": "یک سوم",
  "2/3": "دو سوم",
  "1/4": "یک چهارم",
  "3/4": "سه چهارم",
  "1/5": "یک پنجم",
  "1/8": "یک هشتم",
  "1/10": "یک دهم",
};

export function normalizeDigitsToAscii(value: string): string {
  return value
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}

function threeDigitsToPersian(n: number): string {
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const rem = n % 100;
  if (h > 0) parts.push(HUNDREDS[h]);
  if (rem >= 10 && rem < 20) {
    parts.push(TEENS[rem - 10]);
  } else {
    const t = Math.floor(rem / 10);
    const o = rem % 10;
    if (t > 0) parts.push(TENS[t]);
    if (o > 0) parts.push(ONES[o]);
  }
  return parts.join(" و ");
}

/**
 * تبدیل رشته ارقام صحیح (با هر طول تا ۱۸ رقم) به حروف فارسی بدون خطای گرد شدن.
 */
export function digitsToPersianWords(rawDigits: string): string {
  const trimmed = normalizeDigitsToAscii(rawDigits).trim();
  if (!trimmed) return "";

  const isNegative = /^[-−]/.test(trimmed);
  const unsigned = trimmed.replace(/^[-−+]/, "").replace(/[,٬]/g, "");
  if (!/^\d+$/.test(unsigned)) return rawDigits;

  const stripped = unsigned.replace(/^0+/, "");
  if (!stripped) return "صفر";

  // اگر بیش از ۱۸ رقم باشد (مثلاً کد رهگیری)، رقم‌به‌رقم خوانده می‌شود
  if (stripped.length > SCALES.length * 3) {
    const spelled = stripped
      .split("")
      .map((ch) => SINGLE_DIGITS[Number(ch)])
      .join(" ");
    return isNegative ? `منفی ${spelled}` : spelled;
  }

  const groups: string[] = [];
  let cursor = stripped.length;
  let scaleIdx = 0;

  while (cursor > 0 && scaleIdx < SCALES.length) {
    const start = Math.max(0, cursor - 3);
    const chunk = Number(stripped.slice(start, cursor));
    if (chunk > 0) {
      const words = threeDigitsToPersian(chunk);
      const scale = SCALES[scaleIdx];
      if (chunk === 1 && scaleIdx === 1) {
        groups.unshift("هزار");
      } else {
        groups.unshift(scale ? `${words} ${scale}` : words);
      }
    }
    cursor = start;
    scaleIdx += 1;
  }

  const joined = groups.length > 0 ? groups.join(" و ") : "صفر";
  return isNegative ? `منفی ${joined}` : joined;
}

/**
 * تبدیل عدد صحیح یا اعشاری به حروف استاندارد فارسی.
 */
export function numberToPersianWords(num: number): string {
  if (!Number.isFinite(num)) return "";
  if (Object.is(num, -0) || num === 0) return "صفر";
  if (num < 0) return `منفی ${numberToPersianWords(Math.abs(num))}`;

  if (!Number.isInteger(num)) {
    const asStr = String(num);
    if (asStr.includes(".") && !asStr.includes("e")) {
      const [w, f] = asStr.split(".");
      return decimalToPersianWords(w, f, false);
    }
  }

  return digitsToPersianWords(String(Math.trunc(num)));
}

/**
 * تبدیل دقیق عدد اعشاری با حفظ کامل صفرهای بعد از ممیز و پسوند ارزش مکانی (دهم/صدم/هزارم).
 * مثال‌ها:
 *  - ("3", "5")    → «سه ممیز پنج دهم»
 *  - ("3", "05")   → «سه ممیز پنج صدم»
 *  - ("0", "75")   → «صفر ممیز هفتاد و پنج صدم»
 *  - ("1", "005")  → «یک ممیز پنج هزارم»
 *  - ("5", "0")    → «پنج ممیز صفر»
 *  - ("0", "0025") → «صفر ممیز صفر صفر دو پنج»
 */
export function decimalToPersianWords(
  wholeRaw: string,
  fracRaw: string,
  negative = false
): string {
  const cleanWhole = wholeRaw.replace(/^[-−+]/, "").replace(/[,٬]/g, "") || "0";
  const isNeg = negative || /^[-−]/.test(wholeRaw.trim());
  const wholeWords = digitsToPersianWords(cleanWhole);

  const asciiFrac = normalizeDigitsToAscii(fracRaw).replace(/\D/g, "");
  if (!asciiFrac) {
    return isNeg ? `منفی ${wholeWords}` : wholeWords;
  }

  // حذف صفرهای بی‌اثر انتهایی (مثلاً 2.50 → 2.5)، اما حفظ 5.0 → ممیز صفر
  const trimmedFrac = asciiFrac.replace(/0+$/, "");
  if (!trimmedFrac) {
    const base = `${wholeWords} ممیز صفر`;
    return isNeg ? `منفی ${base}` : base;
  }

  let fracWords: string;
  if (trimmedFrac.length === 1) {
    fracWords = `${digitsToPersianWords(trimmedFrac)} دهم`;
  } else if (trimmedFrac.length === 2) {
    fracWords = `${digitsToPersianWords(trimmedFrac)} صدم`;
  } else if (trimmedFrac.length === 3) {
    fracWords = `${digitsToPersianWords(trimmedFrac)} هزارم`;
  } else {
    // برای ۴ رقم اعشار و بیشتر، رقم‌به‌رقم با حفظ صفرهای ابتدایی
    fracWords = trimmedFrac
      .split("")
      .map((d) => SINGLE_DIGITS[Number(d)])
      .join(" ");
  }

  const full =
    isNeg && cleanWhole === "0"
      ? `منفی صفر ممیز ${fracWords}`
      : isNeg
        ? `منفی ${wholeWords} ممیز ${fracWords}`
        : `${wholeWords} ممیز ${fracWords}`;
  return full;
}

/**
 * تبدیل رشته عددی (صحیح، اعشاری، هزارگان‌دار یا علامت‌دار) به حروف فارسی.
 */
export function numericTokenToPersian(rawToken: string): string {
  const token = normalizeDigitsToAscii(rawToken).trim();
  if (!token) return "";
  const isNeg = /^[-−]/.test(token);
  const isPos = /^\+/.test(token);
  const unsigned = token.replace(/^[-−+]/, "").replace(/[,٬]/g, "");

  let words: string;
  if (/[.٫]/.test(unsigned)) {
    const [w, f = ""] = unsigned.split(/[.٫]/);
    words = decimalToPersianWords(w, f, false);
  } else {
    words = digitsToPersianWords(unsigned);
  }

  if (isNeg && words !== "صفر") return `منفی ${words}`;
  if (isPos) return `مثبت ${words}`;
  return words;
}

/**
 * تبدیل عدد ترتیبی فارسی (۱ام → اول، ۳وم → سوم، ۲۳ام → بیست و سوم، ۳۰ام → سی‌ام).
 */
export function ordinalToPersianWords(numStr: string): string {
  const clean = normalizeDigitsToAscii(numStr).replace(/[,٬\D]/g, "");
  if (!clean) return numStr;
  const n = Number(clean);
  if (n === 1) return "اول";
  const base = digitsToPersianWords(clean);
  if (base.endsWith("سه")) {
    return `${base.slice(0, -2)}سوم`;
  }
  if (base.endsWith("سی")) {
    return `${base}\u200cام`;
  }
  return `${base}م`;
}

/**
 * تبدیل نسخه چندنقطه‌ای یا IP در بافت فارسی (16.4.2 → شانزده نقطه چهار نقطه دو).
 */
export function versionToPersianWords(versionStr: string): string {
  const parts = normalizeDigitsToAscii(versionStr).split(".");
  return parts
    .filter((p) => p.length > 0)
    .map((p) => digitsToPersianWords(p))
    .join(" نقطه ");
}

/**
 * تبدیل زمان (14:30 → چهارده و سی دقیقه، 08:05 → هشت و پنج دقیقه، 09:00 → نه).
 */
export function timeToPersianWords(hh: string, mm: string, ss?: string): string {
  const h = Number(hh);
  const m = Number(mm);
  const s = ss !== undefined ? Number(ss) : 0;
  if (h > 23 || m > 59 || s > 59) {
    return `${digitsToPersianWords(hh)} و ${digitsToPersianWords(mm)}`;
  }
  const hWords = digitsToPersianWords(String(h));
  if (m === 0 && s === 0) return hWords;
  const mWords = digitsToPersianWords(String(m));
  if (s === 0) return `${hWords} و ${mWords} دقیقه`;
  const sWords = digitsToPersianWords(String(s));
  return `${hWords} و ${mWords} دقیقه و ${sWords} ثانیه`;
}

// الگوی عدد عمومی (دارای هزارگان ۳ رقمی اختیاری و بخش اعشار اختیاری)
const NUM_CORE = String.raw`(?:\d{1,3}(?:[,٬]\d{3})+|\d+)(?:[.٫]\d+)?`;
const SIGNED_NUM = String.raw`[-−+]?${NUM_CORE}`;

/**
 * بازنویسی کامل و دقیق تمام ساختارهای عددی در یک قطعه متن فارسی
 * (فقط روی بخش‌های فارسی اعمال می‌شود تا اعداد انگلیسی مثل RTX 5090 دست‌نخورده بمانند).
 */
export function expandPersianNumbers(persianText: string): string {
  if (!persianText) return "";

  let text = normalizeDigitsToAscii(persianText);

  // ۱. ارز پیشوندی: $1,299 یا €19.99 یا £80 → «هزار و دویست و نود و نه دلار»
  text = text.replace(
    new RegExp(String.raw`([$€£])\s*(${SIGNED_NUM})(?![\d.,٫])`, "g"),
    (_m, sym: string, num: string) =>
      ` ${numericTokenToPersian(num)} ${CURRENCY_WORDS[sym] ?? ""} `
  );

  // ۲. ارز پسوندی: 500$ یا 250€ یا 80£ → «پانصد دلار»
  text = text.replace(
    new RegExp(String.raw`(?<![\dA-Za-z])(${SIGNED_NUM})\s*([$€£])`, "g"),
    (_m, num: string, sym: string) =>
      ` ${numericTokenToPersian(num)} ${CURRENCY_WORDS[sym] ?? ""} `
  );

  // ۳. درصد پیشوندی (رایج در فارسی: ٪۴۰، ٪۳۲٫۵، %15، %-2.5) → «چهل درصد»
  text = text.replace(
    new RegExp(String.raw`[%٪]\s*(${SIGNED_NUM})(?![\d.,٫])`, "g"),
    (_m, num: string) => ` ${numericTokenToPersian(num)} درصد `
  );

  // ۴. درصد پسوندی: 40%، ۴۰٪، 32.5%، -5% → «چهل درصد»
  text = text.replace(
    new RegExp(String.raw`(?<![\dA-Za-z])(${SIGNED_NUM})\s*[%٪]`, "g"),
    (_m, num: string) => ` ${numericTokenToPersian(num)} درصد `
  );

  // ۵. زمان ساعت: 14:30 یا 08:05:20
  text = text.replace(
    /(?<!\d)([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?(?!\d)/g,
    (_m, hh: string, mm: string, ss?: string) =>
      ` ${timeToPersianWords(hh, mm, ss)} `
  );

  // ۶. نسخه‌ها و IP چندنقطه‌ای: 16.4.2 یا 192.168.1.1
  text = text.replace(
    /(?<!\d)\d+(?:\.\d+){2,}(?!\d)/g,
    (m) => ` ${versionToPersianWords(m)} `
  );

  // ۷. تاریخ اسلش‌دار: 1404/08/25 یا 2026/05/12
  text = text.replace(
    /(?<!\d)(\d{4})\/(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])(?!\d)/g,
    (_m, y: string, mo: string, d: string) =>
      ` ${digitsToPersianWords(y)}، ${digitsToPersianWords(String(Number(mo)))}، ${digitsToPersianWords(String(Number(d)))} `
  );

  // ۸. کسرهای متداول: 1/2، 3/4، 2/3
  text = text.replace(/(?<!\d)([1-9]\/(?:[2-9]|10))(?!\d)/g, (m) =>
    COMMON_FRACTIONS[m] ? ` ${COMMON_FRACTIONS[m]} ` : m
  );

  // ۹. ضرب دو عدد: 4×64 یا 1920×1080
  text = text.replace(
    new RegExp(String.raw`(${NUM_CORE})\s*×\s*(${NUM_CORE})`, "g"),
    (_m, a: string, b: string) =>
      ` ${numericTokenToPersian(a)} در ${numericTokenToPersian(b)} `
  );

  // ۱۰. ضریب برابری: 1.5× یا 2×
  text = text.replace(
    new RegExp(String.raw`(${NUM_CORE})\s*×`, "g"),
    (_m, a: string) => ` ${numericTokenToPersian(a)} برابر `
  );

  // ۱۱. اعداد ترتیبی فارسی: ۱ام، ۲وم، ۳وم، ۵م، ۳۰ام، ۲۳ام
  text = text.replace(
    /(?<!\d)(\d+)\u200c?(?:ام|وم|م)(?=\s|[،؛.؟!)\]]|$)/g,
    (_m, d: string) => ` ${ordinalToPersianWords(d)} `
  );

  // ۱۲. بازه‌های عددی: 10-30 یا ۶–۳۰ یا 2.5-11.5 (فقط بین دو عدد مثبت مستقل)
  text = text.replace(
    new RegExp(String.raw`(?<![\dA-Za-z\-−])(${NUM_CORE})\s*[–—-]\s*(${NUM_CORE})(?![\dA-Za-z])`, "g"),
    (_m, a: string, b: string) =>
      ` ${numericTokenToPersian(a)} تا ${numericTokenToPersian(b)} `
  );

  // ۱۳. اعداد اعشاری علامت‌دار و بدون علامت (با ممیز «.» یا «٫»)
  text = text.replace(
    /(?:(?<=^|[\s(«\[،؛:=])([-−+]))?(\d{1,3}(?:[,٬]\d{3})+|\d+)[.٫](\d+)(?![\d.٫])/g,
    (_m, sign: string | undefined, w: string, f: string) => {
      const token = `${sign ?? ""}${w}.${f}`;
      return ` ${numericTokenToPersian(token)} `;
    }
  );

  // ۱۴. اعداد صحیح علامت‌دار و بدون علامت (شامل هزارگان ۳ رقمی مثل 1,250,000؛ بدون ادغام ۱،۲،۳)
  text = text.replace(
    /(?:(?<=^|[\s(«\[،؛:=])([-−+]))?(\d{1,3}(?:[,٬]\d{3})+|\d+)(?!\d)/g,
    (_m, sign: string | undefined, d: string) =>
      ` ${numericTokenToPersian(`${sign ?? ""}${d}`)} `
  );

  // ۱۵. نمادهای باقی‌مانده منفرد
  text = text
    .replace(/%|٪/g, " درصد ")
    .replace(/\$/g, " دلار ")
    .replace(/€/g, " یورو ")
    .replace(/£/g, " پوند ");

  return text.replace(/[ \t]{2,}/g, " ").trim();
}
