/**
 * Pollinations Audio Service
 *
 * Functions for audio/speech generation using gen.pollinations.ai
 * Uses the openai-audio model for text-to-speech
 */

import fs from "fs";
import path from "path";
import os from "os";
import {
    createMCPResponse,
    createTextContent,
    createAudioContent,
    buildUrl,
    fetchBinaryWithAuth,
    arrayBufferToBase64,
    API_BASE_URL,
} from "../utils/coreUtils.js";
import { getAudioVoices } from "../utils/modelCache.js";
import { getAuthHeaders } from "../utils/authUtils.js";
import { z } from "zod";

/**
 * Generate an audio response to a text prompt
 * The AI will respond to the prompt with speech
 */
async function respondAudio(params) {
    const {
        prompt,
        voice = "alloy",
        format = "mp3",
        voiceInstructions,
        audioPlayer,
        tempDir,
    } = params;

    if (!prompt || typeof prompt !== "string") {
        throw new Error("Prompt is required and must be a string");
    }

    // Prepare the prompt with optional voice instructions
    let finalPrompt = prompt;
    if (voiceInstructions) {
        finalPrompt = `${voiceInstructions}\n\n${prompt}`;
    }

    const queryParams = {
        model: "openai-audio",
        voice,
        format,
    };

    const url = buildUrl(`/text/${encodeURIComponent(finalPrompt)}`, queryParams);

    try {
        const { buffer, contentType } = await fetchBinaryWithAuth(url);
        const base64Data = arrayBufferToBase64(buffer);

        // Determine MIME type
        const mimeType = contentType || `audio/${format === "mp3" ? "mpeg" : format}`;

        // Play audio if player is provided
        if (audioPlayer) {
            const tempDirPath = tempDir || os.tmpdir();
            await playAudio(base64Data, mimeType, "respond_audio", audioPlayer, tempDirPath);
        }

        return createMCPResponse([
            createAudioContent(base64Data, mimeType),
            createTextContent(
                `Generated audio response for prompt: "${prompt}"\n\nVoice: ${voice}\nFormat: ${format}`
            ),
        ]);
    } catch (error) {
        console.error("Error generating audio:", error);
        throw error;
    }
}

/**
 * Generate speech that says the provided text verbatim
 * Direct text-to-speech without AI interpretation
 */
async function sayText(params) {
    const {
        text,
        voice = "alloy",
        format = "mp3",
        voiceInstructions,
        audioPlayer,
        tempDir,
    } = params;

    if (!text || typeof text !== "string") {
        throw new Error("Text is required and must be a string");
    }

    // Use verbatim instruction to ensure exact text is spoken
    let finalPrompt = `Say verbatim: ${text}`;
    if (voiceInstructions) {
        finalPrompt = `${voiceInstructions}\n\n${finalPrompt}`;
    }

    const queryParams = {
        model: "openai-audio",
        voice,
        format,
    };

    const url = buildUrl(`/text/${encodeURIComponent(finalPrompt)}`, queryParams);

    try {
        const { buffer, contentType } = await fetchBinaryWithAuth(url);
        const base64Data = arrayBufferToBase64(buffer);

        const mimeType = contentType || `audio/${format === "mp3" ? "mpeg" : format}`;

        if (audioPlayer) {
            const tempDirPath = tempDir || os.tmpdir();
            await playAudio(base64Data, mimeType, "say_text", audioPlayer, tempDirPath);
        }

        return createMCPResponse([
            createAudioContent(base64Data, mimeType),
            createTextContent(
                `Generated speech for text: "${text}"\n\nVoice: ${voice}\nFormat: ${format}`
            ),
        ]);
    } catch (error) {
        console.error("Error generating speech:", error);
        throw error;
    }
}

/**
 * List available audio voices
 * Fetches dynamically from the API
 */
async function listAudioVoices(params) {
    try {
        const voices = await getAudioVoices();

        const result = {
            voices,
            model: "openai-audio",
            formats: ["wav", "mp3", "flac", "opus", "pcm16"],
            total: voices.length,
        };

        return createMCPResponse([createTextContent(result, true)]);
    } catch (error) {
        console.error("Error listing audio voices:", error);
        // Return default voices on error
        const defaultVoices = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];
        return createMCPResponse([
            createTextContent({
                voices: defaultVoices,
                model: "openai-audio",
                formats: ["wav", "mp3", "flac", "opus", "pcm16"],
                total: defaultVoices.length,
                note: "Using default voice list (API unavailable)",
            }, true),
        ]);
    }
}

