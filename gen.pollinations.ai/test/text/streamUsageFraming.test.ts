import { describe, expect, it } from "vitest";
import { requireChatStreamUsage } from "../../src/text/chat/usage.js";
import { requireResponsesStreamUsage } from "../../src/text/responses/stream.js";

const encoder = new TextEncoder();
const delta = 'data: {"choices":[{"delta":{"content":"🌼"}}]}\n\n';
const chatUsage =
    'data: {"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}\n\n';
const responseDelta =
    'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"🌼"}\n\n';
const responseUsage =
    'event: response.completed\ndata: {"type":"response.completed","response":{"status":"completed","model":"test","usage":{"input_tokens":1,"output_tokens":1,"total_tokens":2}}}\n\n';

function splitStream(bytes: Uint8Array<ArrayBuffer>, split: number) {
    return new ReadableStream<Uint8Array<ArrayBuffer>>({
        start(controller) {
            controller.enqueue(bytes.slice(0, split));
            controller.enqueue(bytes.slice(split));
            controller.close();
        },
    });
}

describe.each([
    ["Chat", requireChatStreamUsage, delta, `${chatUsage}data: [DONE]\n\n`],
    ["Responses", requireResponsesStreamUsage, responseDelta, responseUsage],
] as const)("%s stream usage framing", (_name, validate, content, terminal) => {
    it.each([
        "\n",
        "\r\n",
        "\r",
    ])("preserves healthy SSE bytes with %j line endings at every chunk split", async (newline) => {
        const input = (content + terminal).replaceAll("\n", newline);
        const bytes = encoder.encode(input);
        for (let split = 1; split < bytes.length; split++) {
            expect(
                await new Response(validate(splitStream(bytes, split))).text(),
            ).toBe(input);
        }
    });

    it.each([
        "\n",
        "\r\n",
        "\r",
    ])("returns a complete error event with %j line endings at every chunk split", async (newline) => {
        const invalidTerminal =
            _name === "Chat"
                ? 'data: {"usage":{"prompt_tokens":1}}\n\ndata: [DONE]\n\n'
                : 'event: response.completed\ndata: {"type":"response.completed","response":{"status":"completed"}}\n\n';
        const prefix = content.replaceAll("\n", newline);
        const bytes = encoder.encode(
            prefix + invalidTerminal.replaceAll("\n", newline),
        );
        for (let split = 1; split < bytes.length; split++) {
            const output = await new Response(
                validate(splitStream(bytes, split)),
            ).text();
            expect(output.startsWith(prefix)).toBe(true);
            const events = output
                .split(/\r\n|\r|\n/)
                .filter((line) => line.startsWith("data:"))
                .map((line) => JSON.parse(line.slice(5)));
            // Chat forwards provisional usage and validates it at DONE;
            // Responses validates its terminal event before forwarding it.
            expect(events).toHaveLength(_name === "Chat" ? 3 : 2);
            const error = events.at(-1);
            expect(error.error?.code ?? error.code).toBe("usage_missing");
            expect(output).not.toContain("[DONE]");
        }
    });

    it("does not splice an error into a truncated terminal JSON event", async () => {
        const bytes = encoder.encode(`${content}data: {"id":"unfinished`);
        const output = await new Response(
            validate(splitStream(bytes, bytes.length - 3)),
        ).text();
        expect(output.startsWith(content)).toBe(true);
        expect(output).not.toContain("unfinished");
        const last = output
            .split("\n")
            .filter((line) => line.startsWith("data:"))
            .at(-1);
        const error = JSON.parse(last?.slice(5) ?? "");
        expect(error.error?.code ?? error.code).toBe("usage_missing");
    });

    it("preserves valid terminal usage closed by EOF", async () => {
        const input = content + terminal.trimEnd();
        const bytes = encoder.encode(input);
        expect(
            await new Response(
                validate(splitStream(bytes, bytes.length - 5)),
            ).text(),
        ).toBe(input);
    });
});
