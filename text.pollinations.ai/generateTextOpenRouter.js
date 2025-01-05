import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

export async function generateTextOpenRouter(messages, options) {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
            "HTTP-Referer": "https://pollinations.ai",
            "X-Title": "Pollinations.AI",
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: "deepseek/deepseek-chat",
            messages,
            response_format: options.jsonMode ? { type: 'json_object' } : undefined,
            max_tokens: 4096,
            temperature: options.temperature,
            top_p: options.top_p,
            seed: options.seed,
            tools: options.tools,
            tool_choice: options.tool_choice
        })
    });

    if (!response.ok) {
        throw new Error(`OpenRouter API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const responseMessage = data.choices[0].message;
    return responseMessage;
}
