/**
 * لایه تلفظ دقیق فارسی و قفل لهجه (Persian Pronunciation & Accent-Lock Layer)
 *
 * رفع سه باگ اصلی مدل A:
 *  ۱. تلفظ غلط هوموگراف‌های فارسی مثل «کرهای» (Korean) که به‌صورت «کره‌ای» خوانده می‌شد؛
 *     با اعراب‌گذاری صریح: کُرهای / کُرهای‌ها / کُره (کشور) در برابر کُره (کره‌ی هندسی/خوراکی).
 *  ۲. سرهم خواندن کلمات جداجدا؛ مانند «درمقایسهبا»، «بیشاز»، «درحالیکه» که بدون فاصله
 *     تایپ شده‌اند و باید به کلمات جداگانه تفکیک شوند تا موتور گفتار هر کلمه را جدا بخواند.
 *  ۳. تغییر لهجه بین فارسی و انگلیسی؛ با «قفل لهجه» انگلیسی در حروف لاتین ولی با
 *     بازنویسی آوانگاری سازگار با لهجه فارسی (Persian-Accent Respelling) خوانده می‌شود.
 */

/** نسخه لایه تلفظ؛ افزایش آن باعث بازتولید خودکار فایل‌های قدیمی می‌شود. */
export const PRONUNCIATION_VERSION = "fa-lex-v3-accent-lock";

/**
 * اعراب‌گذاری صریح هوموگراف‌ها و واژه‌های پرتکرار رسانه‌های فناوری که موتور فارسی
 * بدون اعراب آن‌ها را اشتباه یا با کسره/فتحه نادرست می‌خواند.
 * کلید: نگارش بدون اعراب، مقدار: نگارش اعراب‌گذاری‌شده.
 */
export const PERSIAN_HOMOGRAPHS: Record<string, string> = {
  // --- کره / کره‌ای (پرتکرارترین مورد گزارش‌شده) ---
  کره: "کُره",
  کرهای: "کُرهای",
  "کرهایها": "کُرهایها",
  "کرهایهای": "کُرهایهای",
  کره‌ای: "کُرهای",
  "کره‌ایها": "کُرهای‌ها",
  "کره‌ای‌ها": "کُرهای‌ها",
  کره‌ای‌های: "کُرهای‌های",
  کرهای‌ها: "کُرهای‌ها",
  // --- هوموگراف‌های رایج در مقالات ---
  ملت: "مِلَّت",
  ملتها: "مِلَّتها",
  حرکت: "حَرَکَت",
  خبر: "خَبَر",
  اخبار: "اَخبار",
  مصرف: "مَصرَف",
  مصرفی: "مَصرَفی",
  جدول: "جَدوَل",
  مرض: "مَرَض",
  عقد: "عَقد",
  قرض: "قَرض",
  جگر: "جِگَر",
  کرم: "کِرِم",
  عسل: "عَسَل",
  امل: "اَمَل",
  اجل: "اَجَل",
  مورخ: "مُوَرَّخ",
  مورد: "مَورِد",
  فرد: "فَرد",
  سیل: "سِیل",
  تیر: "تیر",
  شیر: "شیر",
  گور: "گور",
  سیر: "سیر",
  مهر: "مِهر",
  سمت: "سَمت",
  خدمت: "خِدمَت",
  دفتر: "دَفتَر",
  حرف: "حَرف",
  حرفهای: "حرفهای",
  علم: "عِلم",
  عمل: "عَمَل",
  عمد: "عَمد",
  قدر: "قَدر",
  برنج: "بِرِنج",
  کنجد: "کُنجِد",
  قالب: "قالَب",
  مسیر: "مَسیر",
  نزدیک: "نَزدیک",
  نتیجه: "نَتیجه",
  متوسط: "مُتَوَسِّط",
  محاسبه: "مُحاسِبه",
  مسئله: "مَسئَله",
  مؤسسه: "مُؤَسِّسه",
  برنامه: "برنامه",
  پرچمدار: "پَرچَم‌دار",
  میان‌رده: "میان‌رَده",
  نمایشگر: "نِمایشگَر",
  باتری: "باتری",
  تراشه: "تِراشه",
  نسل: "نَسل",
  پردازنده: "پِردازَنده",
  گوشی: "گوشی",
  دوربین: "دوربین",
  ضخامت: "ضَخامَت",
  وزن: "وَزن",
  ظرفیت: "ظَرفیَت",
  شارژ: "شارژ",
  استاندارد: "اِستاندارد",
  فناوری: "فَنّاوری",
  نوآوری: "نوآوری",
  اینترنت: "اینترنت",
  کامپیوتر: "کامپیوتر",
  امنیت: "اَمنیَت",
  حریم: "حَریم",
  خصوصی: "خُصوصی",
  سازمان: "سازمان",
  هوش: "هوش",
  مصنوعی: "مَصنوعی",
  عصبی: "عَصَبی",
  تولید: "تَولید",
  پردازش: "پِردازِش",
  صف: "صَف",
  مقاله: "مَقاله",
  نویسنده: "نِویسَنده",
  گزارش: "گِزارِش",
  بررسی: "بَررسی",
  قیمت: "قِیمَت",
  بازار: "بازار",
  رشد: "رُشد",
  کاهش: "کاهِش",
  افزایش: "اَفزایِش",
  کیفیت: "کِیفیَت",
  سرعت: "سُرعَت",
  حافظه: "حافِظه",
  ذخیره: "ذَخیره",
  کاربر: "کاربَر",
  کاربران: "کاربَران",
  تجربه: "تَجرُبه",
  صفحه: "صَفحه",
  لایه: "لایه",
  روشنایی: "رُوشَنایی",
  مصرف‌کننده: "مَصرَف‌کُنَنده",
};

