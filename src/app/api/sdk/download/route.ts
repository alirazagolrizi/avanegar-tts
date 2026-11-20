import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { NextResponse } from "next/server";
import { SDK_FILE_MANIFEST, resolveSdkDiskPath } from "@/lib/sdk-manifest";

export async function GET() {
  try {
    const zip = new JSZip();

    for (const item of SDK_FILE_MANIFEST) {
      const abs = resolveSdkDiskPath(item);
      if (fs.existsSync(abs)) {
        const archivePath = item.relativePath.replace(
          /^python-engine\//,
          "avanegar-styletts2-onpremise/"
        );
        zip.file(archivePath, fs.readFileSync(abs));
      }
    }

    const extraEngineFiles: Array<[string, string]> = [
      ["README.md", "avanegar-styletts2-onpremise/README.md"],
      [".env.example", "avanegar-styletts2-onpremise/.env.example"],
      ["app/__init__.py", "avanegar-styletts2-onpremise/app/__init__.py"],
    ];
    for (const [subPath, zipRel] of extraEngineFiles) {
      const abs = path.join(process.cwd(), "python-engine", subPath);
      if (fs.existsSync(abs)) {
        zip.file(zipRel, fs.readFileSync(abs));
      }
    }

    const buffer = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition":
          'attachment; filename="avanegar-styletts2-onpremise.zip"',
        "Content-Length": String(buffer.length),
      },
    });
  } catch (error) {
    console.error("SDK ZIP download error:", error);
    return NextResponse.json(
      { error: "خطا در ساخت بسته قابل دانلود پروژه پایتون StyleTTS 2." },
      { status: 500 }
    );
  }
}
