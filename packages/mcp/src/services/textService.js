import { z } from "zod";
import { requireApiKey } from "../utils/authUtils.js";
import {
    API_BASE_URL,
    createMCPResponse,
    createTextContent,
    fetchJsonWithAuth,
    postChatCompletion,
} from "../utils/coreUtils.js";

async function chatCompletion(params) {
    requireApiKey();
    const response = await postChatCompletion(params);
    return createMCPResponse([createTextContent(await response.json(), true)]);
}

async function listModels() {
    return createMCPResponse([
        createTextContent(
            await fetchJsonWithAuth(`${API_BASE_URL}/models`),
            true,
        ),
    ]);
}

const messageSchema = z
    .object({
        role: z.string().describe("Message role"),
        content: z.any().optional().describe("Text or multimodal content"),
    })
    .passthrough();

const chatParamsSchema = z
    .object({
        messages: z
            .array(messageSchema)
            .min(1)
            .describe("Conversation messages"),
        model: z
            .string()
            .optional()
            .describe(
                "Text model or alias. Omit for the Gen default; use listModels for the live registry.",
            ),
        temperature: z.number().optional(),
        max_tokens: z.number().optional(),
        tools: z.array(z.any()).optional(),
        tool_choice: z.any().optional(),
    })
    .passthrough();

export const textTools = [
    [
        "chatCompletion",
        "Proxy an OpenAI-compatible chat completion through Gen and return its raw JSON response.",
        chatParamsSchema,
        chatCompletion,
    ],
    [
        "listModels",
        "Return the live Gen registry for all text, image, video, audio, realtime, embedding, and 3D models.",
        {},
        listModels,
    ],
];
