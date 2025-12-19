/**
 * Simulated Streaming Transform for gemini-search
 * 
 * Problem: gemini-search delivers content in 1-2 mega-chunks (buffered by Vertex AI Google Search)
 * Solution: Re-stream the mega-chunk with artificial delays to smooth out UX
 * 
 * FIXES:
 * - Dynamic delay calculation to prevent Worker timeouts on large responses
 * - Proper SSE protocol handling (preserves event:, id:, and keep-alive comments)
 * - Safe JSON parsing with fallback
 */

const MAX_TOTAL_DELAY_MS = 2000; // Cap total artificial delay to 2 seconds
const MIN_DELAY_MS = 1;          // Minimum delay between chunks
const MAX_DELAY_MS = 20;         // Maximum delay between chunks
const CHARS_PER_CHUNK = 4;       // Rough token estimation

export async function simulatedStreaming(response: Response): Promise<Response> {
    const reader = response.body?.getReader();
    if (!reader) return response;

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
        async start(controller) {
            let buffer = '';
            
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    // Decode chunk (stream: true for proper multi-byte character handling)
                    buffer += decoder.decode(value, { stream: true });
                    
                    // Parse SSE events
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';

                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const data = line.slice(6);
                            if (data.trim() === '[DONE]') {
                                controller.enqueue(encoder.encode(line + '\n\n'));
                                continue;
                            }

                            try {
                                const json = JSON.parse(data);
                                const content = json.choices?.[0]?.delta?.content;
                                
                                if (content && content.length > 50) {
                                    // MEGA-CHUNK detected! Re-stream it with dynamic delay
                                    await reStreamContent(content, json, controller, encoder);
                                } else {
                                    // Normal chunk, pass through
                                    controller.enqueue(encoder.encode(line + '\n\n'));
                                }
                            } catch (e) {
                                // JSON parse error - pass through original line safely
                                controller.enqueue(encoder.encode(line + '\n\n'));
                            }
                        } else if (line.trim()) {
                            // CRITICAL FIX: Pass through non-data lines (event:, id:, comments)
                            // This prevents breaking the SSE protocol for other events
                            controller.enqueue(encoder.encode(line + '\n'));
                        }
                    }
                }

                // Flush remaining buffer
                if (buffer.trim()) {
                    controller.enqueue(encoder.encode(buffer));
                }

                controller.close();
            } catch (error) {
                controller.error(error);
            }
        },
    });

    return new Response(stream, {
        headers: response.headers,
        status: response.status,
        statusText: response.statusText,
    });
}

async function reStreamContent(
    content: string,
    originalJson: any,
    controller: ReadableStreamDefaultController,
    encoder: TextEncoder
) {
    // Split into small chunks
    const chunks: string[] = [];
    for (let i = 0; i < content.length; i += CHARS_PER_CHUNK) {
        chunks.push(content.slice(i, i + CHARS_PER_CHUNK));
    }

    // Dynamic delay calculation to prevent Worker timeouts
    // Cap total added latency to MAX_TOTAL_DELAY_MS
    // Example: 100 chunks × 20ms = 2000ms ✓
    //          500 chunks × 4ms = 2000ms ✓
    const dynamicDelay = Math.max(
        MIN_DELAY_MS,
        Math.min(MAX_DELAY_MS, MAX_TOTAL_DELAY_MS / chunks.length)
    );

    // Re-stream with delays
    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const isLast = i === chunks.length - 1;

        // Safe deep copy to avoid mutation issues
        const newJson = JSON.parse(JSON.stringify(originalJson));
        newJson.choices[0].delta.content = chunk;
        if (!isLast) {
            // Clear finish_reason for non-final chunks
            newJson.choices[0].finish_reason = null;
        }

        const line = `data: ${JSON.stringify(newJson)}\n\n`;
        controller.enqueue(encoder.encode(line));

        // Throttle (skip delay on last chunk to finish quickly)
        if (!isLast) {
            await sleep(dynamicDelay);
        }
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
