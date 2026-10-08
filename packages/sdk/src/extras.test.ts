import { expect, it, vi } from "vitest";
import { Pollinations } from "./client.js";
import { Conversation } from "./extras.js";

it("does not restore an old response after clearing a pending conversation", async () => {
    let complete!: (response: Response) => void;
    vi.stubGlobal(
        "fetch",
        vi.fn(
            () =>
                new Promise<Response>((resolve) => {
                    complete = resolve;
                }),
        ),
    );
    try {
        const conversation = new Conversation(
            {},
            new Pollinations({
                apiKey: "sk_test",
                baseUrl: "https://example.test",
            }),
        );
        const pending = conversation.say("Hello");
        conversation.clear();
        complete(
            new Response(
                JSON.stringify({
                    id: "chat-1",
                    model: "test",
                    choices: [
                        {
                            index: 0,
                            message: {
                                role: "assistant",
                                content: "Hello back",
                            },
                            finish_reason: "stop",
                        },
                    ],
                }),
                { headers: { "content-type": "application/json" } },
            ),
        );
        const response = await pending;
        expect(response.text).toBe("Hello back");
        expect(conversation.getHistory()).toEqual([]);
    } finally {
        vi.unstubAllGlobals();
    }
});
