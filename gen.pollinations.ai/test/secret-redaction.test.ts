import { describe, expect, it } from "vitest";
import {
    createSecretRedactionStream,
    redactSecrets,
} from "@/utils/secret-redaction.ts";

describe("secret redaction", () => {
    it("redacts Pollinations keys and bearer tokens in strings", () => {
        const text =
            "keys sk_test_123456789 pk_test_123456789 Authorization: Bearer sk_live_abcdefghi";

        expect(redactSecrets(text)).toBe(
            "keys {SECRET_KEY} {PUBLIC_KEY} Authorization: Bearer {BEARER_TOKEN}",
        );
    });

    it("redacts nested response details", () => {
        expect(
            redactSecrets({
                error: {
                    message: "failed for sk_test_123456789",
                    request: {
                        headers: { authorization: "Bearer token123456" },
                    },
                },
            }),
        ).toEqual({
            error: {
                message: "failed for {SECRET_KEY}",
                request: {
                    headers: { authorization: "Bearer {BEARER_TOKEN}" },
                },
            },
        });
    });

    it("redacts stream tokens split across chunks", async () => {
        const encoder = new TextEncoder();
        const source = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(encoder.encode("data: Bear"));
                controller.enqueue(encoder.encode("er sk_live_abc"));
                controller.enqueue(encoder.encode("defghi\n\n"));
                controller.close();
            },
        });

        const text = await new Response(
            source.pipeThrough(createSecretRedactionStream()),
        ).text();

        expect(text).toBe("data: Bearer {BEARER_TOKEN}\n\n");
    });
});
