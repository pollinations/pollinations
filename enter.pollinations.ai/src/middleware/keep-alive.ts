import { createMiddleware } from "hono/factory";
import type { Context } from "hono";

/**
 * Keep-alive middleware for SSE streaming to prevent Cloudflare 524 timeouts
 * 
 * Cloudflare has a 100-second timeout that kills long-running connections.
 * This middleware injects periodic heartbeat messages to keep the connection alive
 * during long text generations (>100s).
 */

const HEARTBEAT_INTERVAL = 30000; // 30 seconds - well under Cloudflare's 100s limit
const HEARTBEAT_DATA = " "; // Single space - minimal but valid SSE data

export interface KeepAliveVariables {
    keepAlive?: {
        enabled: boolean;
        startTime: number;
        lastHeartbeat: number;
    };
}

export const keepAlive = createMiddleware<{ Variables: KeepAliveVariables & { log: any } }>(async (c, next) => {
    const log = c.get("log");
    
    // Only apply to streaming requests
    const isStreaming = c.req.header("accept")?.includes("text/event-stream") || 
                       (await c.req.json().catch(() => ({}))).stream === true;
    
    if (!isStreaming) {
        await next();
        return;
    }

    const startTime = Date.now();
    c.set("keepAlive", {
        enabled: true,
        startTime,
        lastHeartbeat: startTime,
    });

    log.info("Keep-alive middleware enabled for streaming request");

    await next();

    // If response is streaming, wrap it with heartbeat injection
    if (c.res.body && c.res.headers.get("content-type")?.includes("text/event-stream")) {
        const wrappedStream = wrapStreamWithHeartbeat(c.res.body, log);
        c.res = new Response(wrappedStream, {
            headers: c.res.headers,
            status: c.res.status,
            statusText: c.res.statusText,
        });
    }
});

/**
 * Wraps a readable stream with periodic heartbeat messages
 */
function wrapStreamWithHeartbeat(
    originalStream: ReadableStream<Uint8Array>,
    log: any
): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    let lastHeartbeat = Date.now();
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

    return new ReadableStream({
        async start(controller) {
            const reader = originalStream.getReader();
            
            // Heartbeat function
            const sendHeartbeat = () => {
                const now = Date.now();
                const timeSinceLastHeartbeat = now - lastHeartbeat;
                
                if (timeSinceLastHeartbeat >= HEARTBEAT_INTERVAL) {
                    try {
                        // Send heartbeat as SSE data
                        const heartbeatEvent = `data: ${JSON.stringify({ type: "heartbeat", timestamp: now })}\n\n`;
                        controller.enqueue(encoder.encode(heartbeatEvent));
                        lastHeartbeat = now;
                        log.debug("Sent heartbeat to keep connection alive");
                    } catch (error) {
                        log.error("Failed to send heartbeat: {error}", { error });
                    }
                }
            };

            // Set up periodic heartbeat
            heartbeatTimer = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL / 2); // Check every 15s

            try {
                while (true) {
                    const { done, value } = await reader.read();
                    
                    if (done) {
                        break;
                    }

                    // Forward the original data
                    controller.enqueue(value);
                    
                    // Reset heartbeat timer on real data
                    lastHeartbeat = Date.now();
                }
            } catch (error) {
                log.error("Error reading from original stream: {error}", { error });
            } finally {
                if (heartbeatTimer) {
                    clearInterval(heartbeatTimer);
                }
                reader.releaseLock();
                controller.close();
            }
        },

        cancel() {
            if (heartbeatTimer) {
                clearInterval(heartbeatTimer);
            }
            log.info("Keep-alive stream cancelled");
        },
    });
}

/**
 * Alternative implementation: Thinking token injection
 * Instead of heartbeat events, inject "thinking..." tokens during long pauses
 */
export const thinkingTokenKeepAlive = createMiddleware<{ Variables: { log: any } }>(async (c, next) => {
    const log = c.get("log");
    
    // Only apply to streaming requests
    const isStreaming = c.req.header("accept")?.includes("text/event-stream") || 
                       (await c.req.json().catch(() => ({}))).stream === true;
    
    if (!isStreaming) {
        await next();
        return;
    }

    log.info("Thinking token keep-alive middleware enabled");

    await next();

    // If response is streaming, wrap it with thinking token injection
    if (c.res.body && c.res.headers.get("content-type")?.includes("text/event-stream")) {
        const wrappedStream = wrapStreamWithThinkingTokens(c.res.body, log);
        c.res = new Response(wrappedStream, {
            headers: c.res.headers,
            status: c.res.status,
            statusText: c.res.statusText,
        });
    }
});

/**
 * Wraps stream with "thinking..." tokens during long pauses
 * This maintains the illusion of active generation while keeping connection alive
 */
function wrapStreamWithThinkingTokens(
    originalStream: ReadableStream<Uint8Array>,
    log: any
): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    let lastDataTime = Date.now();
    let thinkingTimer: ReturnType<typeof setInterval> | null = null;
    let thinkingDots = 0;

    return new ReadableStream({
        async start(controller) {
            const reader = originalStream.getReader();
            
            // Thinking token function
            const sendThinkingToken = () => {
                const now = Date.now();
                const timeSinceLastData = now - lastDataTime;
                
                if (timeSinceLastData >= HEARTBEAT_INTERVAL) {
                    try {
                        // Create thinking dots animation
                        thinkingDots = (thinkingDots + 1) % 4;
                        const thinkingText = ".".repeat(thinkingDots) + " ".repeat(3 - thinkingDots);
                        
                        // Send as delta content in OpenAI-compatible format
                        const thinkingEvent = `data: ${JSON.stringify({
                            choices: [{
                                delta: { content: thinkingText },
                                index: 0,
                                finish_reason: null
                            }],
                            model: "thinking",
                            created: Math.floor(now / 1000)
                        })}\n\n`;
                        
                        controller.enqueue(encoder.encode(thinkingEvent));
                        log.debug("Sent thinking token to keep connection alive");
                    } catch (error) {
                        log.error("Failed to send thinking token: {error}", { error });
                    }
                }
            };

            // Set up periodic thinking token injection
            thinkingTimer = setInterval(sendThinkingToken, HEARTBEAT_INTERVAL / 2);

            try {
                while (true) {
                    const { done, value } = await reader.read();
                    
                    if (done) {
                        break;
                    }

                    // Forward the original data
                    controller.enqueue(value);
                    
                    // Reset timer on real data
                    lastDataTime = Date.now();
                    thinkingDots = 0; // Reset thinking animation
                }
            } catch (error) {
                log.error("Error reading from original stream: {error}", { error });
            } finally {
                if (thinkingTimer) {
                    clearInterval(thinkingTimer);
                }
                reader.releaseLock();
                controller.close();
            }
        },

        cancel() {
            if (thinkingTimer) {
                clearInterval(thinkingTimer);
            }
            log.info("Thinking token stream cancelled");
        },
    });
}