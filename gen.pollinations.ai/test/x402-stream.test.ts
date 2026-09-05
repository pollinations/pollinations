import { describe, expect, it } from "vitest";
import {
    collectX402Stream,
    MAX_X402_RESPONSE_BYTES,
    X402_STREAM_DONE,
    X402LiveStream,
    x402StreamReceipt,
} from "../src/utils/x402-stream.ts";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const headers = {
    "content-type": "text/event-stream; charset=utf-8",
    "x-model-used": "openai",
};
const event = (data: unknown) => `data: ${JSON.stringify(data)}\n\n`;
const delta = event({ choices: [{ delta: { content: "🧶" } }] });
const usage = event({
    choices: [],
    usage: { prompt_tokens: 10, completion_tokens: 0, total_tokens: 10 },
});

describe("x402 streaming", () => {
    it("delivers chunks before usage and settlement, survives cancellation and replays the prefix", async () => {
        let upstream!: ReadableStreamDefaultController<Uint8Array>;
        const response = new Response(
            new ReadableStream({
                start(controller) {
                    upstream = controller;
                },
            }),
            { headers },
        );
        const live = new X402LiveStream(response.headers);
        const first = live.response().body?.getReader();
        if (!first) throw new Error("Missing live response body");
        let collected = false;
        const pending = collectX402Stream(
            response,
            () => (chunk) => live.write(chunk),
        ).then((result) => {
            collected = true;
            return result;
        });

        // Exercise UTF-8 and SSE framing across individual bytes.
        for (const byte of encoder.encode(delta.replaceAll("\n", "\r\n"))) {
            upstream.enqueue(new Uint8Array([byte]));
        }
        expect(decoder.decode((await first.read()).value)).toBe(delta);
        expect(collected).toBe(false);
        await first.cancel();

        const rejoined = live.response().body?.getReader();
        if (!rejoined) throw new Error("Missing replay response body");
        expect(decoder.decode((await rejoined.read()).value)).toBe(delta);
        upstream.enqueue(encoder.encode(usage + X402_STREAM_DONE));
        upstream.close();
        const metered = await pending;
        expect(metered.headers.get("x-usage-prompt-text-tokens")).toBe("10");
        expect(metered.headers.get("x-usage-completion-text-tokens")).toBe("0");
        expect(await metered.text()).toBe(delta + usage + X402_STREAM_DONE);
        expect(decoder.decode((await rejoined.read()).value)).toBe(usage);

        let terminalReceived = false;
        const terminal = rejoined.read().then((chunk) => {
            terminalReceived = true;
            return chunk;
        });
        await Promise.resolve();
        expect(terminalReceived).toBe(false);
        live.finish(
            new Response(null, {
                headers: { "payment-response": "encoded-receipt" },
            }),
        );
        const receipt = x402StreamReceipt("encoded-receipt");
        expect((await terminal).value).toEqual(receipt);
        expect((await rejoined.read()).done).toBe(true);
        expect(await live.response().text()).toBe(
            delta + usage + decoder.decode(receipt),
        );
    });

    it("does not report success when settlement fails after content was delivered", async () => {
        const live = new X402LiveStream(new Headers(headers));
        live.write(encoder.encode(delta));
        live.finish(new Response("facilitator unavailable", { status: 503 }));
        const text = await live.response().text();
        expect(text).toContain(delta);
        expect(text).toContain("payment_incomplete");
        expect(text).not.toContain("[DONE]");
        expect(text).not.toContain("x402.payment");
    });

    it.each([
        ["missing usage", delta + X402_STREAM_DONE],
        ["missing done", delta + usage],
        [
            "invalid usage",
            event({ usage: { prompt_tokens: -1 } }) + X402_STREAM_DONE,
        ],
        ["malformed JSON", `data: not-json\n\n${X402_STREAM_DONE}`],
        [
            "provider error after usage",
            usage + event({ error: { message: "failed" } }) + X402_STREAM_DONE,
        ],
        ["events after done", usage + X402_STREAM_DONE + delta],
        [
            "named error event",
            `${usage}event: error\ndata: {"message":"failed"}\n\n${X402_STREAM_DONE}`,
        ],
    ])("rejects %s before handing a response to settlement", async (_name, text) => {
        const published: Uint8Array[] = [];
        await expect(
            collectX402Stream(
                new Response(text, { headers }),
                () => (chunk) => published.push(chunk),
            ),
        ).rejects.toThrow();
        expect(
            published.map((chunk) => decoder.decode(chunk)).join(""),
        ).not.toContain("[DONE]");
    });

    it("enforces the body bound even for an unterminated SSE event", async () => {
        await expect(
            collectX402Stream(
                new Response(new Uint8Array(MAX_X402_RESPONSE_BYTES + 1), {
                    headers,
                }),
            ),
        ).rejects.toThrow("replay limit");
    });

    it("requires the authoritative served-model header before opening the stream", async () => {
        let opened = false;
        await expect(
            collectX402Stream(
                new Response(usage + X402_STREAM_DONE, {
                    headers: { "content-type": "text/event-stream" },
                }),
                () => {
                    opened = true;
                    return () => {};
                },
            ),
        ).rejects.toThrow("metered chat stream");
        expect(opened).toBe(false);
    });
});
