import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const model = genAI.getGenerativeModel({ model: "embedding-001" });

export async function getEmbedding(text: string): Promise<number[]> {
  try {
    const result = await model.embedContent(text);
    return result.embedding.values; // Gemini's embedding array
  } catch (err) {
    console.error("❌ Gemini embedding error:", err);
    return [];
  }
}
