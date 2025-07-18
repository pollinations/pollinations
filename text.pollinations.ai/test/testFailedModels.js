import fetch from "node-fetch";

// List of models that failed in the previous test
const failedModels = [
    "openai-reasoning",
    "mistral-roblox",
    "deepseek",
    "deepseek-reasoner",
    "qwen-reasoning",
    "llamaguard",
    "phi-mini",
    "llama-scaleway",
];

// Table headers
console.log("| Model | Status | Response |");
console.log("|-------|--------|----------|");

// Test each failed model against production URL
async function testFailedModels() {
    for (const model of failedModels) {
        try {
            const response = await fetch(
                `https://text.pollinations.ai/sayhi?model=${model}`,
            );
            const text = await response.text();
            const status = response.ok ? "✅" : "❌";
            console.log(
                `| ${model} | ${status} | ${text.substring(0, 50)}${text.length > 50 ? "..." : ""} |`,
            );
        } catch (error) {
            console.log(`| ${model} | ❌ | ${error.message} |`);
        }
        // Small delay to avoid overwhelming the server
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
}

testFailedModels();
