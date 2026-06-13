import { Agent, run, tool } from "@openai/agents";
import OpenAI from "openai";
import { z } from "zod";
import {
    buildComicImageUrl,
    CAT_SYSTEM,
    generateCatReply,
} from "../../../core/index.ts";

const POLLINATIONS_BASE = "https://gen.pollinations.ai/v1";

export function makeOpenAIClient(apiKey?: string) {
    return new OpenAI({
        baseURL: POLLINATIONS_BASE,
        apiKey: apiKey ?? "anonymous",
    });
}

const catReplyTool = tool({
    name: "cat_reply",
    description:
        "Generate the cat's terse 2-8 word reply to a user question. Use this for every user turn.",
    parameters: z.object({
        question: z.string(),
        image_url: z.string().optional(),
    }),
    execute: async ({ question, image_url }, ctx) => {
        const apiKey = (ctx?.context as { apiKey?: string } | undefined)
            ?.apiKey;
        return generateCatReply(question, image_url ?? null, { apiKey });
    },
});

const comicTool = tool({
    name: "comic_url",
    description:
        "Build the URL for the CatGPT webcomic image given the question and the cat's reply.",
    parameters: z.object({
        question: z.string(),
        reply: z.string(),
        image_url: z.string().optional(),
    }),
    execute: async ({ question, reply, image_url }, ctx) => {
        const apiKey = (ctx?.context as { apiKey?: string } | undefined)
            ?.apiKey;
        return buildComicImageUrl(question, reply, image_url ?? null, {
            apiKey,
        });
    },
});

export const catgptAgent = new Agent({
    name: "CatGPT",
    instructions: CAT_SYSTEM,
    model: "claude-fast",
    tools: [catReplyTool, comicTool],
});

export async function ask(
    question: string,
    imageUrl?: string,
    apiKey?: string,
) {
    const result = await run(
        catgptAgent,
        [
            {
                role: "user",
                content: imageUrl
                    ? `${question}\n\n[image: ${imageUrl}]`
                    : question,
            },
        ],
        {
            context: { apiKey, imageUrl },
            // Inject our OpenAI client so the SDK calls Pollinations, not OpenAI.
            model: makeOpenAIClient(apiKey),
        } as any,
    );
    return result.finalOutput;
}
