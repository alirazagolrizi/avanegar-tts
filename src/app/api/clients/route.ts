import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { publisherClients } from "@/db/schema";
import { ensureSeeded } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    await ensureSeeded();
    const body = await request.json();
    const name = String(body.name ?? "").trim();
    const domain = String(body.domain ?? "")
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/.*$/, "");
    const gpuSpec =
      String(body.gpuSpec ?? "").trim() || "NVIDIA L4 24GB (CUDA 12.1)";
    const accentColor = /^#[0-9a-fA-F]{6}$/.test(String(body.accentColor ?? ""))
      ? String(body.accentColor)
      : "#0f766e";

    if (name.length < 2 || domain.length < 4 || !domain.includes(".")) {
      return NextResponse.json(
        { error: "نام رسانه و دامنه معتبر (مانند zoomit.ir) الزامی است." },
        { status: 400 }
      );
    }

    const [existing] = await db
      .select()
      .from(publisherClients)
      .where(eq(publisherClients.domain, domain));
    if (existing) {
      return NextResponse.json(
        { error: "این دامنه قبلاً در فهرست مشتریان ثبت شده است." },
        { status: 409 }
      );
    }

    const rawSecret = `avn_live_${crypto.randomBytes(18).toString("hex")}`;
    const apiKeyPrefix = rawSecret.slice(0, 15);
    const apiKeyHash = `sha256:${crypto
      .createHash("sha256")
      .update(rawSecret)
      .digest("hex")
      .slice(0, 32)}`;

    const [created] = await db
      .insert(publisherClients)
      .values({
        name,
        domain,
        apiKeyPrefix,
        apiKeyHash,
        gpuSpec,
        bundleVersion: "styletts2-fa-en-enterprise-3.0",
        accentColor,
        status: "active",
      })
      .returning();

    return NextResponse.json(
      {
        message: "لایسنس استقرار لوکال و کلید API مشتری صادر شد.",
        client: created,
        plainApiKey: rawSecret,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Create client error:", error);
    return NextResponse.json(
      { error: "خطا در صدور لایسنس مشتری جدید." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!id) {
      return NextResponse.json({ error: "شناسه مشتری نامعتبر است." }, { status: 400 });
    }
    await db.delete(publisherClients).where(eq(publisherClients.id, id));
    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("Delete client error:", error);
    return NextResponse.json({ error: "خطا در حذف لایسنس مشتری." }, { status: 500 });
  }
}
