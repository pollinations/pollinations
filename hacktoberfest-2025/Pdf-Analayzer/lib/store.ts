import fs from "fs/promises";
import path from "path";
import type MemoryStore from "@/types/MemoryStore";

// Use /tmp for writable storage in serverless environments
const storePath = path.join("/tmp", "memory.json");

export async function addChunksToMemory(chunks: MemoryStore) {
  const data = await getMemoryChunks();
  data.push(chunks);
  await fs.writeFile(storePath, JSON.stringify(data, null, 2));
}

export async function getMemoryChunks(): Promise<MemoryStore[]> {
  try {
    const json = await fs.readFile(storePath, "utf-8");
    return JSON.parse(json);
  } catch {
    return [];
  }
}

export async function clearMemoryChunks() {
  await fs.writeFile(storePath, "[]");
}
