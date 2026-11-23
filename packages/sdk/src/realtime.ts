/**
 * Realtime voice and live transcription sessions.
 *
 * `openRealtimeSession()` connects to the OpenAI-compatible Realtime WebSocket
 * and passes its JSON events through unchanged. `startMicrophone()` and
 * `playRealtimeAudio()` add the browser audio path, so a voice app is a few
 * lines.
 *
 * @example
 * ```ts
 * import {
 *     openRealtimeSession,
 *     playRealtimeAudio,
 *     startMicrophone,
 * } from '@pollinations/sdk';
 *
 * const session = await openRealtimeSession({
 *     apiKey,
 *     instructions: 'Be concise.',
 * });
 * playRealtimeAudio(session);
 * await startMicrophone(session);
 *
 * session.onEvent((event) => console.log(event.type));
 * ```
 */

import { DEFAULT_BASE_URL, getEnvVar } from "./client.js";
import { PollinationsError } from "./types.js";

/** Default model: a voice session unless the caller picks another one. */
export const DEFAULT_REALTIME_MODEL = "openai/gpt-realtime-2.1";

/** Mono PCM sample rate every Pollinations realtime model accepts. */
const SAMPLE_RATE = 24_000;

/**
 * The provider renames this event, and both spellings are in circulation.
 * `response.audio.delta` is the original name; Gemini Live emits the newer
 * `output_` one.
 */
const AUDIO_DELTA_TYPES = new Set([
    "response.audio.delta",
    "response.output_audio.delta",
]);

/** Server events carry a `type`; everything else is provider-specific. */
export interface RealtimeEvent {
    type: string;
    [key: string]: unknown;
}

export interface RealtimeSessionOptions {
    /** Secret key (`sk_…`). Defaults to `POLLINATIONS_API_KEY`. */
    apiKey?: string;
    /** Defaults to `https://gen.pollinations.ai`. */
    baseUrl?: string;
    /** Defaults to `openai/gpt-realtime-2.1`. */
    model?: string;
    /** Session instructions, sent in the opening `session.update`. */
    instructions?: string;
    /** Session tools, sent in the opening `session.update`. */
    tools?: unknown[];
    /**
     * Extra `session` fields for the opening `session.update`. One level of
     * `audio.input` is merged over the defaults; everything else replaces them.
     */
    session?: Record<string, unknown>;
}

export interface RealtimeSession {
    socket: WebSocket;
    /** Send one OpenAI Realtime event. Ignored once the socket has closed. */
    send(event: RealtimeEvent): void;
    /** Close the socket. The session is billed once, when it closes. */
    close(): void;
    /** Subscribe to server events. Returns an unsubscribe function. */
    onEvent(handler: (event: RealtimeEvent) => void): () => void;
    /** Subscribe to the events this client sends. Returns an unsubscribe function. */
    onSent(handler: (event: RealtimeEvent) => void): () => void;
    /**
     * Subscribe to the socket closing, including when the server ends it.
     * Returns an unsubscribe function.
     */
    onClose(handler: (event: CloseEvent) => void): () => void;
}

/** The Realtime WebSocket URL for these options. */
export function realtimeUrl(options: RealtimeSessionOptions = {}): string {
    const {
        apiKey = getEnvVar("POLLINATIONS_API_KEY"),
        baseUrl = DEFAULT_BASE_URL,
        model = DEFAULT_REALTIME_MODEL,
    } = options;
    if (!apiKey) {
        throw new PollinationsError(
            "API key is required. Get one for free at https://enter.pollinations.ai/keys",
            "API_KEY",
            401,
        );
    }

    const url = new URL(
        `${baseUrl.replace(/\/$/, "").replace(/^http/, "ws")}/v1/realtime`,
    );
    url.searchParams.set("model", model);
    // A browser WebSocket cannot set an Authorization header, and `?key=` is
    // the documented way for either kind of client to authenticate.
    url.searchParams.set("key", apiKey);
    return url.toString();
}

