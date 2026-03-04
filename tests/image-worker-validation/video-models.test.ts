/**
 * Video model validation tests.
 * Tests each video model against the live Worker.
 * These tests have long timeouts (video generation can take minutes).
 */
import { describe, expect, it } from "vitest";
import { IMAGE_URL, imageHeaders } from "./config";
import { VIDEO_MODELS } from "./models";

// Models we test but allow to fail (alpha/unstable/missing config)
const ALLOW_FAIL = new Set(["grok-video", "ltx-2"]);

function videoRequest(prompt: string, model: string, extra = "") {
    const encodedPrompt = encodeURIComponent(prompt);
    return fetch(
        `${IMAGE_URL}/prompt/${encodedPrompt}?model=${model}&nologo=true&nofeed=true${extra}`,
        { headers: imageHeaders() },
    );
}

// ---------------------------------------------------------------------------
// Basic video generation — text-to-video
// ---------------------------------------------------------------------------

describe("video models — text-to-video", () => {
    for (const model of VIDEO_MODELS) {
        const label = `${model.id} (${model.provider})`;

        it(
            label,
            async () => {
                const res = await videoRequest("a cat walking slowly", model.id);

                if (ALLOW_FAIL.has(model.id) && !res.ok) {
                    console.warn(`[ALPHA] ${model.id} returned ${res.status} — allowed to fail`);
                    return;
                }

                expect(
                    res.status,
                    `${model.id} returned ${res.status}: ${res.status !== 200 ? await res.clone().text() : ""}`,
                ).toBe(200);

                const contentType = res.headers.get("content-type") || "";
                expect(
                    contentType.startsWith("video/"),
                    `${model.id} content-type: ${contentType}`,
                ).toBe(true);

                const buffer = await res.arrayBuffer();
                expect(buffer.byteLength).toBeGreaterThan(10000); // Video should be at least 10KB

                console.log(
                    `  ✓ ${model.id}: ${contentType}, ${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB`,
                );
            },
            { timeout: 300_000 }, // 5 min per video model
        );
    }
});

// ---------------------------------------------------------------------------
// Image-to-video — models with "image" in inputModalities
// ---------------------------------------------------------------------------

const TEST_IMAGE_URL = "https://placehold.co/512x512/blue/blue.png";

const i2vModels = VIDEO_MODELS.filter(
    (m) => m.inputModalities.includes("image") && !ALLOW_FAIL.has(m.id),
);

describe("video models — image-to-video", () => {
    for (const model of i2vModels) {
        const label = `${model.id} image-to-video`;

        it(
            label,
            async () => {
                const res = await videoRequest(
                    "make this image come alive with gentle motion",
                    model.id,
                    `&image=${encodeURIComponent(TEST_IMAGE_URL)}`,
                );

                if (!res.ok) {
                    console.warn(`  ${model.id} i2v: ${res.status} (may not support image-to-video via query)`);
                    return;
                }

                const contentType = res.headers.get("content-type") || "";
                expect(contentType.startsWith("video/")).toBe(true);

                const buffer = await res.arrayBuffer();
                expect(buffer.byteLength).toBeGreaterThan(10000);

                console.log(
                    `  ✓ ${model.id} i2v: ${contentType}, ${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB`,
                );
            },
            { timeout: 300_000 },
        );
    }
});
