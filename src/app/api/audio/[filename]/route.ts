import fs from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { AUDIO_STORAGE_DIR, SPEAKERS_STORAGE_DIR } from "@/lib/audio-engine";
import { ensureSeeded } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ filename: string }> }
) {
  await ensureSeeded();
  const { filename } = await context.params;
  const safeName = path.basename(decodeURIComponent(filename));
  const scope = new URL(request.url).searchParams.get("scope");

  const baseDir = scope === "speaker" ? SPEAKERS_STORAGE_DIR : AUDIO_STORAGE_DIR;
  const filePath = path.join(baseDir, safeName);

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "فایل صوتی یافت نشد." }, { status: 404 });
  }

  const stat = fs.statSync(filePath);
  const total = stat.size;
  const rangeHeader = request.headers.get("range");

  const ext = path.extname(safeName).toLowerCase();
  const mime =
    ext === ".mp3"
      ? "audio/mpeg"
      : ext === ".m4a"
        ? "audio/mp4"
        : ext === ".ogg"
          ? "audio/ogg"
          : "audio/wav";

  const commonHeaders: Record<string, string> = {
    "Content-Type": mime,
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=3600",
    "Access-Control-Allow-Origin": "*",
  };

  if (rangeHeader) {
    const match = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
    if (match) {
      const start = match[1] ? parseInt(match[1], 10) : 0;
      const end = match[2] ? Math.min(total - 1, parseInt(match[2], 10)) : total - 1;
      if (start <= end && start < total) {
        const chunkLength = end - start + 1;
        const fd = fs.openSync(filePath, "r");
        const chunk = Buffer.allocUnsafe(chunkLength);
        fs.readSync(fd, chunk, 0, chunkLength, start);
        fs.closeSync(fd);

        return new NextResponse(chunk, {
          status: 206,
          headers: {
            ...commonHeaders,
            "Content-Range": `bytes ${start}-${end}/${total}`,
            "Content-Length": String(chunkLength),
          },
        });
      }
    }
  }

  const fullBuf = fs.readFileSync(filePath);
  return new NextResponse(fullBuf, {
    status: 200,
    headers: {
      ...commonHeaders,
      "Content-Length": String(total),
    },
  });
}