/**
 * Transcribe audio from a URL using gemini-large
 * Supports various audio formats
 */
async function transcribeAudio(params) {
    const {
        audioUrl,
        prompt = "Transcribe this audio accurately. Include timestamps if there are multiple speakers.",
        model = "gemini-large",
    } = params;

    if (!audioUrl || typeof audioUrl !== "string") {
        throw new Error("audioUrl is required and must be a string");
    }

    // Build chat completion request with audio input
    const requestBody = {
        model,
        messages: [
            {
                role: "user",
                content: [
                    {
                        type: "text",
                        text: prompt,
                    },
                    {
                        type: "input_audio",
                        input_audio: {
                            url: audioUrl,
                        },
                    },
                ],
            },
        ],
    };

    try {
        const response = await fetch(`${API_BASE_URL}/v1/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...getAuthHeaders(),
            },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const errorText = await response.text().catch(() => "Unknown error");
            throw new Error(`Failed to transcribe audio (${response.status}): ${errorText}`);
        }

        const result = await response.json();
        const transcription = result.choices?.[0]?.message?.content || "";

        return createMCPResponse([
            createTextContent({
                transcription,
                audioUrl,
                model: result.model || model,
                prompt,
            }, true),
        ]);
    } catch (error) {
        console.error("Error transcribing audio:", error);
        throw error;
    }
}

/**
 * Play audio using system audio player
 * @private
 */
function playAudio(audioData, mimeType, prefix, audioPlayer, tempDir) {
    if (!audioPlayer || !tempDir) {
        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        try {
            const format = getFormatFromMimeType(mimeType);
            const tempFile = path.join(tempDir, `${prefix}_${Date.now()}.${format}`);
            fs.writeFileSync(tempFile, Buffer.from(audioData, "base64"));

            audioPlayer.play(tempFile, (err) => {
                // Clean up temp file after playing
                try {
                    fs.unlinkSync(tempFile);
                } catch (e) {
                    console.error("Error removing temp file:", e);
                }

                if (err) {
                    console.error("Error playing audio:", err);
                }
                resolve();
            });
        } catch (error) {
            console.error("Error playing audio:", error);
            reject(error);
        }
    });
}

/**
 * Get file format from MIME type
 * @private
 */
function getFormatFromMimeType(mimeType) {
    const formats = {
        "audio/mpeg": "mp3",
        "audio/wav": "wav",
        "audio/ogg": "ogg",
        "audio/flac": "flac",
        "audio/opus": "opus",
    };
    return formats[mimeType] || "mp3";
}

// Voice enum for Zod schema
const voiceEnum = z.enum([
    "alloy", "echo", "fable", "onyx", "nova", "shimmer",
    "coral", "verse", "ballad", "ash", "sage", "amuch", "dan"
]);

const formatEnum = z.enum(["wav", "mp3", "flac", "opus", "pcm16"]);

/**
 * Export tools as arrays for MCP server registration
 */
export const audioTools = [
    [
        "respondAudio",
        "Generate an audio response to a text prompt. The AI will respond to your prompt with speech.",
        {
            prompt: z.string().describe("The text prompt to respond to with audio"),
            voice: voiceEnum.optional().describe("Voice to use (default: alloy)"),
            format: formatEnum.optional().describe("Audio format (default: mp3)"),
            voiceInstructions: z.string().optional().describe(
                "Additional instructions for voice style (e.g., 'Speak with enthusiasm')"
            ),
        },
        respondAudio,
    ],

    [
        "sayText",
        "Generate speech that says the provided text verbatim. Direct text-to-speech.",
        {
            text: z.string().describe("The text to speak verbatim"),
            voice: voiceEnum.optional().describe("Voice to use (default: alloy)"),
            format: formatEnum.optional().describe("Audio format (default: mp3)"),
            voiceInstructions: z.string().optional().describe(
                "Additional instructions for voice style"
            ),
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
            audioUrl: z.string().describe("URL of the audio file to transcribe"),
            prompt: z.string().optional().describe(
                "Custom transcription instructions (default: 'Transcribe this audio accurately')"
            ),
            model: z.string().optional().describe(
                "Model to use (default: 'gemini-large'). Also supports: gemini, openai-audio"
            ),
        },
        transcribeAudio,
    ],
];
