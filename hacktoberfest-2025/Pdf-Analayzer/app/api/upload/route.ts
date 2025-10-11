import { getEmbedding } from "@/lib/embedding";
import {
  addChunksToMemory,
  clearMemoryChunks,
} from "@/lib/store";
import extractChunksFromPDF from "@/lib/pdf";
import { Buffer } from "buffer";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    // Get file
    const formData = await request.formData();
    const file = formData.get("File") as File;

    // Check file
    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    // Reset old memory
    clearMemoryChunks();

    // Save file
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const tempDir = path.join("/tmp", "temp");
    const filePath = path.join(tempDir, "file.pdf");
    await mkdir(tempDir, { recursive: true });
    await writeFile(filePath, buffer);

    // Extract chunks
    const buff = Buffer.from(await file.arrayBuffer());
    const chunks = await extractChunksFromPDF(buff);
    for (const chunk of chunks) {
      const embedding = await getEmbedding(chunk.text);
      if (!embedding || embedding.length === 0) {
        continue;
      }
      // Add to memory
      addChunksToMemory({ id: chunk.id, content: chunk.text, embedding });
    }


    // Return
    return NextResponse.json({ message: "File uploaded & embedded!" },{ status: 200 });
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to process PDF file: Error is ${err}` },
      { status: 500 }
    );
  }
}
