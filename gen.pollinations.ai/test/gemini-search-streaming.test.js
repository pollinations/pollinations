import { describe, it, expect, beforeAll } from "vitest";
import fetch from "node-fetch";

const BASE_URL = process.env.TEST_BASE_URL || "https://gen.pollinations.ai";
const API_KEY = process.env.API_KEY || process.env.POLLINATIONS_API_KEY;

if (!API_KEY) {
    console.warn("⚠️  No API_KEY found in environment. Set API_KEY or POLLINATIONS_API_KEY to run tests.");
}

beforeAll(() => {
    console.log(`Testing gemini-search streaming against: ${BASE_URL}`);
    console.log(`Using API key: ${API_KEY ? "✓ Present" : "✗ Missing"}`);
});

/**
 * Helper to consume a streaming response and measure chunk timing
 * Returns: { chunks, timings, totalTime, firstChunkTime }
 */
async function consumeStream(response) {
    const chunks = [];
    const timings = [];
    const startTime = Date.now();
    let firstChunkTime = null;

    const reader = response.body;
    let buffer = "";

    for await (const chunk of reader) {
        const chunkTime = Date.now() - startTime;
        if (firstChunkTime === null) {
            firstChunkTime = chunkTime;
        }

        const chunkStr = chunk.toString();
        buffer += chunkStr;

        // Parse SSE events
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // Keep incomplete line in buffer

        for (const line of lines) {
            if (line.startsWith("data: ")) {
                const data = line.slice(6).trim();
                if (data && data !== "[DONE]") {
                    try {
                        const parsed = JSON.parse(data);
                        const content =
                            parsed.choices?.[0]?.delta?.content || "";
                        if (content) {
                            chunks.push(content);
                            timings.push(chunkTime);
                        }
                    } catch (e) {
                        // Skip malformed JSON
                    }
                }
            }
        }
    }

    const totalTime = Date.now() - startTime;

    return {
        chunks,
        timings,
        totalTime,
        firstChunkTime,
        chunkCount: chunks.length,
    };
}

describe("Gemini Search Streaming Issue", () => {
    // Test regular gemini streaming as baseline
    it(
        "should stream chunks progressively for regular gemini",
        async () => {
            const response = await fetch(`${BASE_URL}/v1/chat/completions`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${API_KEY}`,
                },
                body: JSON.stringify({
                    model: "gemini",
                    messages: [
                        {
                            role: "user",
                            content:
                                "Write a short 3 sentence story about a robot.",
                        },
                    ],
                    stream: true,
                    max_tokens: 100,
                }),
            });

            expect(response.status).toBe(200);
            expect(response.headers.get("content-type")).toContain(
                "text/event-stream",
            );

            const result = await consumeStream(response);

            console.log("\n=== GEMINI BASELINE ===");
            console.log(`Total chunks: ${result.chunkCount}`);
            console.log(
                `First chunk arrived at: ${result.firstChunkTime}ms`,
            );
            console.log(`Total time: ${result.totalTime}ms`);
            console.log(
                `Average chunk interval: ${result.totalTime / result.chunkCount}ms`,
            );

            // Assertions for healthy streaming
            expect(result.chunkCount).toBeGreaterThan(5); // Should have multiple chunks
            expect(result.firstChunkTime).toBeLessThan(5000); // First chunk within 5s
        },
        60000,
    );

    // Test gemini-search streaming (the broken one)
    it(
        "should stream chunks for gemini-search (testing reported issue)",
        async () => {
            const response = await fetch(`${BASE_URL}/v1/chat/completions`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${API_KEY}`,
                },
                body: JSON.stringify({
                    model: "gemini-search",
                    messages: [
                        {
                            role: "user",
                            content:
                                "What is the current weather in San Francisco?",
                        },
                    ],
                    stream: true,
                    max_tokens: 100,
                }),
            });

            expect(response.status).toBe(200);
            expect(response.headers.get("content-type")).toContain(
                "text/event-stream",
            );

            const result = await consumeStream(response);

            console.log("\n=== GEMINI-SEARCH (REPORTED AS BROKEN) ===");
            console.log(`Total chunks: ${result.chunkCount}`);
            console.log(
                `First chunk arrived at: ${result.firstChunkTime}ms`,
            );
            console.log(`Total time: ${result.totalTime}ms`);
            if (result.chunkCount > 0) {
                console.log(
                    `Average chunk interval: ${result.totalTime / result.chunkCount}ms`,
                );
            }

            // Analyze chunk timing distribution
            if (result.timings.length > 1) {
                const intervals = [];
                for (let i = 1; i < result.timings.length; i++) {
                    intervals.push(result.timings[i] - result.timings[i - 1]);
                }
                console.log(
                    `Chunk interval stddev: ${standardDeviation(intervals).toFixed(2)}ms`,
                );
                console.log(`First 5 intervals:`, intervals.slice(0, 5));
            }

            // Report findings but don't fail the test - we're documenting the issue
            if (result.chunkCount <= 2) {
                console.warn(
                    "⚠️  ISSUE CONFIRMED: gemini-search outputting in very few chunks (one-shot behavior)",
                );
            }

            if (result.firstChunkTime > 5000) {
                console.warn(
                    "⚠️  ISSUE CONFIRMED: Long delay before first chunk (buffering detected)",
                );
            }

            // These are soft expectations - we're documenting the issue, not fixing it yet
            expect(result.chunkCount).toBeGreaterThan(0); // At least got some response
        },
        60000,
    );

    // Comparison test
    it(
        "should compare streaming behavior between gemini and gemini-search",
        async () => {
            const testPrompt = "Explain how photosynthesis works in 3 sentences.";

            // Test regular gemini
            const geminiResponse = await fetch(`${BASE_URL}/v1/chat/completions`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${API_KEY}`,
                },
                body: JSON.stringify({
                    model: "gemini",
                    messages: [{ role: "user", content: testPrompt }],
                    stream: true,
                    max_tokens: 100,
                }),
            });

            const geminiResult = await consumeStream(geminiResponse);

            // Test gemini-search
            const searchResponse = await fetch(`${BASE_URL}/v1/chat/completions`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${API_KEY}`,
                },
                body: JSON.stringify({
                    model: "gemini-search",
                    messages: [{ role: "user", content: testPrompt }],
                    stream: true,
                    max_tokens: 100,
                }),
            });

            const searchResult = await consumeStream(searchResponse);

            console.log("\n=== STREAMING COMPARISON ===");
            console.log(`Gemini chunks: ${geminiResult.chunkCount}`);
            console.log(
                `Gemini-search chunks: ${searchResult.chunkCount}`,
            );
            console.log(
                `Ratio: ${(searchResult.chunkCount / geminiResult.chunkCount).toFixed(2)}x`,
            );

            // Document the difference
            const chunkRatio = searchResult.chunkCount / geminiResult.chunkCount;
            if (chunkRatio < 0.5) {
                console.warn(
                    `⚠️  gemini-search produces ${(chunkRatio * 100).toFixed(0)}% fewer chunks than regular gemini`,
                );
            }

            // Soft expectation
            expect(searchResult.chunkCount).toBeGreaterThan(0);
        },
        60000,
    );
});

// Helper function for standard deviation
function standardDeviation(values) {
    const avg = values.reduce((sum, val) => sum + val, 0) / values.length;
    const squareDiffs = values.map((val) => Math.pow(val - avg, 2));
    const avgSquareDiff =
        squareDiffs.reduce((sum, val) => sum + val, 0) / squareDiffs.length;
    return Math.sqrt(avgSquareDiff);
}
