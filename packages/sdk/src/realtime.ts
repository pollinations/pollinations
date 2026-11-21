/**
 * Minimal helpers for OpenAI-compatible Realtime voice sessions.
 *
 * @example
 * ```ts
 * import { connectRealtime, pcm16ToBase64 } from '@pollinations/sdk';
 *
 * const session = connectRealtime({
 *   apiKey: process.env.POLLINATIONS_API_KEY!,
 *   onEvent: (event) => console.log(event.type),
 * });
 * session.send({ type: 'session.update', session: { type: 'realtime' } });
 * session.send({ type: 'input_audio_buffer.append', audio: pcm16ToBase64(samples) });
 * session.close();
 * ```
 */

import { DEFAULT_BASE_URL } from "./client.js";

export const DEFAULT_REALTIME_MODEL = "openai/gpt-realtime-2.1";

/** An OpenAI Realtime protocol event. */
export type RealtimeEvent = { type: string; [key: string]: unknown };

export interface RealtimeSessionOptions {
    /** Pollinations API key. */
    apiKey: string;
    /** Realtime model id. Defaults to openai/gpt-realtime-2.1. */
    model?: string;
    /** API base URL. Defaults to https://gen.pollinations.ai. */
    baseUrl?: string;
    /** Called with each parsed event from the server. */
    onEvent?: (event: RealtimeEvent) => void;
}

export interface RealtimeSession {
    /** The underlying WebSocket. */
    socket: WebSocket;
    /** Send an OpenAI Realtime event. */
    send: (event: RealtimeEvent) => void;
    /** Close the session. */
    close: () => void;
}

/** Build the Realtime WebSocket URL for a session. */
export function realtimeUrl(
    options: Pick<RealtimeSessionOptions, "apiKey" | "model" | "baseUrl">,
): string {
    const base = (options.baseUrl ?? DEFAULT_BASE_URL)
        .replace(/^http/, "ws")
        .replace(/\/$/, "");
    const params = new URLSearchParams({
        model: options.model ?? DEFAULT_REALTIME_MODEL,
        key: options.apiKey,
    });
    return `${base}/v1/realtime?${params}`;
}

/** Open a Realtime session. */
export function connectRealtime(options: RealtimeSessionOptions): RealtimeSession {
    const socket = new WebSocket(realtimeUrl(options));
    if (options.onEvent) {
        socket.addEventListener("message", (event) => {
            if (typeof event.data !== "string") return;
            try {
                options.onEvent?.(JSON.parse(event.data) as RealtimeEvent);
            } catch {
                // Ignore non-JSON frames.
            }
        });
    }
    return {
        socket,
        send: (event) => socket.send(JSON.stringify(event)),
        close: () => socket.close(),
    };
}

/** Encode 16-bit PCM samples as base64 for input_audio_buffer.append. */
export function pcm16ToBase64(samples: Int16Array): string {
    const bytes = new Uint8Array(
        samples.buffer,
        samples.byteOffset,
        samples.byteLength,
    );
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}

/** Decode base64 audio from the server into 16-bit PCM samples. */
export function base64ToPcm16(base64: string): Int16Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Int16Array(bytes.buffer);
}
