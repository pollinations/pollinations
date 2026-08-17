import {
    createExecutionContext,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import { createTestApiKey, test } from "@shared/test/fixtures/index.ts";
import { afterEach, describe, expect, vi } from "vitest";
import worker from "../src/index.ts";
import { BASIC_CONTAINER_COST_PER_SECOND } from "../src/routes/ffmpeg.ts";
import { withInlineGenerationCoordinator } from "./helpers/inline-generation-coordinator.ts";

type FfmpegStub = {
    run: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
};

function createFfmpegBinding(stub: FfmpegStub) {
    return {
        idFromName: (name: string) => name,
        get: () => stub,
    } as unknown as CloudflareBindings["FFMPEG"];
}

function successfulStub(captured: {
    input?: Uint8Array;
    args?: string[];
    outputExtension?: string;
}): FfmpegStub {
    return {
        run: vi.fn(
            async (
                input: ReadableStream<Uint8Array>,
                args: string[],
                outputExtension: string,
            ) => {
                captured.input = new Uint8Array(
                    await new Response(input).arrayBuffer(),
                );
                captured.args = args;
                captured.outputExtension = outputExtension;
                return {
                    ok: true,
                    output: new ReadableStream<Uint8Array>({
                        start(controller) {
                            controller.enqueue(new Uint8Array([4, 5, 6]));
                            controller.close();
                        },
                    }),
                    bytes: 3,
                    stderr: "",
                };
            },
        ),
        destroy: vi.fn(async () => undefined),
    };
}

async function fetchGen(request: Request, stub: FfmpegStub) {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
        request,
        {
            ...withInlineGenerationCoordinator(env),
            FFMPEG: createFfmpegBinding(stub),
        },
        ctx,
    );
    return { ctx, response };
}

