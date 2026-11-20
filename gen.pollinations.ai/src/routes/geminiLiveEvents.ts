import type { Usage } from "@shared/registry/registry.ts";
import { z } from "zod";
import { parseGeminiLiveUsage } from "./geminiLiveUsage.ts";

type Frame = Record<string, unknown>;
const obj = (value: unknown): Frame =>
    value && typeof value === "object" && !Array.isArray(value)
        ? (value as Frame)
        : {};
const array = (value: unknown): unknown[] =>
    Array.isArray(value) ? value : [];
const id = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;
const pcm = z
    .object({ type: z.literal("audio/pcm"), rate: z.literal(24000) })
    .strict();
const tool = z
    .object({
        type: z.literal("function"),
        name: z.string().min(1),
        description: z.string().optional(),
        parameters: z.record(z.string(), z.unknown()).optional(),
    })
    .strict();
const settings = z
    .object({
        type: z.literal("realtime").optional(),
        model: z.string().optional(),
        output_modalities: z.tuple([z.literal("audio")]).optional(),
        instructions: z.string().optional(),
        tools: z.array(tool).max(128).optional(),
        tool_choice: z.literal("auto").optional(),
        audio: z
            .object({
                input: z
                    .object({
                        format: pcm.optional(),
                        turn_detection: z
                            .object({ type: z.literal("server_vad") })
                            .strict()
                            .nullable()
                            .optional(),
                    })
                    .strict()
                    .optional(),
                output: z
                    .object({
                        format: pcm.optional(),
                        voice: z.string().min(1).optional(),
                    })
                    .strict()
                    .optional(),
            })
            .strict()
            .optional(),
    })
    .strict();
