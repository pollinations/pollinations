import { env, SELF } from "cloudflare:test";
import { createHmac } from "node:crypto";
import { createTestApiKey } from "@shared/test/fixtures/index.ts";
import { describe, expect, it } from "vitest";
import { readLargeChatBody } from "../src/middleware/large-chat-body.ts";

describe("large chat bodies", () => {
    it("offloads images from a 96 MiB JSON stream without changing messages", async () => {
        let index = 0;
        const stream = new ReadableStream<Uint8Array>({
            pull(controller) {
                if (index === 0) {
                    controller.enqueue(
                        new TextEncoder().encode(
                            '{"model":"openai/gpt-5-nano","messages":[{"role":"user","content":[',
                        ),
                    );
                }
                if (index < 24) {
                    const bytes = new Uint8Array(3 * 1024 * 1024);
                    for (
                        let offset = 0;
                        offset < bytes.length;
                        offset += 65536
                    ) {
                        crypto.getRandomValues(
                            bytes.subarray(offset, offset + 65536),
                        );
                    }
                    const base64 = Buffer.from(bytes).toString("base64");
                    controller.enqueue(
                        new TextEncoder().encode(
                            `${index ? "," : ""}{"type":"image_url","image_url":{"url":"data:image/jpeg;base64,${base64}"}}`,
                        ),
                    );
                    index++;
                    return;
                }
                controller.enqueue(new TextEncoder().encode("]}]}"));
                controller.close();
            },
        });

        let uploads = 0;
        const body = await readLargeChatBody(stream, async (dataUrl) => {
            const bytes = Buffer.from(dataUrl.split(",")[1], "base64");
            const result = await env.MEDIA.upload(new Blob([bytes]).stream(), {
                contentType: "image/jpeg",
                size: bytes.byteLength,
            });
            uploads++;
            return result.url;
        });

        const parsed = JSON.parse(body);
        expect(uploads).toBe(24);
        expect(parsed.messages[0].content).toHaveLength(24);
        const lastUrl = parsed.messages[0].content[23].image_url.url;
        expect(lastUrl).toMatch(
            /^https:\/\/media\.pollinations\.ai\/[a-f0-9-]{36}$/,
        );
        const stored = await env.MEDIA.get(new URL(lastUrl).pathname.slice(1));
        expect(stored?.status).toBe(200);
        expect((await stored?.arrayBuffer())?.byteLength).toBe(3 * 1024 * 1024);
        expect(body.length).toBeLessThan(4096);
    });
});

describe("large chat route", () => {
    it("accepts a 40 MiB inline-image request through the real media service", async () => {
        const { key, userId } = await createTestApiKey({
            user: { packBalance: 100 },
        });
        const imageBytes = new Uint8Array(3 * 1024 * 1024);
        for (let offset = 0; offset < imageBytes.length; offset += 65536) {
            crypto.getRandomValues(imageBytes.subarray(offset, offset + 65536));
        }
        const dataUrl = `data:image/jpeg;base64,${Buffer.from(imageBytes).toString("base64")}`;
        const content = Array.from({ length: 10 }, () => ({
            type: "image_url",
            image_url: { url: dataUrl },
        }));
        const body = JSON.stringify({
            model: "not-a-model",
            messages: [{ role: "user", content }],
        });
        const response = await SELF.fetch(
            new Request("https://gen.pollinations.ai/v1/chat/completions", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${key}`,
                    "Content-Type": "application/json",
                },
                body,
            }),
        );
        expect(response.status).toBe(400);
        expect(await response.text()).toContain("not-a-model");
        const id = createHmac("sha256", env.BETTER_AUTH_SECRET)
            .update("chat-input\0")
            .update(userId)
            .update("\0image/jpeg\0")
            .update(imageBytes)
            .digest("hex");
        expect(await env.MEDIA.has(id)).toBe(true);
    });
});
