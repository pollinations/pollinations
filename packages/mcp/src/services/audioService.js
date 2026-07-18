import { z } from "zod";
import { requireApiKey } from "../utils/authUtils.js";
import {
    API_BASE_URL,
    arrayBufferToBase64,
    chatWithMedia,
    createAudioContent,
    createMCPResponse,
    createTextContent,
    fetchBinaryWithAuth,
    postChatCompletion,
} from "../utils/coreUtils.js";
import { getAudioModels } from "../utils/models.js";

async function respondAudio(params) {
    requireApiKey();

    const { prompt, voice = "alloy", format = "mp3" } = params;

    if (!prompt || typeof prompt !== "string") {
        throw new Error("Prompt is required and must be a string");
    }

    const response = await postChatCompletion({
        model: "openai-audio",
        messages: [{ role: "user", content: prompt }],
        modalities: ["text", "audio"],
        audio: { voice, format },
    });
    const result = await response.json();
    const audio = result.choices?.[0]?.message?.audio;

    if (!audio?.data) {
        throw new Error("Audio response did not include audio data");
    }

    const content = [
        createAudioContent(
            audio.data,
            `audio/${format === "mp3" ? "mpeg" : format}`,
        ),
    ];
    if (audio.transcript) {
        content.push(createTextContent(audio.transcript));
    }
    return createMCPResponse(content);
}

async function sayText(params) {
    requireApiKey();

    const { text, voice = "alloy", format = "mp3", model } = params;

    if (!text || typeof text !== "string") {
        throw new Error("Text is required and must be a string");
    }

    const body = { input: text, voice, response_format: format };
    if (model) body.model = model;

    const { buffer, contentType } = await fetchBinaryWithAuth(
        `${API_BASE_URL}/v1/audio/speech`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        },
    );

    return createMCPResponse([
        createAudioContent(arrayBufferToBase64(buffer), contentType),
        createTextContent(
            `Generated speech for text: "${text}"\n\nVoice: ${voice}\nFormat: ${format}`,
        ),
    ]);
}

async function listAudioVoices(_params) {
    return createMCPResponse([createTextContent(await getAudioModels(), true)]);
}

async function transcribeAudio(params) {
    requireApiKey();

    const {
        audioUrl,
        prompt = "Transcribe this audio accurately. Include timestamps if there are multiple speakers.",
        model = "gemini-large",
    } = params;

    if (!audioUrl || typeof audioUrl !== "string") {
        throw new Error("audioUrl is required and must be a string");
    }

    const { content, model: respondedModel } = await chatWithMedia({
        model,
        prompt,
        mediaType: "input_audio",
        mediaUrl: audioUrl,
    });

    return createMCPResponse([
        createTextContent(
            {
                transcription: content,
                audioUrl,
                model: respondedModel,
                prompt,
            },
            true,
        ),
    ]);
}

const voiceSchema = z
    .string()
    .describe(
        "Voice name or provider voice ID. Use listAudioVoices for discovery.",
    );

const responseAudioFormatSchema = z.enum([
    "wav",
    "mp3",
    "flac",
    "opus",
    "pcm16",
]);
const speechFormatSchema = z.enum(["mp3", "opus", "aac", "flac", "wav", "pcm"]);

const audioModelSchema = z
    .string()
    .optional()
    .describe(
        "Audio model override. Omit to use the current primary TTS model.",
    );

export const audioTools = [
    [
        "respondAudio",
        "Generate an audio response to a text prompt. The AI will respond to your prompt with speech.",
        {
            prompt: z
                .string()
                .describe("The text prompt to respond to with audio"),
            voice: voiceSchema
                .optional()
                .describe("Voice to use (default: alloy)"),
            format: responseAudioFormatSchema
                .optional()
                .describe("Audio format (default: mp3)"),
        },
        respondAudio,
    ],

    [
        "sayText",
        "Generate speech that says the provided text verbatim. Direct text-to-speech.",
        {
            text: z.string().describe("The text to speak verbatim"),
            voice: voiceSchema
                .optional()
                .describe("Voice to use (default: alloy)"),
            format: speechFormatSchema
                .optional()
                .describe("Audio format (default: mp3)"),
            model: audioModelSchema,
        },
        sayText,
    ],

    [
        "listAudioVoices",
        "Return the live audio model and voice registry from Gen.",
        {},
        listAudioVoices,
    ],

    [
        "transcribeAudio",
        "Transcribe audio from a URL. Uses gemini-large for accurate speech-to-text transcription.",
        {
            audioUrl: z
                .string()
                .describe("URL of the audio file to transcribe"),
            prompt: z
                .string()
                .optional()
                .describe(
                    "Custom transcription instructions (default: 'Transcribe this audio accurately')",
                ),
            model: z
                .string()
                .optional()
                .describe("Audio-capable text model or alias"),
        },
        transcribeAudio,
    ],
];