/**
 * Open a realtime session and resolve once the socket is open.
 *
 * The caller owns the socket: `close()` ends the session and settles its
 * billing.
 */
export async function openRealtimeSession(
    options: RealtimeSessionOptions = {},
): Promise<RealtimeSession> {
    if (typeof WebSocket === "undefined") {
        throw new Error(
            "Realtime sessions need a WebSocket. Use a browser, or Node 22 and later.",
        );
    }

    const socket = new WebSocket(realtimeUrl(options));
    const eventHandlers = new Set<(event: RealtimeEvent) => void>();
    const sentHandlers = new Set<(event: RealtimeEvent) => void>();
    const closeHandlers = new Set<(event: CloseEvent) => void>();

    socket.addEventListener("message", (message) => {
        if (typeof message.data !== "string") return;
        const event = parseEvent(message.data);
        if (!event) return;
        for (const handler of eventHandlers) handler(event);
    });
    socket.addEventListener("close", (event) => {
        for (const handler of closeHandlers) handler(event);
    });

    await new Promise<void>((resolve, reject) => {
        // The handshake carries the key, so a rejected key fails here rather
        // than on the first event.
        socket.addEventListener("open", () => resolve(), { once: true });
        const fail = (reason: string) => () =>
            reject(
                new PollinationsError(
                    `Realtime connection failed: ${reason}`,
                    "REALTIME_CONNECTION_FAILED",
                    0,
                ),
            );
        socket.addEventListener("error", fail("socket error"), { once: true });
        socket.addEventListener(
            "close",
            (event) => fail(event.reason || "closed")(),
            { once: true },
        );
    });

    const send = (event: RealtimeEvent) => {
        // A closed socket throws, and the microphone sends on a timer, so a
        // session the server ended would otherwise raise on every chunk.
        if (socket.readyState !== WebSocket.OPEN) return;
        for (const handler of sentHandlers) handler(event);
        socket.send(JSON.stringify(event));
    };
    // Configure the session before the first `response.create`: auto turn
    // detection is not available, and Gemini Live rejects later changes.
    send({ type: "session.update", session: sessionUpdate(options) });

    return {
        socket,
        send,
        close: () => socket.close(),
        onEvent(handler) {
            eventHandlers.add(handler);
            return () => eventHandlers.delete(handler);
        },
        onSent(handler) {
            sentHandlers.add(handler);
            return () => sentHandlers.delete(handler);
        },
        onClose(handler) {
            closeHandlers.add(handler);
            return () => closeHandlers.delete(handler);
        },
    };
}

/**
 * The opening `session.update` body.
 *
 * There is deliberately no `type`: the route has already created the right
 * kind of session, and a transcription deployment rejects a realtime one.
 */
function sessionUpdate(options: RealtimeSessionOptions) {
    const { audio, ...rest } = (options.session ?? {}) as {
        audio?: { input?: Record<string, unknown> };
        [key: string]: unknown;
    };
    return {
        audio: {
            ...audio,
            input: {
                // What `startMicrophone` sends, stated rather than assumed.
                format: { type: "audio/pcm", rate: SAMPLE_RATE },
                // Manual turns are the only mode Gemini Live supports, and
                // leaving the provider default on turns the model into a
                // second speaker that also answers every commit.
                turn_detection: null,
                ...audio?.input,
            },
        },
        ...(options.instructions && { instructions: options.instructions }),
        ...(options.tools && { tools: options.tools }),
        ...rest,
    };
}

/** Encode mono float samples (24 kHz) as the base64 PCM16 the API expects. */
export function encodeAudioChunk(samples: Float32Array): string {
    const bytes = new Uint8Array(samples.length * 2);
    for (let i = 0; i < samples.length; i++) {
        const sample = Math.max(-1, Math.min(1, samples[i]));
        const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        bytes[i * 2] = int16 & 0xff;
        bytes[i * 2 + 1] = (int16 >> 8) & 0xff;
    }
    return bytesToBase64(bytes);
}