describe("FFmpeg", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    test("passes raw argv to FFmpeg, streams output, and bills container time", async () => {
        const { key, userId } = await createTestApiKey({
            pollenBudget: 1,
            user: { packBalance: 100 },
        });
        vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
            if (String(input) === "https://media.pollinations.ai/input-video") {
                return new Response(new Uint8Array([1, 2, 3]), {
                    headers: {
                        "content-length": "3",
                        "content-type": "video/mp4",
                    },
                });
            }
            return new Response(null, { status: 204 });
        });
        const captured: {
            input?: Uint8Array;
            args?: string[];
            outputExtension?: string;
        } = {};
        const stub = successfulStub(captured);

        const { ctx, response } = await fetchGen(
            new Request("https://gen.pollinations.ai/v1/media/ffmpeg", {
                method: "POST",
                headers: {
                    authorization: `Bearer ${key}`,
                    "content-type": "application/json",
                },
                body: JSON.stringify({
                    source: "https://media.pollinations.ai/input-video",
                    args: ["-ss", "2", "-t", "5", "-vf", "scale=640:-2"],
                    outputExtension: "mp4",
                }),
            }),
            stub,
        );

        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBe("video/mp4");
        expect(response.headers.get("x-model-used")).toBe("ffmpeg");
        const runtimeMs = Number(response.headers.get("x-ffmpeg-runtime-ms"));
        expect(runtimeMs).toBeGreaterThan(0);
        expect(new Uint8Array(await response.arrayBuffer())).toEqual(
            new Uint8Array([4, 5, 6]),
        );
        await waitOnExecutionContext(ctx);
        expect(captured).toEqual({
            input: new Uint8Array([1, 2, 3]),
            args: ["-ss", "2", "-t", "5", "-vf", "scale=640:-2"],
            outputExtension: "mp4",
        });
        expect(stub.destroy).toHaveBeenCalledOnce();

        const user = await env.DB.prepare(
            "SELECT pack_balance FROM user WHERE id = ?",
        )
            .bind(userId)
            .first<{ pack_balance: number }>();
        expect(user?.pack_balance).toBeCloseTo(
            100 - (runtimeMs / 1000) * BASIC_CONTAINER_COST_PER_SECOND,
            8,
        );
    });

    test("accepts only Pollinations media inputs", async ({ paidApiKey }) => {
        const stub = successfulStub({});
        const { response } = await fetchGen(
            new Request("https://gen.pollinations.ai/v1/media/ffmpeg", {
                method: "POST",
                headers: {
                    authorization: `Bearer ${paidApiKey}`,
                    "content-type": "application/json",
                },
                body: JSON.stringify({
                    source: "https://example.com/input.mp4",
                    args: ["-c:v", "libx264"],
                    outputExtension: "mp4",
                }),
            }),
            stub,
        );

        expect(response.status).toBe(400);
        expect(stub.run).not.toHaveBeenCalled();
    });

    test("rejects an extra input argument", async ({ paidApiKey }) => {
        const stub = successfulStub({});
        const { response } = await fetchGen(
            new Request("https://gen.pollinations.ai/v1/media/ffmpeg", {
                method: "POST",
                headers: {
                    authorization: `Bearer ${paidApiKey}`,
                    "content-type": "application/json",
                },
                body: JSON.stringify({
                    source: "https://media.pollinations.ai/input-video",
                    args: ["-i", "https://example.com/second.mp4"],
                    outputExtension: "mp4",
                }),
            }),
            stub,
        );

        expect(response.status).toBe(400);
        expect(stub.run).not.toHaveBeenCalled();
    });

    test("returns FFmpeg stderr and bills the failed container run", async () => {
        const { key, userId } = await createTestApiKey({
            pollenBudget: 1,
            user: { packBalance: 100 },
        });
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(new Uint8Array([1, 2, 3])),
        );
        const stub: FfmpegStub = {
            run: vi.fn(async () => ({
                ok: false,
                stderr: "Unknown encoder 'made-up'",
            })),
            destroy: vi.fn(async () => undefined),
        };

        const { ctx, response } = await fetchGen(
            new Request("https://gen.pollinations.ai/v1/media/ffmpeg", {
                method: "POST",
                headers: {
                    authorization: `Bearer ${key}`,
                    "content-type": "application/json",
                },
                body: JSON.stringify({
                    source: "https://media.pollinations.ai/input-video",
                    args: ["-c:v", "made-up"],
                    outputExtension: "mp4",
                }),
            }),
            stub,
        );

        expect(response.status).toBe(422);
        expect(await response.text()).toContain("Unknown encoder");
        expect(stub.destroy).toHaveBeenCalledOnce();
        const runtimeMs = Number(response.headers.get("x-ffmpeg-runtime-ms"));
        expect(runtimeMs).toBeGreaterThan(0);
        await waitOnExecutionContext(ctx);
        const user = await env.DB.prepare(
            "SELECT pack_balance FROM user WHERE id = ?",
        )
            .bind(userId)
            .first<{ pack_balance: number }>();
        expect(user?.pack_balance).toBeCloseTo(
            100 - (runtimeMs / 1000) * BASIC_CONTAINER_COST_PER_SECOND,
            8,
        );
    });

    test("rejects keys that cannot cover the maximum container run", async () => {
        const { key } = await createTestApiKey({
            pollenBudget: 0.0005,
            user: { packBalance: 100 },
        });
        const fetchSpy = vi.spyOn(globalThis, "fetch");
        const stub = successfulStub({});
        const { response } = await fetchGen(
            new Request("https://gen.pollinations.ai/v1/media/ffmpeg", {
                method: "POST",
                headers: {
                    authorization: `Bearer ${key}`,
                    "content-type": "application/json",
                },
                body: JSON.stringify({
                    source: "https://media.pollinations.ai/input-video",
                    args: ["-c:v", "libx264"],
                    outputExtension: "mp4",
                }),
            }),
            stub,
        );

        expect(response.status).toBe(402);
        expect(fetchSpy).not.toHaveBeenCalledWith(
            "https://media.pollinations.ai/input-video",
            { redirect: "manual" },
        );
        expect(stub.run).not.toHaveBeenCalled();
    });
});
