import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const ORIGIN = "https://vision-check-mcp.pollinations.ai";
const TOKEN = "sk_test_request_scoped";
const EXPECTED_TOOLS = ["compare_images", "inspect_ui"];

async function connectClient(options = {}, env = undefined) {
    const client = new Client(
        { name: "vision-check-mcp-worker-test", version: "0.0.1" },
        { capabilities: {}, ...options },
    );
    await client.connect(
        new StreamableHTTPClientTransport(new URL(ORIGIN), {
            fetch: (input, init) =>
                worker.fetch(
                    input instanceof Request ? input : new Request(input, init),
                    env,
                ),
            requestInit: {
                headers: {
                    Authorization: `Bearer ${TOKEN}`,
                    Cookie: "session=private",
                },
            },
        }),
    );
    return client;
}

test("serves health, requires bearer auth, and rejects unknown paths and batches", async () => {
    const health = await worker.fetch(new Request(`${ORIGIN}/health`));
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), {
        status: "ok",
        service: "vision-check-mcp",
        endpoint: "/",
    });

    for (const authorization of [null, "Basic abc", "Bearer", "Bearer a b"]) {
        const headers = authorization ? { authorization } : {};
        const response = await worker.fetch(new Request(ORIGIN, { headers }));
        assert.equal(response.status, 401);
        assert.equal(
            response.headers.get("www-authenticate"),
            'Bearer realm="vision-check-mcp.pollinations.ai"',
        );
    }

    const notFound = await worker.fetch(new Request(`${ORIGIN}/other`));
    assert.equal(notFound.status, 404);

    const batch = await worker.fetch(
        new Request(ORIGIN, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${TOKEN}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify([
                { jsonrpc: "2.0", id: 1, method: "tools/list" },
            ]),
        }),
    );
    assert.equal(batch.status, 400);
});

test("exposes read-only vision tools over modern and legacy stateless HTTP", async () => {
    for (const options of [{ versionNegotiation: { mode: "auto" } }, {}]) {
        const client = await connectClient(options);
        try {
            assert.equal(
                client.getProtocolEra(),
                options.versionNegotiation ? "modern" : "legacy",
            );
            const { tools } = await client.listTools();
            assert.deepEqual(
                tools.map(({ name }) => name).sort(),
                EXPECTED_TOOLS,
            );
            for (const tool of tools) {
                assert.equal(tool.annotations.readOnlyHint, true);
            }
        } finally {
            await client.close();
        }
    }
});

test("inspect_ui sends structured json_schema vision request with caller bearer token", async (t) => {
    const inspectionPayload = {
        passed: false,
        score: 78,
        summary:
            "Dark mode dashboard renders cleanly except for mobile card overflow.",
        checks: [
            {
                check: "Readable contrast in dark mode",
                passed: true,
                detail: "Primary text and badges have high contrast against #0f172a.",
            },
            {
                check: "No horizontal overflow on mobile",
                passed: false,
                detail: "Action toolbar overflows 32px past the right viewport edge.",
            },
        ],
        issues: [
            {
                severity: "medium",
                area: "Header action bar",
                issue: "Buttons do not wrap on 375px width.",
                fix: "Add flex-wrap: wrap and min-width: 0 to the action container.",
            },
        ],
    };

    t.mock.method(globalThis, "fetch", async (input, init) => {
        const req = new Request(input, init);
        assert.equal(
            req.url,
            "https://staging.gen.pollinations.ai/v1/chat/completions",
        );
        assert.equal(req.method, "POST");
        assert.equal(req.headers.get("authorization"), `Bearer ${TOKEN}`);
        assert.equal(req.headers.has("cookie"), false);

        const body = await req.json();
        assert.equal(body.model, "openai");
        assert.equal(body.temperature, 0);
        assert.equal(body.response_format.type, "json_schema");
        assert.equal(body.response_format.json_schema.name, "ui_inspection");
        assert.equal(body.response_format.json_schema.strict, true);
        assert.equal(body.messages.length, 2);
        assert.equal(body.messages[1].content.length, 3);
        assert.equal(
            body.messages[1].content[1].image_url.url,
            "https://media.pollinations.ai/candidate.png",
        );
        assert.equal(
            body.messages[1].content[2].image_url.url,
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        );

        return Response.json({
            id: "chatcmpl-test",
            model: "openai",
            choices: [
                {
                    message: {
                        role: "assistant",
                        content: JSON.stringify(inspectionPayload),
                    },
                },
            ],
        });
    });

    const client = await connectClient(
        { versionNegotiation: { mode: "auto" } },
        { POLLINATIONS_BASE_URL: "https://staging.gen.pollinations.ai/" },
    );
    t.after(() => client.close());

    const result = await client.callTool({
        name: "inspect_ui",
        arguments: {
            imageUrl: "https://media.pollinations.ai/candidate.png",
            referenceImageUrl:
                "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
            goal: "My Apps dashboard in dark mode on a 375px screen",
            checks: [
                "Readable contrast in dark mode",
                "No horizontal overflow on mobile",
            ],
        },
    });

    assert.notEqual(result.isError, true);
    assert.deepEqual(JSON.parse(result.content[0].text), {
        model: "openai",
        ...inspectionPayload,
    });
});

test("compare_images evaluates before and after images and maps errors cleanly", async (t) => {
    const comparisonPayload = {
        matchScore: 92,
        verdict: "improved",
        summary:
            "Card spacing and button wrapping were fixed without regressions.",
        differences: [
            {
                area: "Action bar",
                change: "Buttons now wrap cleanly onto two rows.",
                impact: "improvement",
            },
        ],
    };

    let status = 200;
    t.mock.method(globalThis, "fetch", async (input, init) => {
        const req = new Request(input, init);
        assert.equal(
            req.url,
            "https://gen.pollinations.ai/v1/chat/completions",
        );
        if (status !== 200) {
            return Response.json(
                { error: { message: "Insufficient Pollen balance" } },
                { status },
            );
        }
        const body = await req.json();
        assert.equal(body.model, "gemini-fast");
        assert.equal(body.response_format.json_schema.name, "image_comparison");
        return Response.json({
            model: "gemini-fast",
            choices: [
                {
                    message: {
                        content: `\`\`\`json\n${JSON.stringify(comparisonPayload)}\n\`\`\``,
                    },
                },
            ],
        });
    });

    const client = await connectClient();
    t.after(() => client.close());

    const okResult = await client.callTool({
        name: "compare_images",
        arguments: {
            beforeImageUrl: "https://media.pollinations.ai/before.png",
            afterImageUrl: "https://media.pollinations.ai/after.png",
            focus: "Verify mobile button wrapping fix",
            model: "gemini-fast",
        },
    });
    assert.notEqual(okResult.isError, true);
    assert.deepEqual(JSON.parse(okResult.content[0].text), {
        model: "gemini-fast",
        ...comparisonPayload,
    });

    const invalidScheme = await client.callTool({
        name: "inspect_ui",
        arguments: {
            imageUrl: "http://insecure.example.com/screen.png",
            goal: "Check header",
        },
    });
    assert.equal(invalidScheme.isError, true);
    assert.match(
        invalidScheme.content[0].text,
        /only https:\/\/ URLs or data:image/,
    );

    status = 402;
    const balanceError = await client.callTool({
        name: "compare_images",
        arguments: {
            beforeImageUrl: "https://media.pollinations.ai/before.png",
            afterImageUrl: "https://media.pollinations.ai/after.png",
        },
    });
    assert.equal(balanceError.isError, true);
    assert.match(balanceError.content[0].text, /Insufficient Pollen balance/);
});