/** Decode base64 PCM16 audio from a `response.audio.delta` event. */
export function decodeAudioChunk(base64: string): Float32Array {
    const binary = atob(base64);
    const samples = new Float32Array(binary.length >> 1);
    for (let i = 0; i < samples.length; i++) {
        const int16 =
            binary.charCodeAt(i * 2) | (binary.charCodeAt(i * 2 + 1) << 8);
        samples[i] =
            int16 > 0x7fff ? (int16 - 0x10000) / 0x8000 : int16 / 0x8000;
    }
    return samples;
}

export interface RealtimeAudioPlayback {
    /** Stop playback and release the audio context. */
    stop(): void;
}

/**
 * Play the model's speech through an `<audio>` element.
 *
 * The element is the echo-cancellation reference the microphone needs: audio
 * sent straight to the audio output is re-captured by the mic, and the model
 * starts answering itself. This is why the sink is not optional here.
 *
 * Queued audio is dropped when `response.cancel` is sent, so an interruption
 * silences the model instead of finishing its turn.
 */
export function playRealtimeAudio(
    session: RealtimeSession,
): RealtimeAudioPlayback {
    if (typeof AudioContext === "undefined") {
        throw new Error("playRealtimeAudio needs a browser audio context.");
    }

    const context = new AudioContext({ sampleRate: SAMPLE_RATE });
    const destination = context.createMediaStreamDestination();
    const element = document.createElement("audio");
    element.autoplay = true;
    element.hidden = true;
    element.srcObject = destination.stream;
    // Safari plays a stream element only while it is in the document.
    document.body.append(element);
    // Autoplay policy may block this until a gesture; the AudioContext resume
    // below covers the same case.
    void element.play().catch(() => {});
    void context.resume();

    const scheduled = new Set<AudioBufferSourceNode>();
    let nextStart = 0;
    let stopped = false;

    const flush = () => {
        for (const source of scheduled) source.stop();
        scheduled.clear();
        nextStart = 0;
    };

    const push = (base64: string) => {
        let samples: Float32Array;
        try {
            samples = decodeAudioChunk(base64);
        } catch {
            // A malformed delta must not tear down the session.
            return;
        }
        if (!samples.length) return;
        const buffer = context.createBuffer(1, samples.length, SAMPLE_RATE);
        buffer.getChannelData(0).set(samples);
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(destination);
        const start = Math.max(context.currentTime, nextStart);
        source.start(start);
        nextStart = start + buffer.duration;
        scheduled.add(source);
        source.addEventListener("ended", () => scheduled.delete(source));
    };

    const unsubscribeEvent = session.onEvent((event) => {
        const delta = event.delta;
        if (AUDIO_DELTA_TYPES.has(event.type) && typeof delta === "string") {
            push(delta);
        }
    });
    const unsubscribeSent = session.onSent((event) => {
        if (event.type === "response.cancel") flush();
    });

    return {
        stop() {
            if (stopped) return;
            stopped = true;
            unsubscribeEvent();
            unsubscribeSent();
            flush();
            element.remove();
            void context.close();
        },
    };
}

/** Milliseconds of audio per `input_audio_buffer.append`. */
const DEFAULT_CHUNK_MS = 50;

export interface MicrophoneOptions {
    /** Pick a specific input device. */
    deviceId?: string;
}

/**
 * Stream microphone audio into the session as base64 PCM16.
 *
 * Resolves to a function that stops capture. Call it before
 * `input_audio_buffer.commit` when a turn ends.
 */
