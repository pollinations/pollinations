import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { formatTranscript, hardenContent } from "./content.js";
import type { HumanGateway, HumanReply } from "./discord.js";
import { HttpError, HumanService } from "./service.js";
import { ConversationStore } from "./store.js";
import { completionLimit, countTokens, truncateToTokens } from "./tokens.js";
import type { ChatCompletionRequest, ChatMessage } from "./types.js";

class FakeGateway implements HumanGateway {
    threads = 0;
    asks: Array<{ threadId: string; messages: ChatMessage[] }> = [];
    reply: HumanReply = { content: "A human answer", discordId: "123456789" };

    async createThread(): Promise<string> {
        this.threads += 1;
        return `thread-${this.threads}`;
    }

    async ask(threadId: string, messages: ChatMessage[]): Promise<HumanReply> {
        this.asks.push({ threadId, messages });
        return this.reply;
    }
}

const baseRequest = (
    overrides: Partial<ChatCompletionRequest> = {},
): ChatCompletionRequest => ({
    model: "humans",
    messages: [{ role: "user", content: "Hello humans" }],
    _pollinations: {
        caller: { id: "opaque-caller" },
    },
    ...overrides,
});

describe("HumanService", () => {
    let store: ConversationStore;
    let gateway: FakeGateway;
    let service: HumanService;

    beforeEach(() => {
        store = new ConversationStore(":memory:");
        gateway = new FakeGateway();
        service = new HumanService({
            apiToken: "secret",
            responseTimeoutMs: 1_000,
            store,
            gateway,
        });
    });

    afterEach(() => store.close());

    it("accepts the configured bearer token", () => {
        expect(() => service.authorize("Bearer secret")).not.toThrow();
    });

    it("rejects a missing or incorrect bearer token", () => {
        expect(() => service.authorize(undefined)).toThrowError(HttpError);
        expect(() => service.authorize("Bearer wrong")).toThrowError(HttpError);
    });

    it("returns an OpenAI-compatible response with internal responder metadata", async () => {
        const result = await service.complete(baseRequest());
        expect(result.object).toBe("chat.completion");
        expect(result.model).toBe("humans");
        expect(result.choices[0].message.content).toBe("A human answer");
        expect(result._pollinations.responder.discordId).toBe("123456789");
        expect(result.conversation_id).toBeTruthy();
    });

    it("rejects streaming", async () => {
        await expect(
            service.complete(baseRequest({ stream: true })),
        ).rejects.toMatchObject({
            status: 400,
        });
    });

    it("rejects non-text messages", async () => {
        const request = baseRequest();
        (request.messages[0] as unknown as { content: unknown }).content = [
            { type: "text" },
        ];
        await expect(service.complete(request)).rejects.toMatchObject({
            status: 400,
        });
    });

    it("requires trusted opaque caller metadata", async () => {
        await expect(
            service.complete({ ...baseRequest(), _pollinations: undefined }),
        ).rejects.toThrow("Trusted caller metadata is required");
    });

    it("reuses a conversation only for its caller", async () => {
        const first = await service.complete(baseRequest());
        await service.complete(
            baseRequest({
                conversation_id: first.conversation_id,
                messages: [
                    { role: "user", content: "Hello humans" },
                    { role: "assistant", content: "A human answer" },
                    { role: "user", content: "Continue" },
                ],
            }),
        );
        expect(gateway.threads).toBe(1);
        expect(gateway.asks[1].messages).toEqual([
            { role: "user", content: "Continue" },
        ]);

        await expect(
            service.complete({
                ...baseRequest({ conversation_id: first.conversation_id }),
                _pollinations: {
                    caller: { id: "different-caller" },
                },
            }),
        ).rejects.toMatchObject({ status: 404 });
    });

    it("truncates output according to the smallest completion limit", async () => {
        gateway.reply.content = "one two three four five six seven";
        const result = await service.complete(
            baseRequest({ max_tokens: 5, max_completion_tokens: 2 }),
        );
        expect(result.usage.completion_tokens).toBe(2);
        expect(result.choices[0].finish_reason).toBe("length");
    });
});

describe("token accounting", () => {
    it("uses cl100k_base tokenization", () => {
        expect(countTokens("hello world")).toBe(2);
    });

    it("selects the lower positive completion limit", () => {
        expect(
            completionLimit({ max_tokens: 20, max_completion_tokens: 10 }),
        ).toBe(10);
        expect(completionLimit({})).toBeUndefined();
    });

    it("does not alter text within the limit", () => {
        expect(truncateToTokens("hello", 10)).toEqual({
            text: "hello",
            tokens: 1,
            truncated: false,
        });
    });
});

describe("Discord content hardening", () => {
    it("neutralizes URLs, mentions, and Markdown", () => {
        const result = hardenContent("**hi** <@123> https://example.com");
        expect(result).toContain("\\*\\*hi\\*\\*");
        expect(result).toContain("[mention]");
        expect(result).toContain("[link removed]");
    });

    it("chunks long transcripts below Discord's message limit", () => {
        const chunks = formatTranscript([
            { role: "user", content: "x".repeat(4_000) },
        ]);
        expect(chunks.length).toBe(3);
        expect(chunks.every((chunk) => chunk.length <= 1_900)).toBe(true);
    });
});
