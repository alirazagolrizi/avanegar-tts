/**
 * پرسونای صوتی لوکال (Local Voice Personas) — معادل TypeScript موتور پایتون.
 *
 * سبک خوانش از خود مدل جدا می‌شود: هر پرسونا مجموعه‌ای از پارامترهای آکوستیک،
 * پروزودی، کادنس (ریتم مکث) و منحنی آهنگ جمله است که روی همان موتور لوکال اعمال
 * می‌شود. هیچ سرویس، صدا یا وزن مدل شرکت ثالثی دانلود/کلون نمی‌شود و پردازش
 * ۱۰۰٪ روی سرور مشتری انجام می‌گیرد.
 */

export interface VoicePersona {
  id: string;
  labelFa: string;
  descriptionFa: string;
  speed: number;
  pitchHz: number;
  alpha: number;
  beta: number;
  diffusionSteps: number;
  embeddingScale: number;
  cadence: { inline: number; clause: number; sentence: number };
  contour: { declination: number; finalFall: number; questionRise: number };
  timbre: { warmth: number; presence: number; breath: number };
  loudness: { targetRms: number; compression: number };
  traits: string[];
  localOnly: true;
}

export const VOICE_PERSONAS: VoicePersona[] = [
  {
    id: "natural",
    labelFa: "طبیعی (خوانش انسانی)",
    descriptionFa:
      "خوانش خبری طبیعی با پروزودی متعادل؛ مناسب مقالات عمومی و مصاحبه‌ها.",
    speed: 1.0,
    pitchHz: 0,
    alpha: 0.3,
    beta: 0.7,
    diffusionSteps: 8,
    embeddingScale: 1.15,
    cadence: { inline: 55, clause: 135, sentence: 225 },
    contour: { declination: 0.06, finalFall: 0.985, questionRise: 1.02 },
    timbre: { warmth: 0, presence: 0, breath: 0 },
    loudness: { targetRms: 0.112, compression: 0 },
    traits: ["پروزودی متعادل", "لحن خبری", "سرعت استاندارد"],
    localOnly: true,
  },
  {
    id: "assistant-calm",
    labelFa: "دستیار هوش مصنوعی (آرام و گرم)",
    descriptionFa:
      "سبک دستیار صوتی مدرن: طنین گرم و خنثی، سرعت آرام و یکنواخت، مکث‌های کوتاه عبارتی، فرود نرم پایان جمله، وضوح بالای همخوان‌ها و تراز بلندی ثابت برای شنیدن طولانی. تمام پردازش لوکال است.",
    speed: 0.97,
    pitchHz: 0,
    alpha: 0.3,
    beta: 0.64,
    diffusionSteps: 10,
    embeddingScale: 1.08,
    cadence: { inline: 42, clause: 110, sentence: 265 },
    contour: { declination: 0.035, finalFall: 0.972, questionRise: 1.035 },
    timbre: { warmth: 0.17, presence: 0.11, breath: 0.035 },
    loudness: { targetRms: 0.104, compression: 0.22 },
    traits: [
      "گرمی باند پایین (۳۲۰Hz)",
      "حضور ۲.۴kHz برای وضوح کلمات",
      "کادنس آرام و یکنواخت",
      "فرود نرم پایان جمله",
      "فشرده‌سازی تراز صدا",
    ],
    localOnly: true,
  },
];

export const DEFAULT_PERSONA_ID = "natural";

export function getVoicePersona(id?: string | null): VoicePersona {
  const key = (id ?? DEFAULT_PERSONA_ID).trim().toLowerCase();
  return (
    VOICE_PERSONAS.find((p) => p.id === key) ??
    VOICE_PERSONAS.find((p) => p.id === DEFAULT_PERSONA_ID)!
  );
}

/** آفست زیر و بمی هر جمله بر اساس منحنی آهنگ پرسونا (در بازه ایمن ±۶Hz). */
export function sentenceContourOffset(
  persona: VoicePersona,
  sentenceIndex: number,
  totalSentences: number,
  isQuestion = false
): number {
  const total = Math.max(1, totalSentences);
  const progress =
    total > 1 ? Math.min(1, sentenceIndex / Math.max(1, total - 1)) : 0;
  let factor = 1 - persona.contour.declination * progress;
  if (sentenceIndex === total - 1) factor *= persona.contour.finalFall;
  if (isQuestion) factor *= persona.contour.questionRise;
  const offset = (factor - 1) * 120;
  return Math.max(-6, Math.min(6, Number(offset.toFixed(2))));
}

/** پیش‌نمایش خوانا از آنچه پرسونا روی صوت انجام می‌دهد (برای پنل). */
export function describePersonaEffects(persona: VoicePersona): string[] {
  return [
    `سرعت: ${persona.speed.toFixed(2)}× (آرام‌تر از پیش‌فرض ${
      persona.speed < 1 ? "بله" : "خیر"
    })`,
    `پروزودی (beta): ${persona.beta} • طنین (alpha): ${persona.alpha}`,
    `گام انتشار: ${persona.diffusionSteps} • هدایت PL-BERT: ${persona.embeddingScale}`,
    `کادنس مکث: عبارتی ${persona.cadence.inline}ms • ویرگول ${persona.cadence.clause}ms • پایان جمله ${persona.cadence.sentence}ms`,
    `گرمی ${persona.timbre.warmth} • حضور ${persona.timbre.presence} • تنفس ${persona.timbre.breath}`,
    `فشرده‌سازی تراز: ${persona.loudness.compression}`,
  ];
}

/** بررسی سازگاری پرسونای ذخیره‌شده با فهرست فعلی. */
export function isValidPersonaId(id?: string | null): boolean {
  if (!id) return false;
  return VOICE_PERSONAS.some((p) => p.id === id);
}
