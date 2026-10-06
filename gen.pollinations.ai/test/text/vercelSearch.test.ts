import { describe, expect, it } from "vitest";
import type {
    OpenAIClientConfig,
    TransformOptions,
} from "../../src/text/types.ts";
import { callVercelSearch } from "../../src/text/vercelSearch.ts";

const firstUsage = {
    prompt_tokens: 100,
    completion_tokens: 20,
    total_tokens: 120,
    cost: 0.007018,
    prompt_tokens_details: { cached_tokens: 40 },
    completion_tokens_details: { reasoning_tokens: 10 },
};
const lastUsage = {
    prompt_tokens: 80,
    completion_tokens: 15,
    total_tokens: 95,
    cost: 0.000011,
    prompt_tokens_details: { cached_tokens: 30 },
    completion_tokens_details: { reasoning_tokens: 5 },
};
const combined = {
    prompt_tokens: 180,
    completion_tokens: 35,
    total_tokens: 215,
    cost: 0.007029,
    prompt_tokens_details: { cached_tokens: 70 },
    completion_tokens_details: { reasoning_tokens: 15 },
};
const metadata = { gateway: { gatewayToolCalls: { exa_search: 1 } } };
const format = {
    type: "json_schema",
    json_schema: {
        name: "answer",
        schema: {
            type: "object",
            properties: { answer: { type: "string" } },
            required: ["answer"],
        },
    },
};
const options: TransformOptions = {
    model: "google/gemini-2.5-flash-lite",
    response_format: format,
    tools: [{ type: "vercel:exa_search" }],
    tool_choice: "required",
    max_tokens: 150,
};
const messages = [
    { role: "system" as const, content: "Answer in French." },
    { role: "user" as const, content: "Search the release notes." },
];
function completion(
    usage: unknown,
    content = "Search facts https://ai.google.dev",
    provider_metadata: unknown = metadata,
) {
    return {
        choices: [
            {
                index: 0,
                message: { role: "assistant", content, provider_metadata },
                finish_reason: "stop",
            },
        ],
        usage,
    };
}
function upstream(responses: Response[]) {
    const requests: Record<string, unknown>[] = [];
    const config: OpenAIClientConfig = {
        endpoint: "https://ai-gateway.vercel.sh/v1/chat/completions",
        fetcher: async (_input, init) => {
            requests.push(JSON.parse(String(init?.body)));
            const result = responses.shift();
            if (!result) throw new Error("Unexpected third call");
            return result;
        },
    };
    return { config, requests };
}
function sse(events: unknown[]) {
    const text = events
        .map(
            (e) => `data: ${typeof e === "string" ? e : JSON.stringify(e)}\n\n`,
        )
        .join("");
    const bytes = new TextEncoder().encode(text);
    return new Response(
        new ReadableStream({
            start(c) {
                for (let i = 0; i < bytes.length; i += 7)
                    c.enqueue(bytes.slice(i, i + 7));
                c.close();
            },
        }),
        { headers: { "content-type": "text/event-stream" } },
    );
}
describe("Vercel search then JSON formatting", () => {
    it("preserves instructions and format, sums actual charges/cached/reasoning tokens, and retains one search count", async () => {
        const { config, requests } = upstream([
            Response.json(completion(firstUsage)),
            Response.json(
                completion(lastUsage, '{"answer":"Bonjour"}', undefined),
            ),
        ]);
        const result = await callVercelSearch(messages, options, config);
        expect(result.usage).toEqual(combined);
        expect(result.choices?.[0].message?.provider_metadata).toEqual(
            metadata,
        );
        expect(requests[0]).toMatchObject({
            tools: options.tools,
            tool_choice: "required",
            stream: false,
            max_tokens: 2048,
        });
        expect(requests[0]).not.toHaveProperty("response_format");
        expect(requests[1]).toMatchObject({
            response_format: format,
            max_tokens: 150,
        });
        expect(requests[1]).not.toHaveProperty("tools");
        expect(requests[1]).not.toHaveProperty("tool_choice");
        expect((requests[1].messages as unknown[]).slice(0, 2)).toEqual(
            messages,
        );
    });
    it.each([
        {},
        { response_format: { type: "text" } },
        { ...options, tools: [] },
        { ...options, tool_choice: "none" },
    ])("uses one call for ordinary or opted-out requests %j", async (extra) => {
        const { config, requests } = upstream([
            Response.json(completion(lastUsage)),
        ]);
        await callVercelSearch(
            messages,
            { model: options.model, ...extra },
            config,
        );
        expect(requests).toHaveLength(1);
    });
    it.each([
        undefined,
        { ...firstUsage, cost: undefined },
        { ...firstUsage, cost: -1 },
    ])("stops before formatting when search usage or charge is invalid %j", async (usage) => {
        const { config, requests } = upstream([
            Response.json(completion(usage)),
        ]);
        await expect(
            callVercelSearch(messages, options, config),
        ).rejects.toThrow();
        expect(requests).toHaveLength(1);
    });
    it("rejects a formatting answer without usage", async () => {
        const { config } = upstream([
            Response.json(completion(firstUsage)),
            Response.json(completion(undefined)),
        ]);
        await expect(
            callVercelSearch(messages, options, config),
        ).rejects.toThrow("omitted usage");
    });
    it("passes through a search failure without a second call", async () => {
        const { config, requests } = upstream([
            Response.json(
                { error: { message: "Unavailable" } },
                { status: 503 },
            ),
        ]);
        await expect(
            callVercelSearch(messages, options, config),
        ).rejects.toThrow("Unavailable");
        expect(requests).toHaveLength(1);
    });
    it.each([
        false,
        true,
    ])("streams JSON with combined usage even when cost arrives late: %s", async (late) => {
        const { cost, ...tokens } = lastUsage;
        const events = [
            {
                choices: [
                    { index: 0, delta: { content: '{"answer":"Bonjour"}' } },
                ],
            },
            { choices: [], usage: late ? tokens : lastUsage },
            ...(late ? [{ choices: [], usage: { cost } }] : []),
            "[DONE]",
        ];
        const { config, requests } = upstream([
            Response.json(completion(firstUsage)),
            sse(events),
        ]);
        const result = await callVercelSearch(
            messages,
            { ...options, stream: true },
            config,
        );
        const text = await new Response(result.responseStream).text();
        const chunks = text
            .split("\n")
            .filter((l) => l.startsWith("data: ") && !l.includes("[DONE]"))
            .map((l) => JSON.parse(l.slice(6)));
        expect(chunks[0].choices[0].delta).toEqual({
            content: '{"answer":"Bonjour"}',
            provider_metadata: metadata,
        });
        expect(chunks.at(-1).usage).toEqual(combined);
        expect(text).toContain("data: [DONE]");
        expect(requests[0].stream).toBe(false);
        expect(requests[1].stream).toBe(true);
    });
    it.each([
        { events: [] },
        { events: [{ choices: [], usage: { cost: 0.01 } }] },
        { events: [{ choices: [], usage: { ...lastUsage, cost: undefined } }] },
    ])("fails a stream missing final token usage or charge %j", async ({
        events,
    }) => {
        const { config } = upstream([
            Response.json(completion(firstUsage)),
            sse([...events, "[DONE]"]),
        ]);
        const result = await callVercelSearch(
            messages,
            { ...options, stream: true },
            config,
        );
        await expect(
            new Response(result.responseStream).text(),
        ).rejects.toThrow();
    });
});
