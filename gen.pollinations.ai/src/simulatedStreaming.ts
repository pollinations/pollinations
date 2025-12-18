/**
 * Simulated Streaming Transform for gemini-search
 * 
 * Problem: gemini-search delivers content in 1-2 mega-chunks (buffered by Vertex AI Google Search)
 * Solution: Re-stream the mega-chunk with artificial delays to smooth out UX
 */

const CHUNK_DELAY_MS = 20; // 20ms between chunks = ~50 tokens/sec
const CHARS_PER_CHUNK = 4;  // Rough token estimation

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

                    // Decode chunk
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
                                    // MEGA-CHUNK detected! Re-stream it
                                    await reStreamContent(content, json, controller, encoder);
                                } else {
                                    // Normal chunk, pass through
                                    controller.enqueue(encoder.encode(line + '\n\n'));
                                }
                            } catch {
                                // Not JSON, pass through
                                controller.enqueue(encoder.encode(line + '\n\n'));
                            }
                        } else if (line.trim()) {
                            // Pass through other SSE lines: event:, id:, keep-alive comments, etc.
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

    // Re-stream with delays
    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const isLast = i === chunks.length - 1;

        const newJson = {
            ...originalJson,
            choices: [{
                ...originalJson.choices[0],
                delta: {
                    ...originalJson.choices[0].delta,
                    content: chunk,
                },
                finish_reason: isLast ? originalJson.choices[0].finish_reason : null,
            }],
        };

        const line = `data: ${JSON.stringify(newJson)}\n\n`;
        controller.enqueue(encoder.encode(line));

        // Throttle (skip delay on last chunk)
        if (!isLast) {
            await sleep(CHUNK_DELAY_MS);
        }
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