export async function startMicrophone(
    session: RealtimeSession,
    options: MicrophoneOptions = {},
): Promise<() => void> {
    if (!navigator.mediaDevices || typeof AudioWorkletNode === "undefined") {
        throw new Error("startMicrophone needs a browser with AudioWorklet.");
    }

    const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
            ...(options.deviceId && { deviceId: { exact: options.deviceId } }),
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
        },
    });
    const context = new AudioContext({ sampleRate: SAMPLE_RATE });
    try {
        return await captureMicrophone(session, stream, context);
    } catch (error) {
        // The microphone was granted before the audio graph could be built, so
        // release it here rather than leaving the indicator on.
        for (const track of stream.getTracks()) track.stop();
        void context.close();
        throw error;
    }
}

async function captureMicrophone(
    session: RealtimeSession,
    stream: MediaStream,
    context: AudioContext,
): Promise<() => void> {
    void context.resume();

    const moduleUrl = URL.createObjectURL(
        new Blob([CAPTURE_WORKLET], { type: "text/javascript" }),
    );
    try {
        await context.audioWorklet.addModule(moduleUrl);
    } finally {
        URL.revokeObjectURL(moduleUrl);
    }

    const frameSize = Math.round((SAMPLE_RATE * DEFAULT_CHUNK_MS) / 1000);
    const capture = new AudioWorkletNode(context, "pollinations-capture", {
        processorOptions: { frameSize },
    });
    const source = context.createMediaStreamSource(stream);
    // A silent sink keeps the worklet pulled without playing the mic back.
    const sink = context.createGain();
    sink.gain.value = 0;
    source.connect(capture).connect(sink).connect(context.destination);

    // The requested rate is honoured in current browsers, but the graph rate is
    // the only evidence of what the microphone actually produced.
    const rate = context.sampleRate;
    capture.port.onmessage = (message: MessageEvent<Float32Array>) => {
        session.send({
            type: "input_audio_buffer.append",
            audio: encodeAudioChunk(
                rate === SAMPLE_RATE
                    ? message.data
                    : resample(message.data, rate, SAMPLE_RATE),
            ),
        });
    };

    return () => {
        capture.port.onmessage = null;
        capture.port.close();
        source.disconnect();
        capture.disconnect();
        sink.disconnect();
        for (const track of stream.getTracks()) track.stop();
        void context.close();
    };
}

/**
 * AudioWorklet that batches the capture stream into fixed-size chunks. The
 * worklet graph pulls 128 samples at a time, which is too fine-grained for one
 * WebSocket message each.
 */
const CAPTURE_WORKLET = `
class PollinationsCapture extends AudioWorkletProcessor {
    constructor(options) {
        super();
        this.size = options.processorOptions.frameSize;
        this.chunk = new Float32Array(this.size);
        this.offset = 0;
    }

    process(inputs) {
        const channel = inputs[0][0];
        if (channel) {
            for (let read = 0; read < channel.length; ) {
                const take = Math.min(this.size - this.offset, channel.length - read);
                this.chunk.set(channel.subarray(read, read + take), this.offset);
                this.offset += take;
                read += take;
                if (this.offset === this.size) {
                    this.port.postMessage(this.chunk.slice());
                    this.offset = 0;
                }
            }
        }
        return true;
    }
}

registerProcessor("pollinations-capture", PollinationsCapture);
`;

function parseEvent(data: string): RealtimeEvent | null {
    try {
        const parsed: unknown = JSON.parse(data);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? (parsed as RealtimeEvent)
            : null;
    } catch {
        return null;
    }
}

function bytesToBase64(bytes: Uint8Array): string {
    let binary = "";
    // Spread is limited by the argument count, so convert in slices.
    for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
}

/** Linear resampling, so a graph that ignored the requested rate still sends 24 kHz. */
function resample(
    samples: Float32Array,
    from: number,
    to: number,
): Float32Array {
    const length = Math.floor((samples.length * to) / from);
    const out = new Float32Array(length);
    const step = from / to;
    for (let i = 0; i < length; i++) {
        const position = i * step;
        const index = Math.floor(position);
        const next = Math.min(index + 1, samples.length - 1);
        const weight = position - index;
        out[i] = samples[index] * (1 - weight) + samples[next] * weight;
    }
    return out;
}
