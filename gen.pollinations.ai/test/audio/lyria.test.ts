import { env } from "cloudflare:test";
import { AUDIO_SERVICES } from "@shared/registry/audio.ts";
import { calculateUsageBilling } from "@shared/registry/registry.ts";
import {
    MODEL_USED_HEADER,
    parseUsageHeaders,
} from "@shared/registry/usage-headers.ts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateLyria35 } from "../../src/audio/lyria.ts";
import {
    type FallbackAttempt,
    withModelFallbackResponse,
} from "../../src/fallback.ts";
import { getGenerationModelRegistry } from "../../src/model-registry.ts";

const primary = "google/lyria-3.5";
const fallback = "google/lyria-3.5:fal";
const options = {
    model: primary,
    prompt: "A short folk song",
    responseFormat: "mp3",
    geminiApiKey: "test-gemini",
    falKey: "test-fal",
} as const;

afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
});

describe("Lyria 3.5", () => {
    it("extracts Interactions steps and bills a song, not bundled tokens", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
            Response.json({
                status: "completed",
                usage: { total_input_tokens: 41, total_output_tokens: 686 },
                steps: [
                    {
                        content: [
                            { type: "text", text: "Verse" },
                            {
                                type: "audio",
                                mime_type: "audio/mpeg",
                                data: btoa("ID3audio"),
                            },
                        ],
                    },
                ],
            }),
        );
        const response = await generateLyria35(options);
        expect(new TextDecoder().decode(await response.arrayBuffer())).toBe(
            "ID3audio",
        );
        expect(response.headers.get("content-type")).toBe("audio/mpeg");
        expect(parseUsageHeaders(response.headers)).toMatchObject({
            completionAudioTokens: 1,
        });
        const request = new Request(...fetchSpy.mock.calls[0]);
        expect(request.headers.get("x-goog-api-key")).toBe("test-gemini");
        await expect(request.json()).resolves.toEqual({
            model: "lyria-3.5",
            input: [{ type: "text", text: options.prompt }],
        });
    });

    it.each([
        { responseFormat: "wav" },
        { durationSeconds: 30 },
        { referenceAudio: new File(["audio"], "reference.mp3") },
    ])("rejects unsupported options before starting a billable job: %j", async (unsupported) => {
        const fetchSpy = vi.spyOn(globalThis, "fetch");
        await expect(
            generateLyria35({ ...options, ...unsupported }),
        ).rejects.toMatchObject({ status: 400 });
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("rejects incomplete Google output", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            Response.json({
                status: "completed",
                steps: [{ content: [{ type: "text", text: "No audio" }] }],
            }),
        );
        await expect(generateLyria35(options)).rejects.toMatchObject({
            status: 502,
        });
    });

    it.each([
        "1",
        "2",
    ])("preserves fal's reported %s units through fallback and retains the Google quote", async (reportedUnits) => {
        vi.useFakeTimers();
        const registry = await getGenerationModelRegistry(env);
        const entry = registry.resolve(primary);
        if (!entry) throw new Error("Lyria registry entry is missing");
        const fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockImplementation(async (url) => {
                if (String(url).includes("generativelanguage.googleapis.com"))
                    return Response.json(
                        { error: { message: "Busy" } },
                        { status: 429 },
                    );
                if (url === "https://queue.fal.run/google/lyria-3.5")
                    return Response.json({
                        status_url: "https://queue.fal.run/status",
                        response_url: "https://queue.fal.run/result",
                    });
                if (url === "https://queue.fal.run/status")
                    return Response.json({ status: "COMPLETED" });
                if (url === "https://queue.fal.run/result")
                    return Response.json(
                        { audio: { url: "https://fal.media/song.mp3" } },
                        { headers: { "x-fal-billable-units": reportedUnits } },
                    );
                return new Response("ID3fal", {
                    headers: { "content-type": "audio/mpeg" },
                });
            });
        const attempts: FallbackAttempt[] = [];
        const pending = withModelFallbackResponse(
            {
                resolved: primary,
                definition: entry.definition,
                fallbackEntries: entry.fallbackEntries,
            },
            (candidate) =>
                generateLyria35({
                    ...options,
                    model: candidate.id as typeof primary | typeof fallback,
                }),
            attempts,
        );
        await vi.advanceTimersByTimeAsync(5000);
        const response = await pending;
        expect(new TextDecoder().decode(await response.arrayBuffer())).toBe(
            "ID3fal",
        );
        expect(response.headers.get(MODEL_USED_HEADER)).toBe(fallback);
        expect(attempts.map((attempt) => attempt.candidate.id)).toEqual([
            primary,
            fallback,
        ]);
        const usage = parseUsageHeaders(response.headers);
        expect(usage).toMatchObject({
            completionAudioTokens: Number(reportedUnits),
        });
        const billed = calculateUsageBilling({
            model: primary,
            usage,
            servedBy: AUDIO_SERVICES[fallback],
            quotedBy: AUDIO_SERVICES[primary],
        });
        expect(billed.cost.totalCost).toBeCloseTo(0.1 * Number(reportedUnits));
        expect(billed.price.totalPrice).toBeCloseTo(
            0.08 * Number(reportedUnits),
        );
        expect(
            fetchSpy.mock.calls.filter(
                ([url]) => url === "https://queue.fal.run/google/lyria-3.5",
            ),
        ).toHaveLength(1);
    });

    it("rejects fal output without provider billing units", async () => {
        vi.useFakeTimers();
        vi.spyOn(globalThis, "fetch")
            .mockResolvedValueOnce(
                Response.json({
                    status_url: "https://queue.fal.run/status",
                    response_url: "https://queue.fal.run/result",
                }),
            )
            .mockResolvedValueOnce(Response.json({ status: "COMPLETED" }))
            .mockResolvedValueOnce(
                Response.json({ audio: { url: "https://fal.media/song.mp3" } }),
            );
        const pending = expect(
            generateLyria35({ ...options, model: fallback }),
        ).rejects.toMatchObject({ status: 502 });
        await vi.advanceTimersByTimeAsync(5000);
        await pending;
    });
});
