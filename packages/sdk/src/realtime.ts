import { DEFAULT_BASE_URL } from "./client.js";

/** One OpenAI Realtime event, in either direction. */
export interface RealtimeEvent {
    type: string;
    [key: string]: unknown;
}

/** Turn detection for the input audio: server VAD, or null to commit manually. */
export type RealtimeTurnDetection = { type: "server_vad" } | null;

/**
 * Session settings, sent as a `session.update` event. Audio in and out is
 * PCM at 24 kHz, the format the gateway's realtime models speak.
 */
export interface RealtimeSessionConfig {
    /** System instructions for the model. */
    instructions?: string;
    /** Voice for spoken replies, e.g. "alloy". Voice models only. */
    voice?: string;
    /** Model that transcribes the input audio, e.g. "elevenlabs/scribe-v2-realtime". */
    transcriptionModel?: string;
    /** Defaults to the model's own setting. Pass null to commit audio manually. */
    turnDetection?: RealtimeTurnDetection;
}

export interface RealtimeOptions {
    apiKey: string;
    /** HTTP(S) or WS(S) base URL. Defaults to the public gateway. */
    baseUrl?: string;
    /** Realtime model id. Defaults to "openai/gpt-realtime-2.1". */
    model?: string;
    /** Session settings sent as `session.update` as soon as the socket opens. */
    session?: RealtimeSessionConfig;
    onEvent: (event: RealtimeEvent) => void;
    onError?: (error: Error) => void;
    onClose?: (event: CloseEvent) => void;
}

export interface RealtimeSession {
    socket: WebSocket;
    /** Send one event. Events sent before the socket opens are queued and flushed in order. */
    send: (event: RealtimeEvent) => void;
    /** Replace the session settings with a `session.update` event. */
    updateSession: (session: RealtimeSessionConfig) => void;
    /** Append microphone audio (PCM16, 24 kHz mono) to the input buffer. */
    appendAudio: (pcm: Int16Array) => void;
    /** Commit the input audio buffer. Needed when turn detection is off. */
    commitAudio: () => void;
    close: () => void;
}

const DEFAULT_REALTIME_MODEL = "openai/gpt-realtime-2.1";

function buildSessionUpdate(session: RealtimeSessionConfig): RealtimeEvent {
    const input: Record<string, unknown> = {
        format: { type: "audio/pcm", rate: 24000 },
    };
    if (session.turnDetection !== undefined) {
        input.turn_detection = session.turnDetection;
    }
    if (session.transcriptionModel) {
        input.transcription = { model: session.transcriptionModel };
    }
    const audio: Record<string, unknown> = { input };
    if (session.voice) {
        audio.output = {
            format: { type: "audio/pcm", rate: 24000 },
            voice: session.voice,
        };
    }
    return {
        type: "session.update",
        session: {
            ...(session.instructions && {
                instructions: session.instructions,
            }),
            audio,
        },
    };
}

/** Encode PCM16 samples as base64, the wire format for realtime audio. */
export function pcm16ToBase64(samples: Int16Array): string {
    const bytes = new Uint8Array(
        samples.buffer,
        samples.byteOffset,
        samples.byteLength,
    );
    let binary = "";
    for (let i = 0; i < bytes.length; i += 8192) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    }
    return btoa(binary);
}

/** Decode base64 audio from a realtime event back to PCM16 samples. */
export function base64ToPcm16(base64: string): Int16Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return new Int16Array(bytes.buffer);
}

/**
 * Open a realtime session on the gateway's `/v1/realtime` WebSocket and pass
 * OpenAI Realtime events through: voice conversations with a realtime model,
 * or live transcription with a transcription model. Events arrive through
 * `onEvent`; send events and microphone audio through the returned session.
 */
export function connectRealtime(options: RealtimeOptions): RealtimeSession {
    const base = (options.baseUrl ?? DEFAULT_BASE_URL)
        .replace(/\/$/, "")
        .replace(/^http/, "ws");
    const url = new URL(`${base}/v1/realtime`);
    url.searchParams.set("model", options.model ?? DEFAULT_REALTIME_MODEL);
    // Browsers cannot set WebSocket headers, so the key rides in the query.
    url.searchParams.set("key", options.apiKey);

    const socket = new WebSocket(url.toString());
    const queue: string[] = [];
    let open = false;

    const send = (event: RealtimeEvent) => {
        const data = JSON.stringify(event);
        if (open) {
            socket.send(data);
        } else {
            queue.push(data);
        }
    };

    socket.onopen = () => {
        open = true;
        if (options.session) {
            socket.send(JSON.stringify(buildSessionUpdate(options.session)));
        }
        for (const data of queue) {
            socket.send(data);
        }
        queue.length = 0;
    };
    socket.onmessage = (message) => {
        if (typeof message.data !== "string") return;
        try {
            const event = JSON.parse(message.data) as RealtimeEvent;
            if (typeof event?.type === "string") {
                options.onEvent(event);
            }
        } catch {
            // Not an event frame; ignore it.
        }
    };
    socket.onerror = () => {
        options.onError?.(new Error("Realtime WebSocket error"));
    };
    socket.onclose = (event) => {
        open = false;
        options.onClose?.(event);
    };

    return {
        socket,
        send,
        updateSession: (session) => send(buildSessionUpdate(session)),
        appendAudio: (pcm) =>
            send({
                type: "input_audio_buffer.append",
                audio: pcm16ToBase64(pcm),
            }),
        commitAudio: () => send({ type: "input_audio_buffer.commit" }),
        close: () => socket.close(),
    };
}
