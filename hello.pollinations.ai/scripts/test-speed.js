import { HELLO_PAGE } from "../src/theme/copy/hello";

const API_KEY =
    process.env.VITE_POLLINATIONS_API_KEY ||
    "plln_pk_JYeNIYDfEi0dwDT7kPAXujYWyYT2TaKm";
const API_URL =
    "https://enter.pollinations.ai/api/generate/v1/chat/completions";

const WRITING_GUIDELINES = `You are a copywriter for pollinations.ai, an open-source generative AI platform.

CORE MISSION:
Transform the provided text while preserving its exact meaning and purpose. Your job is to adapt the style, tone, and length based on the modifiers below - NOT to change what the text says.

WRITING PRINCIPLES:
- Maintain the original message and intent
- Be clear, direct, and authentic
- Use active voice and concrete language
- Avoid marketing fluff or corporate speak
- Match the tone to the theme context (if provided)

OUTPUT RULES:
- Plain text only - no markdown, bullets, or formatting
- No explanations, meta-commentary, or extra content
- Just return the transformed text, nothing else
- If translating, translate naturally while keeping the tone

ADAPTATION STRATEGY:
1. Read all modifiers below carefully
2. Apply them in combination (theme + brevity + language + responsive)
3. Ensure the result feels cohesive and natural
4. Always preserve the core meaning`;

async function generateText(prompt, id) {
    const start = Date.now();
    console.log(`[${id}] Starting request...`);

    try {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${API_KEY}`,
            },
            body: JSON.stringify({
                messages: [{ role: "user", content: prompt }],
                model: "openai-fast",
                seed: 42,
            }),
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`HTTP ${response.status}: ${text}`);
        }

        const data = await response.json();
        const duration = (Date.now() - start) / 1000;
        console.log(`[${id}] Finished in ${duration.toFixed(2)}s`);
        return data;
    } catch (error) {
        const duration = (Date.now() - start) / 1000;
        console.log(
            `[${id}] Failed in ${duration.toFixed(2)}s: ${error.message}`,
        );
        throw error;
    }
}

async function runTest() {
    console.log("Starting speed test with openai-fast...");
    console.log("API Key:", API_KEY.substring(0, 10) + "...");

    const pageJson = JSON.stringify(HELLO_PAGE, null, 2);
    const prompt = `${WRITING_GUIDELINES}

Theme Context: Rewrite this to match the theme vibe: "Tropical sunset beach". Keep the core meaning but adjust tone, energy, and word choice to match this theme.
Keep it very short (5-15 words maximum). Mobile users need quick, scannable content.

IMPORTANT INSTRUCTIONS:
1. For each field that has a "transforms" array, read the transforms and apply them
2. If "brevity:N" is in transforms, limit that field to N words maximum
3. Transform only the "text" values - keep all other properties unchanged
4. For fields WITHOUT a "transforms" array, return the text UNCHANGED
5. Return the EXACT same JSON structure with only transformed "text" values

Input JSON:
${pageJson}

Generate the transformed JSON now (return ONLY valid JSON, no explanations):`;

    // Run 5 parallel requests
    const promises = [1, 2, 3, 4, 5].map((id) => generateText(prompt, id));

    const start = Date.now();
    await Promise.all(promises);
    const total = (Date.now() - start) / 1000;

    console.log(`Total time for 5 parallel requests: ${total.toFixed(2)}s`);
}

runTest().catch(console.error);
