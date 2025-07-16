import { OpenAI } from "openai";
import dotenv from "dotenv";
import { imageGenerationPrompt } from "./pollinationsPrompt.js";
import debug from "debug";

dotenv.config();

const openai = new OpenAI({
    baseURL: "http://localhost:8000/v1",
    apiKey: process.env.OPENAI_API_KEY,
});

const log = debug("pollinations:optillm");

export default async function generateTextOptiLLM(
    messages,
    { jsonMode = false, seed = null, temperature = null } = {},
) {
    if (!hasSystemMessage(messages)) {
        const prompt = `You are a helpful assistant. If you are asked to run code, just generate it in python and return the code. It will be run for you.\n\n`;
        const systemContent = jsonMode
            ? prompt + "Respond in simple json format"
            : prompt + imageGenerationPrompt();
        messages = [{ role: "system", content: systemContent }, ...messages];
    }

    log("calling openai with messages %O", messages);

    const completion = await openai.chat.completions.create({
        model: "cot_reflection-readurls&memory&executecode-gpt-4o-mini",
        messages,
        seed,
        response_format: jsonMode ? { type: "json_object" } : undefined,
        max_tokens: 1024,
    });

    return completion;
}

function hasSystemMessage(messages) {
    return messages.some((message) => message.role === "system");
}