type Settings = z.infer<typeof settings>;
const maxInput = 8 * 1024 * 1024;
function base64(input: unknown) {
    if (typeof input !== "string" || !input.length || input.length > maxInput)
        throw Error("Expected base64 data within 8 MiB.");
    try {
        if (!atob(input).length) throw Error();
    } catch {
        throw Error("Invalid base64 data.");
    }
    return input;
}
function googleTools(tools: Settings["tools"]) {
    return tools?.length
        ? [
              {
                  functionDeclarations: tools.map(
                      ({ name, description, parameters }) => ({
                          name,
                          description,
                          parametersJsonSchema: parameters,
                      }),
                  ),
              },
          ]
        : [];
}
export function createGeminiLiveEvents({
    model,
    sendClient,
    sendGoogle,
    requestSetup,
    onUsage,
}: {
    model: string;
    sendClient: (event: Frame) => void;
    sendGoogle: (event: Frame) => void;
    requestSetup: () => void;
    onUsage: (usage: Usage) => void;
}) {
    const sessionId = id("sess");
    let config: Settings = {
        type: "realtime",
        model,
        output_modalities: ["audio"],
        instructions: "",
        tools: [],
        audio: {
            input: {
                format: { type: "audio/pcm", rate: 24000 },
                turn_detection: null,
            },
            output: { format: { type: "audio/pcm", rate: 24000 } },
        },
    };
    let started = false;
    let queued: Frame[] = [];
    let audio: string[] = [];
    let size = 0;
    let audioSize = 0;
    let active = false;
    let cancelled = false;
    let automaticAudio = false;
    let responseId = "";
    let output: Frame[] = [];
    let message: Frame | undefined;
    let part: Frame | undefined;
    let transcript = "";
    const calls = new Map<string, string>();
    const emit = (type: string, fields: Frame = {}) =>
        sendClient({ type, event_id: id("event"), ...fields });
    const session = () => ({
        ...config,
        id: sessionId,
        object: "realtime.session",
    });
    const response = (status: string, usage: unknown = null) => ({
        id: responseId,
        object: "realtime.response",
        status,
        output: [...output],
        usage,
        output_modalities: config.output_modalities,
    });
    function begin() {
        active = true;
        if (responseId) return;
        responseId = id("resp");
        emit("response.created", { response: response("in_progress") });
    }
    function addItem(item: Frame) {
        output.push(item);
        emit("response.output_item.added", {
            response_id: responseId,
            output_index: output.length - 1,
            item: { ...item },
        });
        emit("conversation.item.added", { item: { ...item } });
    }
    function doneItem(item: Frame) {
        item.status = "completed";
        emit("response.output_item.done", {
            response_id: responseId,
            output_index: output.indexOf(item),
            item,
        });
        emit("conversation.item.done", { item });
    }
    function coordinates() {
        return {
            response_id: responseId,
            item_id: message?.id,
            output_index: message ? output.indexOf(message) : 0,
            content_index: 0,
        };
    }
    function addDelta(kind: "audio" | "text" | "transcript", delta: string) {
        begin();
        if (!message) {
            message = {
                id: id("item"),
                object: "realtime.item",
                type: "message",
                role: "assistant",
                status: "in_progress",
                content: [],
            };
            addItem(message);
            part =
                kind === "text"
                    ? { type: "output_text", text: "" }
                    : { type: "output_audio", transcript: "" };
            message.content = [part];
            emit("response.content_part.added", {
                ...coordinates(),
                part: { ...part },
            });
        }
        if (kind !== "audio") transcript += delta;
        emit(
            "response." +
                {
                    audio: "output_audio",
                    text: "output_text",
                    transcript: "output_audio_transcript",
                }[kind] +
                ".delta",
            { ...coordinates(), delta },
        );
    }
    function finish(raw: unknown) {
        const units = parseGeminiLiveUsage(raw);
        if (!units)
            throw Error("Gemini Live turn ended without valid provider usage.");
        onUsage(units);
        begin();
        if (message && part) {
            if (part.type === "output_audio") {
                part.transcript = transcript;
                emit("response.output_audio.done", coordinates());
                emit("response.output_audio_transcript.done", {
                    ...coordinates(),
                    transcript,
                });
            } else {
                part.text = transcript;
                emit("response.output_text.done", {
                    ...coordinates(),
                    text: transcript,
                });
            }
            emit("response.content_part.done", { ...coordinates(), part });
            doneItem(message);
        }
        const input = {
            text_tokens: units.promptTextTokens ?? 0,
            audio_tokens: units.promptAudioTokens ?? 0,
            image_tokens:
                (units.promptImageTokens ?? 0) + (units.promptVideoTokens ?? 0),
            cached_tokens: units.promptCachedTokens ?? 0,
        };
        const out = {
            text_tokens:
                (units.completionTextTokens ?? 0) +
                (units.completionReasoningTokens ?? 0),
            audio_tokens: units.completionAudioTokens ?? 0,
        };
        const inputTokens =
            input.text_tokens +
            input.audio_tokens +
            input.image_tokens +
            input.cached_tokens;
        const outputTokens = out.text_tokens + out.audio_tokens;
        emit("response.done", {
            response: response(cancelled ? "cancelled" : "completed", {
                total_tokens: inputTokens + outputTokens,
                input_tokens: inputTokens,
                output_tokens: outputTokens,
                input_token_details: input,
                output_token_details: out,
            }),
        });
        active = false;
        cancelled = false;
        responseId = "";
        output = [];
        message = undefined;
        part = undefined;
        transcript = "";
        automaticAudio = false;
    }
    function queuedInput(frames: Frame[]) {
        const nextSize =
            size +
            frames.reduce((n, frame) => n + JSON.stringify(frame).length, 0);
        if (
            nextSize + audioSize > maxInput ||
            queued.length + frames.length > 1024
        )
            throw Error("Pending realtime input is full.");
        size = nextSize;
        queued.push(...frames);
    }
    function acceptItem(item: Frame) {
        const completed = {
            ...item,
            id: item.id ?? id("item"),
            object: "realtime.item",
            status: "completed",
        };
        emit("conversation.item.added", { item: completed });
        emit("conversation.item.done", { item: completed });
    }
    function submit(item: Frame) {
        if (item.type === "function_call_output") {
            const callId = item.call_id;
            if (
                typeof callId !== "string" ||
                !calls.has(callId) ||
                typeof item.output !== "string"
            )
                throw Error("Unknown function call or invalid output.");
            let result: unknown;
            try {
                result = JSON.parse(item.output);
            } catch {
                result = item.output;
            }
            queuedInput([
                {
                    toolResponse: {
                        functionResponses: [
                            {
                                id: callId,
                                name: calls.get(callId),
                                response: { result },
                            },
                        ],
                    },
                },
            ]);
            calls.delete(callId);
        } else {
            if (
                item.type !== "message" ||
                item.role !== "user" ||
                !array(item.content).length
            )
                throw Error("Expected a user message with content.");
            const frames = array(item.content).map((value) => {
                const p = obj(value);
                if (
                    p.type === "input_text" &&
                    typeof p.text === "string" &&
                    p.text.length
                )
                    return { realtimeInput: { text: p.text } };
                if (
                    p.type === "input_image" &&
                    typeof p.image_url === "string"
                ) {
                    const match = /^data:(image\/jpeg);base64,(.+)$/.exec(
                        p.image_url,
                    );
                    if (match)
                        return {
                            realtimeInput: {
                                video: {
                                    mimeType: match[1],
                                    data: base64(match[2]),
                                },
                            },
                        };
                }
                throw Error(
                    "Expected input_text or a base64 JPEG input_image.",
                );
            });
            queuedInput(frames);
        }
        acceptItem(item);
    }
    function update(raw: unknown) {
        const next = settings.parse(raw);
        if (next.model && next.model !== model)
            throw Error("Model is fixed for this connection.");
        if (started && (next.audio || next.output_modalities))
            throw Error(
                "Set audio and output_modalities before sending input.",
            );
        config = {
            ...config,
            ...next,
            audio: {
                input: { ...config.audio?.input, ...next.audio?.input },
                output: { ...config.audio?.output, ...next.audio?.output },
            },
        };
        if (
            started &&
            (next.instructions !== undefined || next.tools !== undefined)
        ) {
            sendGoogle({
                contextUpdate: {
                    ...(next.instructions !== undefined && {
                        systemInstruction: {
                            parts: [{ text: next.instructions }],
                        },
                    }),
                    ...(next.tools !== undefined && {
                        tools: { tools: googleTools(next.tools) },
                    }),
                },
            });
        }
        emit("session.updated", { session: session() });
    }
    function handle(event: Frame) {
        switch (event.type) {
            case "session.update":
                return update(event.session);
            case "conversation.item.create":
                return submit(obj(event.item));
            case "input_audio_buffer.append": {
                const data = base64(event.audio);
                if (atob(data).length % 2)
                    throw Error("PCM16 audio must contain whole samples.");
                if (config.audio?.input?.turn_detection) {
                    automaticAudio = true;
                    active = true;
                    requestSetup();
                    sendGoogle({
                        realtimeInput: {
                            audio: { data, mimeType: "audio/pcm;rate=24000" },
                        },
                    });
                } else {
                    if (
                        size + audioSize + data.length > maxInput ||
                        audio.length >= 1024
                    )
                        throw Error("Pending audio buffer is full.");
                    audio.push(data);
                    audioSize += data.length;
                }
                return;
            }
            case "input_audio_buffer.clear":
                if (automaticAudio)
                    throw Error("Server VAD audio has already been streamed.");
                audio = [];
                audioSize = 0;
                return emit("input_audio_buffer.cleared");
            case "input_audio_buffer.commit": {
                if (!automaticAudio && !audio.length)
                    throw Error("Audio buffer is empty.");
                if (automaticAudio)
                    sendGoogle({ realtimeInput: { audioStreamEnd: true } });
                else {
                    const frames = audio.map((data) => ({
                        realtimeInput: {
                            audio: { data, mimeType: "audio/pcm;rate=24000" },
                        },
                    }));
                    const bytes = audioSize;
                    audioSize = 0;
                    try {
                        queuedInput(frames);
                    } catch (error) {
                        audioSize = bytes;
                        throw error;
                    }
                    audio = [];
                }
                const itemId = id("item");
                emit("input_audio_buffer.committed", { item_id: itemId });
                return acceptItem({
                    id: itemId,
                    type: "message",
                    role: "user",
                    content: [{ type: "input_audio" }],
                });
            }
            case "response.create": {
                if (Object.keys(obj(event.response)).length)
                    throw Error(
                        "Use session.update to configure Gemini Live responses.",
                    );
                if (!queued.length) {
                    if (automaticAudio || active) return;
                    throw Error(
                        "Create or commit an input item before requesting a response.",
                    );
                }
                if (active && !queued.every((frame) => frame.toolResponse))
                    throw Error("A response is already active.");
                active = true;
                requestSetup();
                const manual =
                    !config.audio?.input?.turn_detection &&
                    queued.some((frame) => obj(frame.realtimeInput).audio);
                if (manual)
                    sendGoogle({ realtimeInput: { activityStart: {} } });
                for (const frame of queued) sendGoogle(frame);
                if (manual) sendGoogle({ realtimeInput: { activityEnd: {} } });
                queued = [];
                size = 0;
                return;
            }
            case "response.cancel":
                if (
                    !active ||
                    (event.response_id && event.response_id !== responseId)
                )
                    throw Error("No matching active response.");
                // Continue reading the provider through terminal usage after downstream cancellation.
                cancelled = true;
                return;
            default:
                throw Error("Unsupported Gemini Live client event.");
        }
    }
    return {
        start() {
            emit("session.created", { session: session() });
        },
        setup(modelPath: string) {
            started = true;
            const voice = config.audio?.output?.voice;
            return {
                setup: {
                    model: modelPath,
                    generationConfig: {
                        responseModalities: ["AUDIO"],
                        ...(voice && {
                            speechConfig: {
                                voiceConfig: {
                                    prebuiltVoiceConfig: { voiceName: voice },
                                },
                            },
                        }),
                    },
                    realtimeInputConfig: {
                        automaticActivityDetection: {
                            disabled: !config.audio?.input?.turn_detection,
                        },
                    },
                    ...(config.instructions && {
                        systemInstruction: {
                            parts: [{ text: config.instructions }],
                        },
                    }),
                    ...(config.tools?.length && {
                        tools: googleTools(config.tools),
                    }),
                    outputAudioTranscription: {},
                },
            };
        },
        client(raw: unknown) {
            const event = obj(raw);
            try {
                handle(event);
            } catch (err) {
                emit("error", {
                    error: {
                        type: "invalid_request_error",
                        code: "invalid_event",
                        message:
                            err instanceof Error
                                ? err.message
                                : "Invalid realtime event.",
                        event_id: event.event_id ?? null,
                    },
                });
            }
        },
        google(raw: unknown) {
            const event = obj(raw);
            if (event.error)
                throw Error("Gemini Live reported a provider error.");
            const content = obj(event.serverContent);
            if (content.interrupted) cancelled = true;
            if (!cancelled) {
                for (const rawPart of array(obj(content.modelTurn).parts)) {
                    const p = obj(rawPart);
                    if (p.thought) continue;
                    const data = obj(p.inlineData).data;
                    if (typeof data === "string") addDelta("audio", data);
                    if (typeof p.text === "string") addDelta("text", p.text);
                }
                const text = obj(content.outputTranscription).text;
                if (typeof text === "string" && text)
                    addDelta("transcript", text);
                for (const rawCall of array(
                    obj(event.toolCall).functionCalls,
                )) {
                    const call = obj(rawCall);
                    if (
                        typeof call.id !== "string" ||
                        typeof call.name !== "string"
                    )
                        throw Error("Invalid Gemini Live function call.");
                    begin();
                    calls.set(call.id, call.name);
                    const item = {
                        id: id("item"),
                        object: "realtime.item",
                        type: "function_call",
                        status: "in_progress",
                        call_id: call.id,
                        name: call.name,
                        arguments: "",
                    };
                    addItem(item);
                    item.arguments = JSON.stringify(call.args ?? {});
                    emit("response.function_call_arguments.done", {
                        response_id: responseId,
                        item_id: item.id,
                        output_index: output.indexOf(item),
                        call_id: call.id,
                        name: call.name,
                        arguments: item.arguments,
                    });
                    doneItem(item);
                }
            }
            for (const callId of array(obj(event.toolCallCancellation).ids))
                if (typeof callId === "string") calls.delete(callId);
            if (content.turnComplete) finish(event.usageMetadata);
        },
        pendingTurn: () => active,
    };
}
