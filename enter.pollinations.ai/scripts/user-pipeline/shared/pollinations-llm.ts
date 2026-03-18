import { existsSync, readFileSync } from "node:fs";

export function loadEnterApiToken(): string {
    const tokenFile = ".testingtokens";
    if (!existsSync(tokenFile)) {
        console.error("❌ No .testingtokens file found");
        console.error(
            "💡 Create one with: echo 'ENTER_API_TOKEN_REMOTE=pk_...' > .testingtokens",
        );
        process.exit(1);
    }

    const content = readFileSync(tokenFile, "utf-8");
    const match = content.match(/ENTER_API_TOKEN_REMOTE=([^\n]+)/);
    if (!match) {
        console.error("❌ No ENTER_API_TOKEN_REMOTE found in .testingtokens");
        process.exit(1);
    }

    return match[1].trim();
}

export async function callPollinationsChatModel(
    prompt: string,
    apiKey: string,
    modelName: string,
    temperature = 0.1,
): Promise<string> {
    const response = await fetch(
        "https://gen.pollinations.ai/v1/chat/completions",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: modelName,
                messages: [{ role: "user", content: prompt }],
                temperature,
            }),
        },
    );

    if (!response.ok) {
        throw new Error(`LLM API returned HTTP ${response.status}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "";
}
