import { afterEach, describe, expect, it, vi } from "vitest";
import { syncImageEnv } from "../../src/image/env.ts";
import { callSeedanceProAPI } from "../../src/image/models/seedanceReplicateVideoModel.ts";
import type { ImageParams } from "../../src/image/params.ts";

const FRAME_URL = "https://image.example.com/start.png";
const VIDEO_URL = "https://video.example.com/seedance-pro.mp4";
const PNG_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

afterEach(() => {
    vi.restoreAllMocks();
});

describe("Seedance Pro via Replicate", () => {
    it("maps the first image to the provider start-frame field", async () => {
        syncImageEnv(
            { REPLICATE_API_TOKEN: "replicate-test-key" } as CloudflareBindings,
            ["REPLICATE_API_TOKEN"],
        );
        const inputs: Record<string, unknown>[] = [];
        vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
            const href = typeof url === "string" ? url : url.toString();
            if (href === FRAME_URL) {
                return new Response(PNG_BYTES, {
                    headers: { "Content-Type": "image/png" },
                });
            }
            if (
                href ===
                "https://api.replicate.com/v1/models/bytedance/seedance-1-pro-fast/predictions"
            ) {
                inputs.push(
                    (
                        JSON.parse(init?.body as string) as {
                            input: Record<string, unknown>;
                        }
                    ).input,
                );
                return Response.json({
                    id: "pred-seedance-pro",
                    status: "succeeded",
                    output: VIDEO_URL,
                    metrics: { video_output_duration_seconds: 5 },
                });
            }
            if (href === VIDEO_URL) {
                return new Response(new Uint8Array([0, 0, 0, 24]), {
                    headers: { "Content-Type": "video/mp4" },
                });
            }
            return new Response("unexpected URL", { status: 404 });
        });

        await callSeedanceProAPI("animate this frame", {
            model: "bytedance/seedance-1-pro-fast",
            width: 1280,
            height: 720,
            dimensionsExplicit: true,
            seed: 42,
            safe: false,
            quality: "medium",
            image: [FRAME_URL],
            transparent: false,
            reasoning: "balanced",
            audio: false,
            duration: 5,
        } satisfies ImageParams);

        expect(inputs).toHaveLength(1);
        expect(inputs[0].image).toMatch(/^data:image\/png;base64,/);
        expect(inputs[0].last_frame_image).toBeUndefined();
    });
});
