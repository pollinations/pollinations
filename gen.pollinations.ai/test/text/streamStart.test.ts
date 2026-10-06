import { afterEach, describe, expect, it, vi } from "vitest";
import { withModelFallback } from "../../src/fallback.ts";
import { acceptStreamStart } from "../../src/text/streamStart.ts";

const url = new URL("https://provider.test/v1/responses");
const encoder = new TextEncoder();
const error =
    'data: {"error":{"code":"rate_limit_exceeded","message":"Capacity exhausted"}}\n\n';
const created =
    'event: response.created\ndata: {"type":"response.created","response":{"id":"failed-id"}}\n\n';
const output = 'data: {"choices":[{"delta":{"content":"🌼"}}]}\n\n';

afterEach(() => vi.useRealTimers());

function source(text: string, split = 1, cancel = () => {}) {
    const bytes = encoder.encode(text);
    return new Response(
        new ReadableStream<Uint8Array<ArrayBuffer>>({
            start(controller) {
                controller.enqueue(bytes.slice(0, split));
                controller.enqueue(bytes.slice(split));
                controller.close();
            },
            cancel,
        }),
        { headers: { "Content-Type": "text/event-stream" } },
    );
}

describe("stream startup fallback", () => {
    it.each([
        "",
        ': OPENROUTER PROCESSING\n\ndata: keepalive\n\ndata: {"choices":[{"delta":{"role":"assistant"}}]}\n\n',
    ])("hands off a slow stream after two seconds and keeps its pending read (%j)", async (prefix) => {
        vi.useFakeTimers();
        let controller!: ReadableStreamDefaultController<
            Uint8Array<ArrayBuffer>
        >;
        let cancelled = false;
        const response = new Response(
            new ReadableStream({
                start(c) {
                    controller = c;
                    if (prefix) c.enqueue(encoder.encode(prefix));
                },
                cancel() {
                    cancelled = true;
                },
            }),
        );
        let handedOff = false;
        const started = acceptStreamStart(response, url, "chat").then(
            (body) => {
                handedOff = true;
                return body;
            },
        );
        await vi.advanceTimersByTimeAsync(1999);
        expect(handedOff).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        const body = new Response(await started).text();
        expect(handedOff).toBe(true);
        expect(cancelled).toBe(false);
        controller.enqueue(encoder.encode(output + error));
        controller.close();
        expect(await body).toBe(prefix + output + error);
    });

    it("still cancels the upstream pending read after the startup window expires", async () => {
        vi.useFakeTimers();
        let cancelled = false;
        const response = new Response(
            new ReadableStream({
                cancel() {
                    cancelled = true;
                },
            }),
        );
        const started = acceptStreamStart(response, url, "responses");
        await vi.advanceTimersByTimeAsync(2000);
        await (await started).cancel();
        expect(cancelled).toBe(true);
    });

    it("preserves non-JSON keepalives without hiding a subsequent startup error", async () => {
        const prefix =
            ': OPENROUTER PROCESSING\n\ndata: ping\n\ndata: "keepalive"\n\n';
        expect(
            await new Response(
                await acceptStreamStart(source(prefix + output), url, "chat"),
            ).text(),
        ).toBe(prefix + output);
        await expect(
            acceptStreamStart(source(prefix + error), url, "chat"),
        ).rejects.toMatchObject({ status: 502 });
    });

    it.each([
        "error",
        "response.failed",
    ])("does not retry Responses input errors from %s", async (type) => {
        for (const code of ["context_length_exceeded", "invalid_prompt"]) {
            const attempts: Parameters<typeof withModelFallback>[2] = [];
            const error = { code, message: "Input rejected" };
            const event =
                type === "error"
                    ? { type, ...error }
                    : { type, response: { error } };
            await expect(
                withModelFallback(
                    [{ id: "primary" }, { id: "fallback" }],
                    async () =>
                        acceptStreamStart(
                            source(
                                `event: ${type}\ndata: ${JSON.stringify(event)}\n\n`,
                            ),
                            url,
                            "responses",
                        ),
                    attempts,
                ),
            ).rejects.toMatchObject({ status: 400 });
            expect(attempts).toHaveLength(1);
        }
    });

    it("rejects an initial content filter without retrying another provider", async () => {
        const attempts: Parameters<typeof withModelFallback>[2] = [];
        await expect(
            withModelFallback(
                [{ id: "primary" }, { id: "fallback" }],
                async () =>
                    acceptStreamStart(
                        source(
                            'data: {"choices":[{"delta":{},"finish_reason":"content_filter"}]}\n\n',
                        ),
                        url,
                        "chat",
                    ),
                attempts,
            ),
        ).rejects.toMatchObject({ status: 422 });
        expect(attempts).toHaveLength(1);
    });
    it("records exhausted alternatives when both streams fail before output", async () => {
        const attempts: Parameters<typeof withModelFallback>[2] = [];
        await expect(
            withModelFallback(
                [{ id: "primary" }, { id: "fallback" }],
                async () => acceptStreamStart(source(error), url, "chat"),
                attempts,
            ),
        ).rejects.toMatchObject({ status: 502 });
        expect(attempts).toMatchObject([
            { settled: false, candidate: { id: "primary" } },
            {
                settled: true,
                candidate: { id: "fallback" },
                error: { status: 502 },
            },
        ]);
    });
    it.each([
        "chat",
        "responses",
    ] as const)("retries an HTTP-200 %s startup error and records both attempts", async (protocol) => {
        const attempts: Parameters<typeof withModelFallback>[2] = [];
        const prefix =
            protocol === "responses"
                ? created
                : 'data: {"choices":[{"delta":{"role":"assistant"}}]}\n\n';
        const success =
            protocol === "responses"
                ? 'data: {"type":"response.output_text.delta","delta":"🌼"}\n\n'
                : output;
        const { result, candidate } = await withModelFallback(
            [{ id: "primary" }, { id: "fallback" }],
            async (candidate) =>
                acceptStreamStart(
                    source(
                        candidate.id === "primary" ? prefix + error : success,
                    ),
                    url,
                    protocol,
                ),
            attempts,
        );
        expect(candidate.id).toBe("fallback");
        expect(await new Response(result).text()).toBe(success);
        expect(attempts).toMatchObject([
            {
                settled: false,
                error: { status: 502, upstreamStatus: 200, requestUrl: url },
            },
            { settled: true, candidate: { id: "fallback" } },
        ]);
    });

    it.each([
        "\n",
        "\r\n",
        "\r",
    ])("preserves bytes at every UTF-8/chunk split with %j endings", async (newline) => {
        const input = (output + error).replaceAll("\n", newline);
        for (let split = 1; split < encoder.encode(input).length; split++) {
            expect(
                await new Response(
                    await acceptStreamStart(source(input, split), url, "chat"),
                ).text(),
            ).toBe(input);
        }
    });

    it.each([
        'data: {"choices":[{"delta":{"reasoning_content":"thinking"}}]}\n\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1"}]}}]}\n\n',
    ])("never retries after reasoning or tool output", async (prefix) => {
        const attempts: Parameters<typeof withModelFallback>[2] = [];
        const { result } = await withModelFallback(
            [{ id: "primary" }, { id: "fallback" }],
            async () => acceptStreamStart(source(prefix + error), url, "chat"),
            attempts,
        );
        expect(await new Response(result).text()).toBe(prefix + error);
        expect(attempts).toHaveLength(1);
    });

    it.each([
        "response.output_item.added",
        "response.web_search_call.in_progress",
        "response.mcp_call.in_progress",
    ])("commits Responses before %s can be replayed", async (type) => {
        const input =
            created +
            `data: ${JSON.stringify({ type, item: { type: "reasoning" } })}\n\n` +
            error;
        expect(
            await new Response(
                await acceptStreamStart(source(input), url, "responses"),
            ).text(),
        ).toBe(input);
    });

    it.each([
        { type: "invalid_request_error", message: "Bad input" },
        { message: "content policy violation" },
    ])("does not fall back for input/policy errors", async (error) => {
        const attempts: Parameters<typeof withModelFallback>[2] = [];
        await expect(
            withModelFallback(
                [{ id: "primary" }, { id: "fallback" }],
                async () =>
                    acceptStreamStart(
                        source(`data: ${JSON.stringify({ error })}\n\n`),
                        url,
                        "chat",
                    ),
                attempts,
            ),
        ).rejects.toBeInstanceOf(Error);
        expect(attempts).toHaveLength(1);
    });

    it("cancels a failed open stream before retrying", async () => {
        let cancelled = false;
        const response = new Response(
            new ReadableStream({
                start(controller) {
                    controller.enqueue(encoder.encode(error));
                },
                cancel() {
                    cancelled = true;
                },
            }),
        );
        await expect(
            acceptStreamStart(response, url, "chat"),
        ).rejects.toMatchObject({ status: 502 });
        expect(cancelled).toBe(true);
    });

    it("fails an empty startup instead of returning a successful body", async () => {
        await expect(
            acceptStreamStart(source(created), url, "responses"),
        ).rejects.toMatchObject({ status: 502 });
    });
});
