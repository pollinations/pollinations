import { z } from "zod";
import type { createGeminiLiveEvents } from "./geminiLiveEvents.ts";
import { parseGeminiLiveUsage } from "./geminiLiveUsage.ts";

const update = z
    .object({
        type: z.literal("transcription").optional(),
        model: z.string().optional(),
        audio: z
            .object({
                input: z
                    .object({
                        format: z
                            .object({
                                type: z.literal("audio/pcm"),
                                rate: z.union([
                                    z.literal(16000),
                                    z.literal(24000),
                                ]),
                            })
                            .strict()
                            .optional(),
                        turn_detection: z.null().optional(),
                        transcription: z
                            .object({
                                model: z.string().optional(),
                                languages: z
                                    .array(z.string().min(1))
                                    .min(1)
                                    .optional(),
                            })
                            .strict()
                            .optional(),
                    })
                    .strict(),
            })
            .strict()
            .optional(),
    })
    .strict();
const clientFrame = z.object({
    type: z.string(),
    session: z.unknown().optional(),
    audio: z.string().optional(),
});
const frame = z.object({
    voiceActivity: z.object({ type: z.string() }).optional(),
    serverContent: z
        .object({
            interimInputTranscription: z
                .object({ text: z.string() })
                .optional(),
            inputTranscription: z.object({ text: z.string() }).optional(),
        })
        .optional(),
    usageMetadata: z.unknown().optional(),
});

export function createGeminiTranscribeEvents({
    model,
    sendClient,
    sendGoogle,
    requestSetup,
    onUsage,
}: Parameters<typeof createGeminiLiveEvents>[0]) {
    const sessionId = `sess_${crypto.randomUUID()}`;
    let rate = 24000;
    // Vertex can answer spoken questions when the language list is empty, even in VERBATIM mode.
    let languages: string[] = ["en-US"];
    let started = false;
    let committed = false;
    let item: string | undefined;
    let upstreamItem: string | undefined;
    let previous: string | null = null;
    let emitted = "";
    const emit = (type: string, fields: object) =>
        sendClient({
            type,
            event_id: `event_${crypto.randomUUID()}`,
            ...fields,
        });
    const error = (message: string) =>
        emit("error", {
            error: {
                type: "invalid_request_error",
                code: "invalid_event",
                message,
            },
        });
    const session = () => ({
        id: sessionId,
        object: "realtime.session",
        type: "transcription",
        model,
        audio: {
            input: {
                format: { type: "audio/pcm", rate },
                turn_detection: null,
                transcription: { model, languages },
            },
        },
    });
    const delta = (text: string) => {
        if (text.startsWith(emitted) && text.length > emitted.length) {
            emit("conversation.item.input_audio_transcription.delta", {
                item_id: item,
                content_index: 0,
                delta: text.slice(emitted.length),
            });
            emitted = text;
        }
    };
    const endItem = () => {
        previous = item ?? null;
        item = undefined;
        emitted = "";
        committed = false;
    };
    const commit = () => {
        if (!item || committed)
            return error("Append audio before committing an utterance.");
        committed = true;
        sendGoogle({ realtimeInput: { activityEnd: {} } });
        emit("input_audio_buffer.committed", {
            item_id: item,
            previous_item_id: previous,
        });
    };
    return {
        start: () => emit("session.created", { session: session() }),
        setup: (upstreamModel: string) => ({
            setup: {
                model: upstreamModel,
                generationConfig: { responseModalities: ["TEXT"] },
                inputAudioTranscription: {
                    mode: "VERBATIM",
                    languageCodes: languages,
                },
                realtimeInputConfig: {
                    automaticActivityDetection: { disabled: true },
                },
            },
        }),
        client(raw: unknown) {
            const event = clientFrame.safeParse(raw);
            if (!event.success) return error("Expected a realtime event.");
            const { type, audio } = event.data;
            if (type === "session.update") {
                const parsed = update.safeParse(event.data.session);
                if (started || !parsed.success)
                    return error(
                        "Configure transcription and manual PCM input before the first append.",
                    );
                const input = parsed.data.audio?.input;
                if (
                    [parsed.data.model, input?.transcription?.model].some(
                        (id) => id !== undefined && id !== model,
                    )
                )
                    return error("Session model cannot change.");
                rate = input?.format?.rate ?? rate;
                languages = input?.transcription?.languages ?? languages;
                return emit("session.updated", { session: session() });
            }
            if (type === "input_audio_buffer.commit") return commit();
            if (type !== "input_audio_buffer.append")
                return error("Expected audio append or commit.");
            if (committed)
                return error(
                    "Wait for the completed transcript before appending audio.",
                );
            if (!audio || audio.length > 8 * 1024 * 1024)
                return error("Expected base64 PCM16 audio within 8 MiB.");
            try {
                const n = atob(audio).length;
                if (!n || n % 2) throw Error();
            } catch {
                return error("Expected whole PCM16 samples in base64.");
            }
            if (!item) {
                item = `item_${crypto.randomUUID()}`;
                started = true;
                requestSetup();
                sendGoogle({ realtimeInput: { activityStart: {} } });
            }
            sendGoogle({
                realtimeInput: {
                    audio: { mimeType: `audio/pcm;rate=${rate}`, data: audio },
                },
            });
        },
        google(raw: unknown) {
            const { serverContent, usageMetadata, voiceActivity } =
                frame.parse(raw);
            if (voiceActivity?.type === "ACTIVITY_START") upstreamItem = item;
            // Silent activities can end without a committed transcript or usage.
            // A previous activity's trailing end may arrive after the next append.
            if (
                voiceActivity?.type === "ACTIVITY_END" &&
                item &&
                upstreamItem === item &&
                committed &&
                !serverContent?.inputTranscription &&
                !usageMetadata
            ) {
                emit("conversation.item.input_audio_transcription.failed", {
                    item_id: item,
                    content_index: 0,
                    error: {
                        type: "transcription_error",
                        code: "no_transcript",
                        message:
                            "Vertex ended the utterance without a final transcript.",
                    },
                });
                endItem();
            }
            if (serverContent?.interimInputTranscription && item)
                delta(serverContent.interimInputTranscription.text);
            const final = serverContent?.inputTranscription;
            if (!final && !usageMetadata) return;
            const usage = parseGeminiLiveUsage(usageMetadata);
            if (
                !item ||
                !committed ||
                !final ||
                !usage ||
                Object.keys(usage).some(
                    (key) =>
                        key !== "promptAudioTokens" &&
                        key !== "completionTextTokens",
                )
            )
                throw Error("Missing transcription receipt");
            onUsage(usage);
            delta(final.text);
            emit("conversation.item.input_audio_transcription.completed", {
                item_id: item,
                content_index: 0,
                transcript: final.text,
                usage: {
                    type: "tokens",
                    input_tokens: usage.promptAudioTokens ?? 0,
                    output_tokens: usage.completionTextTokens ?? 0,
                    total_tokens:
                        (usage.promptAudioTokens ?? 0) +
                        (usage.completionTextTokens ?? 0),
                    input_token_details: {
                        audio_tokens: usage.promptAudioTokens ?? 0,
                    },
                },
            });
            endItem();
        },
        pendingTurn: () => Boolean(item),
        disconnect: () => {
            if (item && !committed) commit();
        },
    };
}
