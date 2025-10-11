import { getEmbedding } from "@/lib/embedding";
import { searchRelevantChunks } from "@/lib/search";
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { messages } = body;

    // checking for messages
    if (!messages || messages.length === 0) {
      return new Response("No messages provided", { status: 400 });
    }

    // forming question 
    const question = messages
      .map((m: { content: string }) => m.content)
      .join("\n");


    // embedding question
    const questionEmbedding = await getEmbedding(question);
    if (questionEmbedding.length === 0) {
      return new Response("No question embedding found!", { status: 400 });
    }

    // searching for relevant chunks
    const topChunks = await searchRelevantChunks(questionEmbedding);
    if (topChunks.length === 0) {
      return new Response("No relevant context found!", { status: 400 });
    }

    // generating answer
    const context = topChunks.map((chunk) => chunk.content).join("\n\n");
    const prompt = `
    You are a helpful assistant.
    Use the following context to answer the question:
      
    Context:
    ${context}
      
    Question:
    ${question}
    `;

    // calling Gemini
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(prompt);

    // returning answer
    return new Response(result.response.text(), {
      headers: { "Content-Type": "text/plain" },
    });
  } catch (err) {
    // error handling
    return new Response(`Error processing question and erro is: ${err}`, { status: 500 });
  }
}
