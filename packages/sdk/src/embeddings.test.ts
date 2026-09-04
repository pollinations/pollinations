import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Pollinations } from "./client.js";
import { configure, embeddings, resetClient } from "./helpers.js";
import { PollinationsError } from "./types.js";

// Build a minimal Response-like object good enough for the client paths.
function makeResponse(
    body: unknown,
    init: { ok?: boolean; status?: number } = {},
): Response {
    const { ok = true, status = 200 } = init;
    return {
        ok,
        status,
        headers: {
            get: (name: string) =>
                name.toLowerCase() === "content-type"
                    ? "application/json"
                    : null,
        },
        json: async () => body,
        text: async () =>
            typeof body === "string" ? body : JSON.stringify(body),
    } as unknown as Response;
}

const EMBEDDINGS_RESPONSE = {
    object: "list",
    data: [{ object: "embedding", embedding: [0.1, -0.2, 0.3], index: 0 }],
    model: "gemini-2",
    usage: { prompt_tokens: 2, total_tokens: 2 },
};

// Helper: parse the JSON body of a POST fetch call.
function bodyOf(call: unknown[]): Record<string, unknown> {
    const init = call[1] as RequestInit;
    return JSON.parse(init.body as string) as Record<string, unknown>;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
    resetClient();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

function newClient() {
    return new Pollinations({
        apiKey: "sk_test",
        baseUrl: "https://example.test",
    });
}

describe("Pollinations.embeddings", () => {
    it("posts an OpenAI-compatible request to /v1/embeddings", async () => {
        fetchMock.mockResolvedValue(makeResponse(EMBEDDINGS_RESPONSE));

        const result = await newClient().embeddings("Hello world", {
            model: "gemini-2",
            dimensions: 768,
            encodingFormat: "base64",
            taskType: "RETRIEVAL_QUERY",
            inputType: "query",
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe("https://example.test/v1/embeddings");
        expect(init.method).toBe("POST");
        expect(
            (init.headers as Record<string, string>)["Content-Type"],
        ).toBe("application/json");
        expect(bodyOf(fetchMock.mock.calls[0])).toEqual({
            model: "gemini-2",
            input: "Hello world",
            dimensions: 768,
            encoding_format: "base64",
            task_type: "RETRIEVAL_QUERY",
            input_type: "query",
        });
        expect(result.data[0]?.embedding).toEqual([0.1, -0.2, 0.3]);
        expect(result.usage.total_tokens).toBe(2);
    });

    it("accepts a batch of strings and omits unset options", async () => {
        fetchMock.mockResolvedValue(makeResponse(EMBEDDINGS_RESPONSE));

        await newClient().embeddings(["first document", "second document"]);

        expect(bodyOf(fetchMock.mock.calls[0])).toEqual({
            input: ["first document", "second document"],
        });
    });

    it("accepts multimodal content parts", async () => {
        fetchMock.mockResolvedValue(makeResponse(EMBEDDINGS_RESPONSE));

        const input = [
            { type: "text" as const, text: "a photo of a cat" },
            {
                type: "image_url" as const,
                image_url: { url: "https://example.com/cat.jpg" },
            },
        ];
        await newClient().embeddings(input);

        expect(bodyOf(fetchMock.mock.calls[0]).input).toEqual(input);
    });

    it.each(["", []])("rejects empty input %j without a request", async (
        input,
    ) => {
        await expect(newClient().embeddings(input)).rejects.toMatchObject({
            code: "INVALID_INPUT",
            status: 400,
        });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("surfaces API errors", async () => {
        fetchMock.mockResolvedValue(
            makeResponse(
                { error: { message: "Insufficient balance" } },
                { ok: false, status: 402 },
            ),
        );

        await expect(
            newClient().embeddings("Hello world"),
        ).rejects.toBeInstanceOf(PollinationsError);
    });
});

describe("embeddings helper", () => {
    it("uses the configured client", async () => {
        configure({ apiKey: "sk_test", baseUrl: "https://example.test" });
        fetchMock.mockResolvedValue(makeResponse(EMBEDDINGS_RESPONSE));

        const result = await embeddings("Hello world");

        const [url] = fetchMock.mock.calls[0] as [string];
        expect(url).toBe("https://example.test/v1/embeddings");
        expect(result.model).toBe("gemini-2");
    });
});
