import { z } from "zod";
import { requireApiKey } from "../utils/authUtils.js";
import {
    arrayBufferToBase64,
    buildUrl,
    chatWithMedia,
    createAudioContent,
    createMCPResponse,
    createTextContent,
    fetchBinaryWithAuth,
} from "../utils/coreUtils.js";
import { getAudioModels, validateVoice } from "../utils/models.js";

const DEFAULT_AUDIO_MODEL = "openai-audio";

async function resolveAudioModel(requested) {
    if (requested) return requested;
    try {
        const models = await getAudioModels();
        const tts = models.find((m) => m.output_modalities?.includes("audio"));
        return tts?.name || DEFAULT_AUDIO_MODEL;
    } catch {
        return DEFAULT_AUDIO_MODEL;
    }
}

async function respondAudio(params) {
    requireApiKey();

    const {
        prompt,
        voice = "alloy",
        format = "mp3",
        model,
        voiceInstructions,
    } = params;

    if (!prompt || typeof prompt !== "string") {
        throw new Error("Prompt is required and must be a string");
    }

    const voiceCheck = await validateVoice(voice);
    if (!voiceCheck.valid) {
        throw new Error(
            `${voiceCheck.error} Did you mean: ${voiceCheck.suggestions.join(", ")}? ` +
                `Use listAudioVoices to see all ${voiceCheck.availableCount} available voices.`,
        );
    }

    let finalPrompt = prompt;
    if (voiceInstructions) {
        finalPrompt = `${voiceInstructions}\n\n${prompt}`;
    }

    const queryParams = {
        model: await resolveAudioModel(model),
        voice,
        format,
    };

    const url = buildUrl(
        `/text/${encodeURIComponent(finalPrompt)}`,
        queryParams,
    );

    try {
        const { buffer, contentType } = await fetchBinaryWithAuth(url);
        const base64Data = arrayBufferToBase64(buffer);

        const mimeType =
            contentType || `audio/${format === "mp3" ? "mpeg" : format}`;

        return createMCPResponse([
            createAudioContent(base64Data, mimeType),
            createTextContent(
                `Generated audio response for prompt: "${prompt}"\n\nVoice: ${voice}\nFormat: ${format}`,
            ),
        ]);
    } catch (error) {
        console.error("Error generating audio:", error);
        throw error;
    }
}

async function sayText(params) {
    requireApiKey();

    const {
        text,
        voice = "alloy",
        format = "mp3",
        model,
        voiceInstructions,
    } = params;

    if (!text || typeof text !== "string") {
        throw new Error("Text is required and must be a string");
    }

    const voiceCheck = await validateVoice(voice);
    if (!voiceCheck.valid) {
        throw new Error(
            `${voiceCheck.error} Did you mean: ${voiceCheck.suggestions.join(", ")}? ` +
                `Use listAudioVoices to see all ${voiceCheck.availableCount} available voices.`,
        );
    }

    let finalPrompt = `Say verbatim: ${text}`;
    if (voiceInstructions) {
        finalPrompt = `${voiceInstructions}\n\n${finalPrompt}`;
    }

    const queryParams = {
        model: await resolveAudioModel(model),
        voice,
        format,
    };

    const url = buildUrl(
        `/text/${encodeURIComponent(finalPrompt)}`,
        queryParams,
    );

    try {
        const { buffer, contentType } = await fetchBinaryWithAuth(url);
        const base64Data = arrayBufferToBase64(buffer);

        const mimeType =
            contentType || `audio/${format === "mp3" ? "mpeg" : format}`;

        return createMCPResponse([
            createAudioContent(base64Data, mimeType),
            createTextContent(
                `Generated speech for text: "${text}"\n\nVoice: ${voice}\nFormat: ${format}`,
            ),
        ]);
    } catch (error) {
        console.error("Error generating speech:", error);
        throw error;
    }
}

async function listAudioVoices(_params) {
    const audioModels = await getAudioModels();
    const byModel = audioModels
        .filter((m) => Array.isArray(m.voices) && m.voices.length > 0)
        .map((m) => ({
            model: m.name,
            aliases: m.aliases || [],
            description: m.description,
            voices: m.voices,
        }));
    const allVoices = Array.from(new Set(byModel.flatMap((m) => m.voices)));

    if (allVoices.length === 0) {
        throw new Error("Audio model registry returned no voices");
    }

    return createMCPResponse([
        createTextContent(
            {
                voices: allVoices,
                byModel,
                formats: ["wav", "mp3", "flac", "opus", "pcm16"],
                total: allVoices.length,
            },
            true,
        ),
    ]);
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

    try {
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
    } catch (error) {
        console.error("Error transcribing audio:", error);
        throw error;
    }
}

const voiceSchema = z
    .string()
    .describe(
        "Voice name from the registry (e.g. alloy, nova, rachel, matilda). " +
            "Use listAudioVoices to see the full live list.",
    );

const formatEnum = z.enum(["wav", "mp3", "flac", "opus", "pcm16"]);

const audioModelSchema = z
    .string()
    .optional()
    .describe(
        "Audio model override (e.g. 'elevenlabs', 'openai-audio'). " +
            "Defaults to the current primary TTS model from the registry.",
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
            format: formatEnum
                .optional()
                .describe("Audio format (default: mp3)"),
            model: audioModelSchema,
            voiceInstructions: z
                .string()
                .optional()
                .describe(
                    "Additional instructions for voice style (e.g., 'Speak with enthusiasm')",
                ),
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
            format: formatEnum
                .optional()
                .describe("Audio format (default: mp3)"),
            model: audioModelSchema,
            voiceInstructions: z
                .string()
                .optional()
                .describe("Additional instructions for voice style"),
        },
        sayText,
    ],

    [
        "listAudioVoices",
        "List all available audio voices and supported formats. Voices are fetched dynamically from the API.",
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
                .describe(
                    "Model to use (default: 'gemini-large'). Also supports: gemini, openai-audio",
                ),
        },
        transcribeAudio,
    ],
];
