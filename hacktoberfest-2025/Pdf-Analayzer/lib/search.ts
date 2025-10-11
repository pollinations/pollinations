import { getMemoryChunks } from "./store";

// Cosine similarity helper
function cosineSimilarity(a: number[], b: number[]) {
  const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  return dot / (magA * magB);
}

export async function searchRelevantChunks(questionEmbedding: number[]) {
  const memoryChunks = await  getMemoryChunks();

  if (memoryChunks.length === 0) return [];

  return memoryChunks
    .map((chunk) => ({
      ...chunk,
      score: chunk.embedding
        ? cosineSimilarity(questionEmbedding, chunk.embedding)
        : 0,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3); // Return top 3 chunks
}
