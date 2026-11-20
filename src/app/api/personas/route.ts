import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { speakers } from "@/db/schema";
import { ensureSeeded } from "@/lib/seed";
import {
  DEFAULT_PERSONA_ID,
  VOICE_PERSONAS,
  describePersonaEffects,
  getVoicePersona,
  isValidPersonaId,
} from "@/lib/voice-personas";

export const dynamic = "force-dynamic";

/** فهرست پرسوناهای صوتی لوکال و پارامترهای هر یک. */
export async function GET() {
  await ensureSeeded();
  const list = await db.select().from(speakers);
  return NextResponse.json({
    localOnly: true,
    engine: "StyleTTS 2 (local)",
    defaultPersona: DEFAULT_PERSONA_ID,
    personas: VOICE_PERSONAS.map((p) => ({
      ...p,
      effects: describePersonaEffects(p),
      assignedSpeakers: list
        .filter((s) => (s.voicePersona || DEFAULT_PERSONA_ID) === p.id)
        .map((s) => ({
          speakerCode: s.speakerCode,
          displayName: s.displayName,
        })),
    })),
  });
}

/** تغییر پرسونای صوتی یک گوینده (مثلاً مدل B → assistant-calm). */
export async function PATCH(request: NextRequest) {
  try {
    await ensureSeeded();
    const body = await request.json();
    const speakerCode = String(body.speakerCode ?? "").trim();
    const personaId = String(body.persona ?? "").trim();

    if (!speakerCode && !body.speakerId) {
      return NextResponse.json(
        { error: "شناسه گوینده ارسال نشده است." },
        { status: 400 }
      );
    }
    if (!isValidPersonaId(personaId)) {
      return NextResponse.json(
        {
          error: `پرسونای «${personaId}» معتبر نیست.`,
          available: VOICE_PERSONAS.map((p) => p.id),
        },
        { status: 400 }
      );
    }

    const [target] = body.speakerId
      ? await db
          .select()
          .from(speakers)
          .where(eq(speakers.id, Number(body.speakerId)))
      : await db
          .select()
          .from(speakers)
          .where(eq(speakers.speakerCode, speakerCode));

    if (!target) {
      return NextResponse.json({ error: "گوینده یافت نشد." }, { status: 404 });
    }

    const [updated] = await db
      .update(speakers)
      .set({ voicePersona: personaId })
      .where(eq(speakers.id, target.id))
      .returning();

    const persona = getVoicePersona(personaId);
    return NextResponse.json({
      message: `پرسونای صوتی «${updated.displayName}» به «${persona.labelFa}» تغییر کرد.`,
      speaker: updated,
      persona: {
        ...persona,
        effects: describePersonaEffects(persona),
      },
      note: "برای اعمال کامل روی فایل‌های موجود، دکمه تعمیر خودکار را در تب دیباگ اجرا کنید.",
    });
  } catch (error) {
    console.error("Persona update error:", error);
    return NextResponse.json(
      { error: "خطا در تغییر پرسونای صوتی." },
      { status: 500 }
    );
  }
}
