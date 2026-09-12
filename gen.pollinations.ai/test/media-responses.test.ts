import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { mediaPromptRoute } from "../src/media/prompt-route.ts";
import {
    createMediaResponse,
    MediaChatCompletionSchema,
    MediaResponseSchema,
    textResponseStream,
} from "../src/media/response-output.ts";
import { mediaPrompt } from "../src/media/responses.ts";
import { getGenerationModelRegistry } from "../src/model-registry.ts";
import {
    responsesToChatCompletion,
    responsesToChatStream,
} from "../src/text/responses/chatResponse.ts";

const url = "https://media.pollinations.ai/abc123";
const requestUrl = new URL("https://gen.pollinations.ai/v1/chat/completions");

describe("media text protocols", () => {
    it("uses only the last user message, preserving all its text parts", () => {
        expect(
            mediaPrompt([
                { role: "system", content: "ignore me" },
                { role: "user", content: "earlier prompt" },
                {
                    role: "user",
                    content: [
                        { type: "input_text", text: "a cat" },
                        { type: "text", text: "in space" },
                    ],
                },
                { role: "assistant", content: "not the prompt" },
            ]),
        ).toEqual({ prompt: "a cat\nin space", images: [] });
        expect(mediaPrompt(" literal prompt ").prompt).toBe(" literal prompt ");
        expect(mediaPrompt("猫 🚀 ... %2F").prompt).toBe("猫 🚀 ... %2F");
        expect(mediaPrompt(" . ").prompt).toBe(" . ");
    });

    it("collects Chat image_url and Responses input_image parts in order", () => {
        const data = "data:image/png;base64,AAAA";
        expect(
            mediaPrompt([
                {
                    role: "user",
                    content: [
                        { type: "image_url", image_url: { url: url } },
                        { type: "text", text: "make it night" },
                        { type: "input_image", image_url: data },
                        { type: "input_image", image_url: { url: url } },
                    ],
                },
            ]),
        ).toEqual({ prompt: "make it night", images: [url, data, url] });
    });

    it.each([
        null,
        [],
        " ",
        ".",
        "..",
        "\ud800",
        "\udc00",
        [{ role: "assistant", content: "hello" }],
        [{ role: "user", content: [{ type: "input_image", image_url: url }] }],
        [
            {
                role: "user",
                content: [
                    { type: "text", text: "summarise" },
                    { type: "input_file", file_data: "AAAA" },
                ],
            },
        ],
        [
            {
                role: "user",
                content: [
                    { type: "text", text: "listen" },
                    { type: "input_audio", input_audio: { data: "AAAA" } },
                ],
            },
        ],
    ])("rejects absent text and non-image attachments: %j", (input) => {
        expect(() => mediaPrompt(input)).toThrow();
    });

    it.each([
        ["image/png", `![Image](${url})\n\n${url}`],
        ["image/svg+xml", `![Image](${url})\n\n${url}`],
        ["audio/mpeg", `[Audio](${url})\n\n${url}`],
        ["video/mp4", `[Video](${url})\n\n${url}`],
        ["model/gltf-binary", `[3D model](${url})\n\n${url}`],
    ])("returns schema-valid Markdown in both protocols for %s", (mime, markdown) => {
        const response = createMediaResponse("media-model", url, mime);
        expect(MediaResponseSchema.safeParse(response).success).toBe(true);
        expect(response.output[0].content[0].text).toBe(markdown);
        expect(response.usage).toBeNull();
        const chat = responsesToChatCompletion(
            response,
            "media-model",
            requestUrl,
            { requireUsage: false },
        );
        expect(MediaChatCompletionSchema.safeParse(chat).success).toBe(true);
        expect(chat.choices?.[0].message?.content).toBe(markdown);
        expect(chat).not.toHaveProperty("usage");
        expect(() =>
            responsesToChatCompletion(response, "media-model", requestUrl),
        ).toThrow(/usage/);
    });

    it("emits ordered Responses events and adapts them to one Chat text delta", async () => {
        const response = createMediaResponse("media-model", url, "image/png");
        const events = (await new Response(textResponseStream(response)).text())
            .split("\n\n")
            .filter((line) => line.startsWith("event:"))
            .map((line) => JSON.parse(line.split("\ndata: ")[1]));
        expect(events.map((event) => event.sequence_number)).toEqual(
            events.map((_, index) => index),
        );
        expect(events.at(-1)).toMatchObject({
            type: "response.completed",
            response,
        });
        const chat = await new Response(
            responsesToChatStream(
                textResponseStream(response),
                response.model,
                { requireUsage: false },
            ),
        ).text();
        const chunks = chat
            .split("\n\n")
            .filter((line) => line.startsWith("data: {"))
            .map((line) => JSON.parse(line.slice(6)));
        expect(
            chunks
                .filter((chunk) => chunk.choices[0]?.delta.content)
                .map((chunk) => chunk.choices[0].delta.content),
        ).toEqual([response.output[0].content[0].text]);
        expect(chunks.at(-1).choices[0].finish_reason).toBe("stop");
        expect(chunks.some((chunk) => chunk.usage != null)).toBe(false);
        expect(chat).toContain("data: [DONE]");
        const strict = await new Response(
            responsesToChatStream(textResponseStream(response), response.model),
        ).text();
        expect(strict).toContain("usage_missing");
    });

    it("rejects malformed terminal usage even in media mode", async () => {
        const response = createMediaResponse("media-model", url, "image/png");
        expect(() =>
            responsesToChatCompletion(
                { ...response, usage: {} },
                response.model,
                requestUrl,
                { requireUsage: false },
            ),
        ).toThrow(/usage/);
        const stream = new Blob([
            'event: response.completed\ndata: {"type":"response.completed"}\n\n',
        ]).stream();
        expect(
            await new Response(
                responsesToChatStream(stream, response.model, {
                    requireUsage: false,
                }),
            ).text(),
        ).toContain("usage_missing");
    });

    it("advertises only text-input media with a native generation route", async () => {
        const registry = await getGenerationModelRegistry(env);
        for (const model of [
            "flux",
            "veo",
            "elevenlabs/eleven-v3",
            "hyper3d/rodin-2.5",
            "prunaai/p-image-edit",
        ]) {
            const entry = registry.resolve(model);
            if (!entry) throw new Error(`Missing registry model: ${model}`);
            expect(mediaPromptRoute(entry), model).toBeTruthy();
            expect(entry.info.supported_endpoints).toContain("/v1/responses");
            expect(entry.info.supported_endpoints).toContain(
                "/v1/chat/completions",
            );
        }
        for (const model of [
            "microsoft/trellis-2",
            "nvidia/asset-harvester",
            "elevenlabs/scribe-v2",
        ]) {
            const entry = registry.resolve(model);
            if (!entry) throw new Error(`Missing registry model: ${model}`);
            expect(mediaPromptRoute(entry), model).toBeUndefined();
            expect(entry.info.supported_endpoints).not.toContain(
                "/v1/responses",
            );
        }
    });
});
