import { z } from "zod";
import { BASE_URL, ENTER_URL, resolveApiKey } from "../lib/config.js";
import { POLLINATIONS_KNOWLEDGE } from "./knowledge.js";

type McpContent = { type: "text"; text: string };
type McpResult = { content: McpContent[] };

const textResult = (data: unknown): McpResult => ({
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
});

const authFetch = async (url: string, init?: RequestInit) => {
    const key = resolveApiKey();
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(init?.headers as Record<string, string>),
    };
    if (key) headers.Authorization = `Bearer ${key}`;
    return fetch(url, { ...init, headers });
};

const platformKnowledge = {
    name: "pollinations_knowledge",
    description:
        "Get comprehensive knowledge about the Pollinations.AI platform — architecture, API, models, tiers, pricing, auth, SDK, and more. Call this first to understand how Pollinations works.",
    schema: {
        topic: z
            .string()
            .optional()
            .describe(
                "Optional topic filter: api, models, tiers, auth, pricing, sdk, byop, image-params, architecture",
            ),
    },
    handler: async (params: { topic?: string }) => {
        if (!params.topic) return textResult(POLLINATIONS_KNOWLEDGE);

        const sections = POLLINATIONS_KNOWLEDGE.split("\n## ");
        const match = sections.find((s) =>
            s.toLowerCase().includes(params.topic?.toLowerCase()),
        );
        return textResult(match ? `## ${match}` : POLLINATIONS_KNOWLEDGE);
    },
};

const listModels = {
    name: "pollinations_list_models",
    description:
        "List available Pollinations models with pricing. Returns real-time data from the API.",
    schema: {
        type: z
            .enum(["text", "image", "all"])
            .default("all")
            .describe("Model type to list"),
    },
    handler: async (params: { type: string }) => {
        const results: Record<string, unknown> = {};
        if (params.type === "all" || params.type === "image") {
            results.image = await authFetch(`${BASE_URL}/image/models`).then(
                (r) => r.json(),
            );
        }
        if (params.type === "all" || params.type === "text") {
            results.text = await authFetch(`${BASE_URL}/v1/models`).then((r) =>
                r.json(),
            );
        }
        return textResult(results);
    },
};

const generateText = {
    name: "pollinations_generate_text",
    description:
        "Generate text using Pollinations API (OpenAI-compatible). Supports all text models.",
    schema: {
        prompt: z.string().describe("The text prompt"),
        model: z.string().default("openai").describe("Model name"),
        system: z.string().optional().describe("Optional system message"),
    },
    handler: async (params: {
        prompt: string;
        model: string;
        system?: string;
    }) => {
        const messages = [];
        if (params.system)
            messages.push({ role: "system", content: params.system });
        messages.push({ role: "user", content: params.prompt });

        const res = await authFetch(`${BASE_URL}/v1/chat/completions`, {
            method: "POST",
            body: JSON.stringify({ model: params.model, messages }),
        });

        if (!res.ok)
            throw new Error(`API error: ${res.status} ${res.statusText}`);
        const data = await res.json();
        return textResult(data);
    },
};

const generateImage = {
    name: "pollinations_generate_image",
    description:
        "Generate an image and return the URL. Supports all image models.",
    schema: {
        prompt: z.string().describe("Image description"),
        model: z.string().default("flux").describe("Image model"),
        width: z.number().default(1024).describe("Width in pixels"),
        height: z.number().default(1024).describe("Height in pixels"),
    },
    handler: async (params: {
        prompt: string;
        model: string;
        width: number;
        height: number;
    }) => {
        const qs = new URLSearchParams({
            model: params.model,
            width: String(params.width),
            height: String(params.height),
        });
        const key = resolveApiKey();
        if (key) qs.set("key", key);

        const url = `${BASE_URL}/image/${encodeURIComponent(params.prompt)}?${qs}`;
        return textResult({ url, model: params.model });
    },
};

const checkAccount = {
    name: "pollinations_account",
    description:
        "Check your Pollinations account — profile, balance, tier, and usage.",
    schema: {
        info: z
            .enum(["profile", "balance", "usage", "all"])
            .default("all")
            .describe("What account info to fetch"),
    },
    handler: async (params: { info: string }) => {
        if (!resolveApiKey()) {
            return textResult({
                error: "No API key configured. Use polli auth login --token <key>",
            });
        }

        const fetchJson = async (path: string) => {
            const res = await authFetch(`${ENTER_URL}${path}`);
            return res.ok ? await res.json() : undefined;
        };

        const results: Record<string, unknown> = {};
        if (params.info === "all" || params.info === "profile") {
            results.profile = await fetchJson("/api/account/profile");
        }
        if (params.info === "all" || params.info === "balance") {
            results.balance = await fetchJson("/api/account/balance");
        }
        if (params.info === "usage") {
            results.usage = await fetchJson("/api/account/usage?limit=10");
        }
        return textResult(results);
    },
};

const webSearch = {
    name: "pollinations_web_search",
    description:
        "Search the web using Pollinations-powered search models (perplexity, gemini-search).",
    schema: {
        query: z.string().describe("Search query"),
        engine: z
            .enum(["perplexity-fast", "perplexity-reasoning", "gemini-search"])
            .default("perplexity-fast")
            .describe("Search engine model"),
    },
    handler: async (params: { query: string; engine: string }) => {
        const res = await authFetch(`${BASE_URL}/v1/chat/completions`, {
            method: "POST",
            body: JSON.stringify({
                model: params.engine,
                messages: [{ role: "user", content: params.query }],
            }),
        });

        if (!res.ok) throw new Error(`Search error: ${res.status}`);
        const data = await res.json();
        return textResult(data);
    },
};

const keyInfo = {
    name: "pollinations_key_info",
    description:
        "Check current API key details — type, permissions, budget, expiry.",
    schema: {},
    handler: async () => {
        const key = resolveApiKey();
        if (!key) {
            return textResult({
                error: "No API key set. Use polli auth login --token <key>",
            });
        }

        const res = await authFetch(`${ENTER_URL}/api/account/key`);
        if (!res.ok) return textResult({ error: `API returned ${res.status}` });
        return textResult(await res.json());
    },
};

/** All Polly MCP tools exported as tuples matching @modelcontextprotocol/sdk format */
export const pollyTools = [
    platformKnowledge,
    listModels,
    generateText,
    generateImage,
    checkAccount,
    webSearch,
    keyInfo,
];
