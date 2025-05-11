import fetch from "node-fetch";

// Model list from your data
const models = [
  "openai",
  "openai-large",
  "openai-reasoning",
  "qwen-coder",
  "llama",
  "mistral",
  "mistral-roblox",
  "roblox-rp",
  "unity",
  "midijourney",
  "rtist",
  "searchgpt",
  "evil",
  "deepseek",
  "deepseek-r1",
  "deepseek-reasoner",
  "deepseek-r1-llama",
  "qwen-reasoning",
  "llamaguard",
  "phi",
  "phi-mini",
  "gemini",
  "gemini-thinking",
  "hormoz",
  "hypnosis-tracy",
  "sur",
  "sur-mistral",
  "openai-audio",
];

// Table headers
console.log("| Model | Status | Response |");
console.log("|-------|--------|----------|");

// Test each model
async function testModels() {
  for (const model of models) {
    try {
      const response = await fetch(
        `http://localhost:16385/sayhi?model=${model}`,
      );
      const text = await response.text();
      const status = response.ok ? "✅" : "❌";
      console.log(
        `| ${model} | ${status} | ${text.substring(0, 30)}${text.length > 30 ? "..." : ""} |`,
      );
    } catch (error) {
      console.log(`| ${model} | ❌ | ${error.message} |`);
    }
    // Small delay to avoid overwhelming the server
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

testModels();
