import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    type ApiOptions,
    printApiResponse,
    requestApi,
    resolveApiUrl,
} from "./api.js";

const options = (overrides: Partial<ApiOptions> = {}): ApiOptions => ({
    form: [],
    auth: true,
    ...overrides,
});

const temporaryDirectories: string[] = [];

function temporaryDirectory() {
    const directory = mkdtempSync(join(tmpdir(), "polli-api-test-"));
    temporaryDirectories.push(directory);
    return directory;
}

afterEach(() => {
    vi.restoreAllMocks();
    for (const directory of temporaryDirectories.splice(0)) {
        rmSync(directory, { recursive: true, force: true });
    }
});

describe("resolveApiUrl", () => {
    it("accepts only paths on the configured host", () => {
        expect(resolveApiUrl("v1/models", "https://gen.example.test")).toBe(
            "https://gen.example.test/v1/models",
        );
        expect(() =>
            resolveApiUrl(
                "https://evil.example/key",
                "https://gen.example.test",
            ),
        ).toThrow("relative");
        expect(() =>
            resolveApiUrl("//evil.example/key", "https://gen.example.test"),
        ).toThrow("relative");
    });
});

describe("requestApi", () => {
    it("adds bearer auth and defaults body requests to POST", async () => {
        const fetchImpl = vi.fn(async () => Response.json({ ok: true }));

        await requestApi(
            "/v1/embeddings",
            options({ data: '{"input":"hello"}' }),
            "",
            "sk_test",
            fetchImpl,
        );

        const [url, init] = fetchImpl.mock.calls[0];
        expect(url).toBe("https://gen.pollinations.ai/v1/embeddings");
        expect(init.method).toBe("POST");
        expect(new Headers(init.headers).get("Authorization")).toBe(
            "Bearer sk_test",
        );
        expect(init.body).toBe('{"input":"hello"}');
    });

    it("supports public requests without leaking a key", async () => {
        const fetchImpl = vi.fn(async () => Response.json([]));

        await requestApi(
            "/models",
            options({ auth: false }),
            "",
            "sk_test",
            fetchImpl,
        );

        const [, init] = fetchImpl.mock.calls[0];
        expect(new Headers(init.headers).has("Authorization")).toBe(false);
        expect(init.method).toBe("GET");
    });

    it("builds multipart requests with file fields", async () => {
        const directory = temporaryDirectory();
        const file = join(directory, "voice.mp3");
        writeFileSync(file, "audio");
        const fetchImpl = vi.fn(async () => Response.json({ ok: true }));

        await requestApi(
            "/v1/audio/voice-isolator",
            options({ form: [`file=@${file}`, "model=eleven-voice-isolator"] }),
            "",
            "sk_test",
            fetchImpl,
        );

        const [, init] = fetchImpl.mock.calls[0];
        const form = init.body as FormData;
        const uploaded = form.get("file") as File;
        expect(init.method).toBe("POST");
        expect(uploaded.name).toBe("voice.mp3");
        expect(uploaded.type).toBe("audio/mpeg");
        expect(form.get("model")).toBe("eleven-voice-isolator");
        expect(new Headers(init.headers).has("Content-Type")).toBe(false);
    });

    it("rejects ambiguous or invalid request bodies", async () => {
        await expect(
            requestApi(
                "/models",
                options({ data: "{}", form: ["name=value"] }),
                "",
            ),
        ).rejects.toThrow("cannot be used together");
        await expect(
            requestApi("/models", options({ method: "GET" }), "{}"),
        ).rejects.toThrow("GET requests cannot include");
        await expect(
            requestApi("/models", options({ data: "not-json" }), ""),
        ).rejects.toThrow("Invalid JSON");
    });
});

describe("printApiResponse", () => {
    it("requires an output path for binary responses", async () => {
        await expect(
            printApiResponse(
                new Response(new Uint8Array([1, 2, 3]), {
                    headers: { "content-type": "image/png" },
                }),
            ),
        ).rejects.toThrow("pass --output");
    });

    it("writes binary responses to the requested path", async () => {
        const directory = temporaryDirectory();
        const output = join(directory, "image.png");
        vi.spyOn(process.stderr, "write").mockImplementation(() => true);

        await printApiResponse(
            new Response(new Uint8Array([1, 2, 3]), {
                headers: { "content-type": "image/png" },
            }),
            output,
        );

        expect([...readFileSync(output)]).toEqual([1, 2, 3]);
    });
});
