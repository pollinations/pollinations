import { DEFAULT_BASE_URL } from "./client.js";

/** One OpenAI Realtime event, sent or received as JSON. The gateway passes events through unchanged. */
export interface RealtimeEvent {
    type: string;
    [key: string]: unknown;
}

export interface RealtimeOptions {
    /** A user-authorized secret key (`sk_`). Browsers cannot set headers on a WebSocket, so it goes in `?key=`. */
    apiKey: string;
    /** Default `openai/gpt-realtime-2.1`. Transcription models such as `elevenlabs/scribe-v3-live` open a transcription session. */
    model?: string;
    baseUrl?: string;
    /** Called for every event from the server, starting with `session.created`. */
    onEvent?: (event: RealtimeEvent) => void;
    /** Called once when the socket closes, for any reason. */
    onClose?: (event: { code: number; reason: string }) => void;
    /** A WebSocket constructor for runtimes that have no global one. */
    WebSocket?: typeof WebSocket;
}

export interface RealtimeSession {
    send: (event: RealtimeEvent) => void;
    close: () => void;
}

export function realtimeUrl(
    options: Pick<RealtimeOptions, "apiKey" | "model" | "baseUrl">,
): string {
    const url = new URL("/v1/realtime", options.baseUrl ?? DEFAULT_BASE_URL);
    url.protocol = url.protocol === "http:" ? "ws:" : "wss:";
    url.searchParams.set("model", options.model ?? "openai/gpt-realtime-2.1");
    url.searchParams.set("key", options.apiKey);
    return url.toString();
}

/**
 * Opens a realtime session and resolves once the socket is open. Billing settles when it closes, so call
 * `close()` when done.
 *
 * @example
 * ```ts
 * const session = await connectRealtime({ apiKey, onEvent: (e) => console.log(e.type) });
 * session.send({ type: "response.create" });
 * ```
 */
export function connectRealtime(
    options: RealtimeOptions,
): Promise<RealtimeSession> {
    const Socket = options.WebSocket ?? WebSocket;
    const socket = new Socket(realtimeUrl(options));
    socket.addEventListener("message", (message) => {
        if (typeof message.data === "string")
            options.onEvent?.(JSON.parse(message.data));
    });
    socket.addEventListener("close", (event) =>
        options.onClose?.({ code: event.code, reason: event.reason }),
    );
    return new Promise((resolve, reject) => {
        socket.addEventListener("open", () =>
            resolve({
                send: (event) => socket.send(JSON.stringify(event)),
                close: () => socket.close(1000),
            }),
        );
        socket.addEventListener("error", () =>
            reject(new Error("Could not open the realtime session.")),
        );
    });
}

const RATE = 24_000; // PCM16 mono, the format of OpenAI Realtime audio

const toBase64 = (bytes: Uint8Array) => {
    let text = "";
    for (let i = 0; i < bytes.length; i += 0x8000)
        text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(text);
};

/** Streams the microphone to the session as `input_audio_buffer.append` events. Resolves to a function that stops it. */
export async function startMicrophone(
    session: RealtimeSession,
): Promise<() => void> {
    const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true },
    });
    const context = new AudioContext({ sampleRate: RATE });
    const worklet = `registerProcessor("pollinations-mic", class extends AudioWorkletProcessor {
        process(inputs) { if (inputs[0][0]) this.port.postMessage(inputs[0][0].slice()); return true; }
    })`;
    await context.audioWorklet.addModule(
        URL.createObjectURL(new Blob([worklet], { type: "text/javascript" })),
    );
    const node = new AudioWorkletNode(context, "pollinations-mic");
    node.port.onmessage = ({ data }: MessageEvent<Float32Array>) => {
        const pcm = Int16Array.from(
            data,
            (x) => Math.max(-1, Math.min(1, x)) * 0x7fff,
        );
        session.send({
            type: "input_audio_buffer.append",
            audio: toBase64(new Uint8Array(pcm.buffer)),
        });
    };
    context.createMediaStreamSource(stream).connect(node);
    return () => {
        for (const track of stream.getTracks()) track.stop();
        void context.close();
    };
}

/** Plays the model's audio. Pass each `response.output_audio.delta` payload to `play`; `clear` cuts it off when the user interrupts. */
export function createAudioPlayer(): {
    play: (base64: string) => void;
    clear: () => void;
} {
    const context = new AudioContext({ sampleRate: RATE });
    let sources: AudioBufferSourceNode[] = [];
    let next = 0;
    return {
        play(base64) {
            const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
            const pcm = new Int16Array(bytes.buffer);
            const buffer = context.createBuffer(1, pcm.length, RATE);
            buffer.copyToChannel(
                Float32Array.from(pcm, (x) => x / 0x8000),
                0,
            );
            const source = context.createBufferSource();
            source.buffer = buffer;
            source.connect(context.destination);
            next = Math.max(next, context.currentTime);
            source.start(next);
            next += buffer.duration;
            sources.push(source);
            source.onended = () => {
                sources = sources.filter((s) => s !== source);
            };
        },
        clear() {
            for (const source of sources) source.stop();
            sources = [];
            next = 0;
        },
    };
}