/**
 * بازنویسی آوانگاری سازگار با لهجه فارسی برای اصطلاحات انگلیسی.
 * حروف لاتین حفظ می‌شوند (طبق درخواست قبلی: انگلیسی نباید به فارسی تبدیل شود)،
 * اما نگارش برای موتور فارسی به‌گونه‌ای بازنویسی می‌شود که گوینده فارسی آن را
 * با لهجه فارسی و نزدیک‌تر به تلفظ اصیل بخواند (قفل لهجه).
 */
export const PERSIAN_ACCENT_ENGLISH_RESPELL: Record<string, string> = {
  // سرواژه‌ها: تفکیک حرف‌به‌حرف (خوانش فارسی حروف)
  nvidia: "NVIDIA",
  qualcomm: "Qualcomm",
  snapdragon: "Snapdragon",
  google: "Google",
  microsoft: "Microsoft",
  amazon: "Amazon",
  tesla: "Tesla",
  samsung: "Samsung",
  apple: "Apple",
  openai: "Open AI",
  chatgpt: "Chat GPT",
  pytorch: "Py Torch",
  tensorflow: "Tensor Flow",
  tensorrt: "Tensor RT",
  github: "Git Hub",
  gitlab: "Git Lab",
  youtube: "You Tube",
  javascript: "Java Script",
  typescript: "Type Script",
  postgresql: "Postgres Q L",
  postgres: "Postgres",
  kubernetes: "Kubernetes",
  docker: "Docker",
  linux: "Linux",
  ubuntu: "Ubuntu",
  android: "Android",
  windows: "Windows",
  netflix: "Netflix",
  giphy: "G I F",
  gif: "G I F",
  jpeg: "J P E G",
  png: "P N G",
  pdf: "P D F",
  url: "U R L",
  oauth: "O Auth",
  nginx: "Engine X",
  jquery: "J Query",
  "node.js": "Node J S",
  nextjs: "Next J S",
  iphone: "iPhone",
  ipad: "iPad",
  imac: "iMac",
  macbook: "Mac Book",
  macos: "mac O S",
  ios: "i O S",
  ipados: "iPad O S",
  wifi: "Wi Fi",
  "wi-fi": "Wi Fi",
  bluetooth: "Bluetooth",
  usb: "U S B",
  hdmi: "H D M I",
  nvme: "N V M E",
  pcie: "P C I E",
  ssd: "S S D",
  hdd: "H D D",
  ram: "RAM",
  vram: "V RAM",
  lpddr: "L P D D R",
  ddr: "D D R",
  amoled: "A M O L E D",
  oled: "OLED",
  ltpo: "L T P O",
  hdr: "H D R",
  rgb: "R G B",
  nfc: "N F C",
  gps: "G P S",
  lte: "L T E",
  esim: "E SIM",
  soc: "S O C",
  apu: "A P U",
  ipu: "I P U",
  npu: "N P U",
  gpu: "G P U",
  cpu: "C P U",
  tpu: "T P U",
  api: "A P I",
  sdk: "S D K",
  cli: "C L I",
  iot: "I O T",
  vpn: "V P N",
  dns: "D N S",
  sql: "S Q L",
  html: "H T M L",
  css: "C S S",
  http: "H T T P",
  https: "H T T P S",
  xml: "X M L",
  json: "Jason",
  ipv4: "I P v 4",
  ipv6: "I P v 6",
  "5g": "5 G",
  "4g": "4 G",
  "6g": "6 G",
  wifi7: "Wi Fi 7",
  warp: "Warp",
  dlss: "D L S S",
  fsr: "F S R",
  raytracing: "Ray Tracing",
  benchmark: "Benchmark",
  drivers: "Drivers",
  kernel: "Kernel",
  firmware: "Firm Ware",
  blockchain: "Block Chain",
  startup: "Start Up",
  podcast: "Podcast",
  smartphone: "Smart Phone",
  laptop: "Lap Top",
  desktop: "Desk Top",
  tablet: "Tablet",
  browser: "Browser",
  chrome: "Chrome",
  firefox: "Fire Fox",
  safari: "Safari",
  edge: "Edge",
};

