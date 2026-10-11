import { env, SELF } from "cloudflare:test";
import { createHmac } from "node:crypto";
import { createTestApiKey } from "@shared/test/fixtures/index.ts";
import { describe, expect, it, vi } from "vitest";
import { readLargeChatBody } from "../src/middleware/large-chat-body.ts";

describe("large chat bodies", () => {
    it("offloads URL-shaped media without changing other fields", async () => {
        const image = "data:image/png;base64,AQID";
        const video = "data:video/mp4;base64,BAUG";
        const file = "data:application/pdf;base64,BwgJ";
        const input = {
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "image_url", image_url: { url: image } },
                        { type: "video_url", video_url: { url: video } },
                        { type: "file", file: { file_url: file } },
                        {
                            type: "file",
                            file: {
                                file_data: "BAUG",
                                mime_type: "application/pdf",
                            },
                        },
                        {
                            type: "input_audio",
                            input_audio: { data: "AQID", format: "mp3" },
                        },
                        { type: "text", text: image },
                    ],
                },
            ],
        };
        const uploaded: string[] = [];
        const body = await readLargeChatBody(
            new Blob([JSON.stringify(input)]).stream(),
            async (dataUrl) => {
                uploaded.push(dataUrl);
                return `https://media.pollinations.ai/${uploaded.length}`;
            },
        );
        const parts = JSON.parse(body).messages[0].content;
        expect(uploaded).toEqual([image, video, file]);
        expect(parts[0].image_url.url).toBe("https://media.pollinations.ai/1");
        expect(parts[1].video_url.url).toBe("https://media.pollinations.ai/2");
        expect(parts[2].file.file_url).toBe("https://media.pollinations.ai/3");
        expect(parts.slice(3)).toEqual(input.messages[0].content.slice(3));
    });

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
    it("forwards over 32 MiB of PDF file_data as URLs to OpenRouter", async () => {
        const { key, userId } = await createTestApiKey({
            user: { packBalance: 100 },
        });
        const bytes = Buffer.alloc(14 * 1024 * 1024);
        bytes.write("%PDF-1.4\n");
        const base64 = bytes.toString("base64");
        const body = JSON.stringify({
            model: "thinkingmachines/inkling-small",
            messages: [
                {
                    role: "user",
                    content: Array.from({ length: 2 }, (_, index) => ({
                        type: "file",
                        file: {
                            file_data: index
                                ? `data:application/pdf;base64,${base64}`
                                : base64,
                            ...(index ? {} : { mime_type: "application/pdf" }),
                            file_name: `${index}.pdf`,
                        },
                    })),
                },
            ],
        });
        expect(body.length).toBeGreaterThan(32 * 1024 * 1024);
        let forwarded: unknown;
        const fetch = vi
            .spyOn(globalThis, "fetch")
            .mockImplementation(async (url, init) => {
                if (
                    String(url).includes(
                        "openrouter.ai/api/v1/chat/completions",
                    )
                ) {
                    forwarded = JSON.parse(String(init?.body));
                    return Response.json(
                        { error: { message: "provider test stop" } },
                        { status: 400 },
                    );
                }
                const host = new URL(String(url)).hostname;
                if (host === "localhost" || host.endsWith(".tinybird.co")) {
                    return Response.json({});
                }
                throw new Error("Unexpected outbound fetch");
            });
        try {
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
            expect(response.status).toBeGreaterThanOrEqual(400);
            await response.arrayBuffer();
        } finally {
            fetch.mockRestore();
        }
        const id = createHmac("sha256", env.BETTER_AUTH_SECRET)
            .update("chat-input\0")
            .update(userId)
            .update("\0application/pdf\0")
            .update(bytes)
            .digest("hex");
        expect(await env.MEDIA.has(id)).toBe(true);
        const forwardedParts = (
            forwarded as {
                messages: { content: { file: Record<string, unknown> }[] }[];
            }
        ).messages[0].content;
        expect(forwardedParts).toHaveLength(2);
        for (const part of forwardedParts) {
            expect(part.file.file_data).toBeUndefined();
            expect(part.file.file_url).toBe(
                `https://media.pollinations.ai/${id}`,
            );
        }
    });

    it("forwards over 32 MiB of base64 and data-URL audio as URLs to Fireworks Inkling", async () => {
        const { key, userId } = await createTestApiKey({
            user: { packBalance: 100 },
        });
        const bytes = Buffer.alloc(14 * 1024 * 1024);
        bytes.write("OggS");
        const base64 = bytes.toString("base64");
        const body = JSON.stringify({
            model: "thinkingmachines/inkling",
            messages: [
                {
                    role: "user",
                    content: Array.from({ length: 2 }, (_, index) => ({
                        type: "input_audio",
                        input_audio: {
                            data: index
                                ? `data:audio/opus;base64,${base64}`
                                : base64,
                            format: "opus",
                        },
                    })),
                },
            ],
        });
        expect(body.length).toBeGreaterThan(32 * 1024 * 1024);
        let forwarded: unknown;
        const fetch = vi
            .spyOn(globalThis, "fetch")
            .mockImplementation(async (url, init) => {
                if (String(url).includes("/v1/chat/completions")) {
                    forwarded = JSON.parse(String(init?.body));
                    return Response.json(
                        { error: { message: "provider test stop" } },
                        { status: 400 },
                    );
                }
                const host = new URL(String(url)).hostname;
                if (host === "localhost" || host.endsWith(".tinybird.co"))
                    return Response.json({});
                throw new Error("Unexpected outbound fetch");
            });
        try {
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
            expect(response.status).toBeGreaterThanOrEqual(400);
            await response.arrayBuffer();
        } finally {
            fetch.mockRestore();
        }
        // Bare base64 is wrapped with the ogg mime type, while an already
        // encoded data: URL is offloaded as-is with its own mime type.
        const bareId = createHmac("sha256", env.BETTER_AUTH_SECRET)
            .update("chat-input\0")
            .update(userId)
            .update("\0audio/ogg\0")
            .update(bytes)
            .digest("hex");
        const dataUrlId = createHmac("sha256", env.BETTER_AUTH_SECRET)
            .update("chat-input\0")
            .update(userId)
            .update("\0audio/opus\0")
            .update(bytes)
            .digest("hex");
        expect(await env.MEDIA.has(bareId)).toBe(true);
        expect(await env.MEDIA.has(dataUrlId)).toBe(true);
        const parts = (
            forwarded as {
                messages: {
                    content: { type: string; audio_url: { url: string } }[];
                }[];
            }
        ).messages[0].content;
        expect(parts).toHaveLength(2);
        expect(parts[0]).toEqual({
            type: "audio_url",
            audio_url: { url: `https://media.pollinations.ai/${bareId}` },
        });
        expect(parts[1]).toEqual({
            type: "audio_url",
            audio_url: { url: `https://media.pollinations.ai/${dataUrlId}` },
        });
    });

    it("accepts a 48 MiB mixed-media request through the real media service", async () => {
        const { key, userId } = await createTestApiKey({
            user: { packBalance: 100 },
        });
        const imageBytes = new Uint8Array(3 * 1024 * 1024);
        for (let offset = 0; offset < imageBytes.length; offset += 65536) {
            crypto.getRandomValues(imageBytes.subarray(offset, offset + 65536));
        }
        const base64 = Buffer.from(imageBytes).toString("base64");
        const content = Array.from({ length: 4 }, () => [
            {
                type: "image_url",
                image_url: { url: `data:image/jpeg;base64,${base64}` },
            },
            {
                type: "video_url",
                video_url: { url: `data:video/mp4;base64,${base64}` },
            },
            {
                type: "file",
                file: { file_url: `data:application/pdf;base64,${base64}` },
            },
        ]).flat();
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
        for (const contentType of [
            "image/jpeg",
            "video/mp4",
            "application/pdf",
        ]) {
            const id = createHmac("sha256", env.BETTER_AUTH_SECRET)
                .update("chat-input\0")
                .update(userId)
                .update(`\0${contentType}\0`)
                .update(imageBytes)
                .digest("hex");
            expect(await env.MEDIA.has(id)).toBe(true);
        }
    });
});
