import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { syncImageEnvironment } from "../../src/image/handler.ts";
import { callSeedanceProAPI } from "../../src/image/models/seedanceReplicateVideoModel.ts";
import { callSeedanceV2API } from "../../src/image/models/seedanceV2VideoModel.ts";
import type { ImageParams } from "../../src/image/params.ts";

type ReplicateRequest = {
    url: string;
    input: Record<string, unknown>;
};

const baseParams: ImageParams = {
    model: "seedance-pro",
    width: 1280,
    height: 720,
    dimensionsExplicit: true,
    seed: 42,
    safe: false,
    quality: "medium",
    image: [],
    transparent: false,
    reasoning: "balanced",
    audio: false,
    duration: 5,
    resolution: "720p",
};

function mockReplicateFetch(requests: ReplicateRequest[]) {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
        const href = typeof url === "string" ? url : url.toString();
        if (new URL(href).hostname !== "api.replicate.com") {
            return new Response(new Uint8Array([0, 0, 0, 24]), {
                status: 200,
                headers: { "content-type": "video/mp4" },
            });
        }

        const body = JSON.parse(init?.body as string) as {
            input: Record<string, unknown>;
        };
        requests.push({ url: href, input: body.input });
        return Response.json(
            {
                id: "prediction-test",
                status: "succeeded",
                output: "https://replicate.delivery/output.mp4",
                metrics: { video_output_duration_seconds: 5 },
            },
            { status: 201 },
        );
    });
}

beforeEach(() => {
    syncImageEnvironment({
        ...env,
        REPLICATE_API_TOKEN: "r8_test_token",
    } as CloudflareBindings);
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("Seedance resolution forwarding", () => {
    it("passes 1080p to Seedance Pro", async () => {
        const requests: ReplicateRequest[] = [];
        mockReplicateFetch(requests);

        await callSeedanceProAPI("test", {
            ...baseParams,
            resolution: "1080p",
        });

        expect(requests).toHaveLength(1);
        expect(requests[0].url).toContain(
            "/models/bytedance/seedance-1-pro-fast/predictions",
        );
        expect(requests[0].input.resolution).toBe("1080p");
    });

    it("passes 480p to Seedance 2.0", async () => {
        const requests: ReplicateRequest[] = [];
        mockReplicateFetch(requests);

        await callSeedanceV2API("test", {
            ...baseParams,
            model: "seedance-2.0",
            resolution: "480p",
        });

        expect(requests).toHaveLength(1);
        expect(requests[0].url).toContain(
            "/models/bytedance/seedance-2.0/predictions",
        );
        expect(requests[0].input).toMatchObject({
            resolution: "480p",
            generate_audio: false,
        });
    });
});