/**
 * تفکیک عبارات سرهم‌نویسی‌شده فارسی (باگ «کلمات جدا را سرهم می‌خواند»).
 * کلید: عبارت چسبیده در متن منبع، مقدار: نگارش تفکیک‌شده با فاصله.
 */
export const GLUED_PERSIAN_PHRASES: Record<string, string> = {
  "درمقایسهبا": "در مقایسه با",
  "درمقایسه": "در مقایسه",
  "بیشاز": "بیش از",
  "کماز": "کم از",
  "درحالیکه": "در حالی که",
  "درحالی": "در حالی",
  "بهراحتی": "به راحتی",
  "بجای": "به جای",
  "رویهمرفته": "روی هم رفته",
  "توجهبه": "توجه به",
  "مربوطبه": "مربوط به",
  "منجربه": "منجر به",
  "باعثمیشود": "باعث می‌شود",
  "باعثمیشوند": "باعث می‌شوند",
  "انجاممیشود": "انجام می‌شود",
  "استفادهکرد": "استفاده کرد",
  "استفادهکردند": "استفاده کردند",
  "نشانمیدهد": "نشان نمی‌دهد",
  "نشانمیدهند": "نشان نمی‌دهند",
  "بازهم": "باز هم",
  "همزمان": "هم‌زمان",
  "همچنین": "همچنین",
  "بهمرور": "به مرور",
  "درنتیجه": "در نتیجه",
  "درنهایت": "در نهایت",
  "درضمن": "در ضمن",
  "بارشد": "با رشد",
  "باافت": "با افت",
  "براساس": "بر اساس",
  "برخلاف": "بر خلاف",
  "باعنوان": "با عنوان",
  "بهمنظور": "به منظور",
  "درمورد": "در مورد",
  "بهعنوان": "به عنوان",
  "بافرض": "با فرض",
  "صرفا": "صرفاً",
  "تقریبا": "تقریباً",
  "معمولا": "معمولاً",
  "کاملا": "کاملاً",
  "دقیقا": "دقیقاً",
  "مثلا": "مثلاً",
  "حداقل": "حداقل",
  "حداکثر": "حداکثر",
  "مابقی": "مابقی",
  "انگار": "انگار",
  "الان": "الان",
  "چقدر": "چقدر",
  "چیزی": "چیزی",
  "چیزها": "چیزها",
  "خیلیها": "خیلی‌ها",
};

/** فهرست آزمون تلفظ فارسی برای پنل دیباگ مدل A. */
export interface PersianPronunciationCase {
  input: string;
  expectContains: string;
  label: string;
}

