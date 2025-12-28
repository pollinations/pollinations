#!/usr/bin/env node
/**
 * Test script to verify streaming responses are received as a stream (not buffered).
 *
 * A properly streaming response should have chunks arriving over time.
 * A buffered response will have all chunks arrive at once at the end.
 *
 * Usage:
 *   node test-streaming-timing.js [endpoint]
 *
 * Examples:
 *   node test-streaming-timing.js http://localhost:3001  # Local (should pass)
 *   node test-streaming-timing.js https://gen.pollinations.ai  # Production (may fail if buffered)
 */

const endpoint = process.argv[2] || "http://localhost:3001";
const apiPath = "/api/generate/v1/chat/completions";
const url = `${endpoint}${apiPath}`;

console.log(`\n🧪 Testing streaming at: ${url}\n`);

async function testStreaming() {
    const startTime = Date.now();
    const chunkTimes = [];
    let totalChunks = 0;
    let firstChunkTime = null;
    let lastChunkTime = null;

    // Use a prompt that generates a longer response to better detect streaming
    const body = JSON.stringify({
        model: "openai-fast",
        messages: [
            {
                role: "user",
                content:
                    "Write a 200 word essay about the history of computers. Include many details and facts.",
            },
        ],
        stream: true,
    });

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                // No auth needed for gen.pollinations.ai, but include for local testing
                "Authorization": `Bearer ${process.env.ENTER_API_TOKEN_LOCAL || "sk_test"}`,
            },
            body,
        });

        if (!response.ok) {
            const text = await response.text();
            console.error(
                `❌ HTTP Error: ${response.status} - ${text.substring(0, 200)}`,
            );
            process.exit(1);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const now = Date.now();
            const elapsed = now - startTime;

            if (firstChunkTime === null) {
                firstChunkTime = elapsed;
            }
            lastChunkTime = elapsed;

            totalChunks++;
            chunkTimes.push(elapsed);

            const text = decoder.decode(value, { stream: true });
            const lines = text.split("\n").filter((l) => l.startsWith("data:"));

            // Show first few chunks for debugging
            if (totalChunks <= 5) {
                console.log(
                    `  Chunk ${totalChunks} at ${elapsed}ms: ${lines.length} SSE event(s)`,
                );
            }
        }

        // Analysis
        console.log(`\n📊 Results:`);
        console.log(`  Total chunks received: ${totalChunks}`);
        console.log(`  First chunk at: ${firstChunkTime}ms`);
        console.log(`  Last chunk at: ${lastChunkTime}ms`);
        console.log(
            `  Total streaming duration: ${lastChunkTime - firstChunkTime}ms`,
        );

        // Calculate time gaps between chunks
        const gaps = [];
        for (let i = 1; i < chunkTimes.length; i++) {
            gaps.push(chunkTimes[i] - chunkTimes[i - 1]);
        }

        const avgGap =
            gaps.length > 0 ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;
        const maxGap = gaps.length > 0 ? Math.max(...gaps) : 0;
        const minGap = gaps.length > 0 ? Math.min(...gaps) : 0;

        console.log(`  Average gap between chunks: ${avgGap.toFixed(1)}ms`);
        console.log(`  Min/Max gap: ${minGap}ms / ${maxGap}ms`);

        // Determine if streaming is working
        // Key insight: In a buffered response, ALL chunks arrive at nearly the same time
        // In a streaming response, chunks are spread out with gaps between them
        const streamingDuration = lastChunkTime - firstChunkTime;

        // Count how many chunks arrived with significant gaps (>50ms)
        const significantGaps = gaps.filter((g) => g > 50).length;
        const percentWithGaps =
            totalChunks > 1 ? (significantGaps / (totalChunks - 1)) * 100 : 0;

        // A properly streaming response should have at least 10% of chunks with >50ms gaps
        // OR the total duration should be >500ms with multiple chunks
        const hasGoodDistribution = percentWithGaps > 10;
        const hasLongDuration = streamingDuration > 500 && totalChunks > 5;
        const isStreaming = hasGoodDistribution || hasLongDuration;

        console.log(
            `  Chunks with >50ms gap: ${significantGaps} (${percentWithGaps.toFixed(1)}%)`,
        );

        console.log(`\n🎯 Verdict:`);
        if (isStreaming) {
            console.log(`  ✅ PASS: Response is properly streaming`);
            if (hasGoodDistribution) {
                console.log(
                    `     ${percentWithGaps.toFixed(1)}% of chunks had >50ms gaps (threshold: 10%)`,
                );
            }
            if (hasLongDuration) {
                console.log(`     Chunks arrived over ${streamingDuration}ms`);
            }
            return {
                pass: true,
                duration: streamingDuration,
                chunks: totalChunks,
                gapPercent: percentWithGaps,
            };
        } else {
            console.log(`  ❌ FAIL: Response appears to be buffered`);
            console.log(
                `     Only ${percentWithGaps.toFixed(1)}% of chunks had >50ms gaps (need >10%)`,
            );
            console.log(
                `     All ${totalChunks} chunks arrived in ${streamingDuration}ms`,
            );
            return {
                pass: false,
                duration: streamingDuration,
                chunks: totalChunks,
                gapPercent: percentWithGaps,
            };
        }
    } catch (error) {
        console.error(`❌ Error: ${error.message}`);
        process.exit(1);
    }
}

testStreaming().then((result) => {
    process.exit(result.pass ? 0 : 1);
});
