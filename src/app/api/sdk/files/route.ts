import fs from "node:fs";
import { NextResponse } from "next/server";
import {
  PROJECT_TREE,
  SDK_FILE_MANIFEST,
  resolveSdkDiskPath,
} from "@/lib/sdk-manifest";

export async function GET() {
  const files = SDK_FILE_MANIFEST.map((item) => {
    const abs = resolveSdkDiskPath(item);
    const content = fs.existsSync(abs)
      ? fs.readFileSync(abs, "utf-8")
      : "# File not found";
    const lines = content.split("\n").length;
    return {
      id: item.id,
      relativePath: item.relativePath,
      diskPath: item.relativePath,
      category: item.category,
      title: item.title,
      description: item.description,
      language: item.language,
      lines,
      sizeBytes: Buffer.byteLength(content, "utf-8"),
      content,
    };
  });

  return NextResponse.json({
    engine: "StyleTTS 2",
    version: "3.0.0",
    projectTree: PROJECT_TREE,
    files,
  });
}