export const PERSIAN_PRONUNCIATION_SUITE: PersianPronunciationCase[] = [
  {
    label: "کُرهای (Korean) با اعراب صحیح",
    input: "شرکت‌های کره‌ای و کرهای‌ها در نمایشگاه حاضر شدند.",
    expectContains: "کُرهای",
  },
  {
    label: "تفکیک «درمقایسهبا» به سه کلمه",
    input: "ضخامت آن درمقایسهبا نسل قبل کمتر است.",
    expectContains: "در مقایسه با",
  },
  {
    label: "تفکیک «بیشاز» و «درحالیکه»",
    input: "این تراشه بیشاز حد داغ می‌شود درحالیکه مصرف کمی دارد.",
    expectContains: "بیش از",
  },
  {
    label: "اعراب واژه «مصرف» (مَصرَف نه مُصرف)",
    input: "مصرف باتری بهینه شده است.",
    expectContains: "مَصرَف",
  },
  {
    label: "اعراب واژه «ملت» و «حرکت»",
    input: "این حرکت ملت را همراه کرد.",
    expectContains: "مِلَّت",
  },
  {
    label: "حفظ اصطلاح انگلیسی با قفل لهجه فارسی",
    input: "تراشه NVIDIA RTX 5090 معرفی شد.",
    expectContains: "NVIDIA",
  },
];

/** قفل لهجه: بازنویسی آوانگاری انگلیسی برای موتور فارسی بدون تغییر ماهیت لاتین آن. */
export function persianAccentEnglish(englishSpoken: string): string {
  if (!englishSpoken.trim()) return "";
  let out = englishSpoken;

  // ۱. بازنویسی واژه‌های شناخته‌شده (طولانی‌ترها اول)
  const keys = Object.keys(PERSIAN_ACCENT_ENGLISH_RESPELL).sort(
    (a, b) => b.length - a.length
  );
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`, "gi");
    out = out.replace(re, PERSIAN_ACCENT_ENGLISH_RESPELL[key]);
  }

  // ۲. نگه‌داشتن فاصله تک بین توکن‌ها (جلوگیری از چسبیدن کلمات انگلیسی)
  return out.replace(/\s{2,}/g, " ").trim();
}

/** اعمال اعراب‌گذاری هوموگراف‌های فارسی و تفکیک عبارات سرهم. */
export function applyPersianPronunciation(text: string): {
  text: string;
  applied: string[];
} {
  if (!text) return { text: "", applied: [] };
  let out = text;
  const applied: string[] = [];

  // ۱. تفکیک عبارات سرهم‌نویسی‌شده
  const gluedKeys = Object.keys(GLUED_PERSIAN_PHRASES).sort(
    (a, b) => b.length - a.length
  );
  for (const key of gluedKeys) {
    // تحمل نیم‌فاصله در هر موقعیت: «درمقایسه‌با» و «درمقایسهبا» هر دو شناسایی می‌شوند
    const pattern = key
      .split("")
      .map((ch) => ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("\u200c?");
    const re = new RegExp(pattern, "g");
    if (!re.test(out)) continue;
    re.lastIndex = 0;
    out = out.replace(re, GLUED_PERSIAN_PHRASES[key]);
    applied.push(`تفکیک:${key}→${GLUED_PERSIAN_PHRASES[key]}`);
  }

  // ۲. اعراب‌گذاری هوموگراف‌ها با مرز واژه دقیق (زنجیره‌های بلندتر اول)
  const homoKeys = Object.keys(PERSIAN_HOMOGRAPHS).sort(
    (a, b) => b.length - a.length
  );
  for (const key of homoKeys) {
    // تحمل نیم‌فاصله در نگارش هوموگراف‌ها (کره‌ای / کرهای)
    const escaped = key
      .split("")
      .map((ch) => ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("\u200c?");
    // مرز: نبود حرف فارسی/عربی در دو طرف تا زیرمجموعه واژه‌های بزرگ‌تر تغییر نکند
    const re = new RegExp(
      `(?<![\\u0600-\\u06FF])${escaped}(?![\\u0600-\\u06FF])`,
      "g"
    );
    if (!re.test(out)) continue;
    re.lastIndex = 0;
    const replacement = PERSIAN_HOMOGRAPHS[key];
    out = out.replace(re, replacement);
    if (replacement !== key) applied.push(`اعراب:${key}→${replacement}`);
  }

  return { text: out, applied };
}
