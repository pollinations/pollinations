import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { readFile } from "fs/promises";
export async function GET() {
  
  // generate folder and file
  const tempDir = path.join("/tmp", "temp");
  const filePath = path.join(tempDir, "file.pdf");

  // check if file exists
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ message: "File not found" }, { status: 404 });
  }

  // read file
  const file = await readFile(filePath);

  // return file
  return new NextResponse(file.buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": "inline; filename=file.pdf",
    },
  });
}
