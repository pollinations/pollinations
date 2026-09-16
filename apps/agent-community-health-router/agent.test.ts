import assert from "node:assert/strict";
import test from "node:test";
import agent from "./agent.ts";

function catalogEntry(
    id: string,
    overrides: Record<string, unknown> = {},
): Record<string, unknown> {
    return {
        id,
        capabilities: [],
        input_modalities: ["text"],
        health: { status: "healthy", success_rate: 1 },
        ...overrides,
    };
}

function catalogResponse(entries: Record<string, unknown>[]) {
    return Response.json({ data: entries });
}

const CATALOG = [
    catalogEntry("community/chigwell/llm7-fast"),
    catalogEntry("community/chigwell/claude-haiku-4-5", {
        capabilities: ["tool_calling"],
    }),
    catalogEntry("community/chigwell/gemini-3.7-flash", {
        capabilities: ["tool_calling"],
        input_modalities: ["text", "image"],
    }),
    catalogEntry("community/chigwell/glm-5.3", {
        capabilities: ["tool_calling"],
    }),
];

function agentWithCatalog(
    entries: Record<string, unknown>[],
    onForward: (body: Record<string, unknown>) => Response,
) {
    const calls: string[] = [];
    return {
        calls,
        run: (body: Record<string, unknown>) =>
            agent({
                request: new Request("https://example.com/v1/responses", {
                    method: "POST",
                    body: JSON.stringify(body),
                }),
                pollinations: async (path, init) => {
                    calls.push(path);
                    if (path.startsWith("/v1/models"))
                        return catalogResponse(entries);
                    assert.equal(path, "/v1/responses");
                    return onForward(JSON.parse(init?.body as string));
                },
            }),
    };
}

test("plain text request routes to the first healthy community model", async () => {
    let forwarded: Record<string, unknown> | undefined;
    const { run } = agentWithCatalog(CATALOG, (body) => {
        forwarded = body;
        return Response.json({ ok: true });
    });

    const result = await run({ input: "Summarize this in one line." });

    assert.equal(forwarded?.model, "community/chigwell/llm7-fast");
    assert.equal(
        result.headers.get("x-pollinations-router-model"),
        "community/chigwell/llm7-fast",
    );
    assert.match(
        result.headers.get("x-pollinations-router-reason") ?? "",
        /healthy free community model/,
    );
});

test("a request with tools skips candidates without tool_calling", async () => {
    let forwarded: Record<string, unknown> | undefined;
    const { run } = agentWithCatalog(CATALOG, (body) => {
        forwarded = body;
        return Response.json({ ok: true });
    });

    await run({
        input: "Look up the weather.",
        tools: [{ type: "function", name: "get_weather" }],
    });

    assert.equal(forwarded?.model, "community/chigwell/claude-haiku-4-5");
});

test("a request with image input skips candidates without image support", async () => {
    let forwarded: Record<string, unknown> | undefined;
    const { run } = agentWithCatalog(CATALOG, (body) => {
        forwarded = body;
        return Response.json({ ok: true });
    });

    await run({
        input: [
            {
                role: "user",
                content: [
                    {
                        type: "input_image",
                        image_url: "https://example.com/a.png",
                    },
                ],
            },
        ],
    });

    assert.equal(forwarded?.model, "community/chigwell/gemini-3.7-flash");
});

test("degraded and down candidates are skipped with the reason recorded", async () => {
    const catalog = [
        catalogEntry("community/chigwell/llm7-fast", {
            health: { status: "down", success_rate: 0.4 },
        }),
        catalogEntry("community/chigwell/claude-haiku-4-5", {
            health: { status: "degraded", success_rate: 0.8 },
        }),
        catalogEntry("community/chigwell/gemini-3.7-flash"),
    ];
    let forwarded: Record<string, unknown> | undefined;
    const { run } = agentWithCatalog(catalog, (body) => {
        forwarded = body;
        return Response.json({ ok: true });
    });

    const result = await run({ input: "Hello" });

    assert.equal(forwarded?.model, "community/chigwell/gemini-3.7-flash");
    const reason = result.headers.get("x-pollinations-router-reason") ?? "";
    assert.match(reason, /llm7-fast \(down\)/);
    assert.match(reason, /claude-haiku-4-5 \(degraded\)/);
});

test("falls back to the paid model when no community candidate is healthy", async () => {
    const catalog = CATALOG.map((entry) => ({
        ...entry,
        health: { status: "down", success_rate: 0.3 },
    }));
    let forwarded: Record<string, unknown> | undefined;
    const { run } = agentWithCatalog(catalog, (body) => {
        forwarded = body;
        return Response.json({ ok: true });
    });

    const result = await run({ input: "Hello" });

    assert.equal(forwarded?.model, "openai/gpt-5.4-nano");
    assert.match(
        result.headers.get("x-pollinations-router-reason") ?? "",
        /no healthy free community model available/,
    );
});

test("streams the upstream body through unchanged", async () => {
    const stream = new ReadableStream({
        start(controller) {
            controller.enqueue(new TextEncoder().encode("chunk"));
            controller.close();
        },
    });
    const { run } = agentWithCatalog(CATALOG, () => new Response(stream));

    const result = await run({ input: "Hello" });
    const text = await result.text();

    assert.equal(text, "chunk");
});
