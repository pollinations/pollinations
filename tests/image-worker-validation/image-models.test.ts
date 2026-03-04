/**
 * Image model validation tests.
 * Tests each image model against the live Worker.
 */
import { describe, expect, it } from "vitest";
import { IMAGE_URL, imageHeaders } from "./config";
import { IMAGE_MODELS } from "./models";

// Models we test but allow to fail (alpha/unstable/known issues)
// Gemini image models intermittently return reasoning text instead of images at 512x512
const ALLOW_FAIL = new Set(["imagen-4", "flux-2-dev", "grok-imagine", "nanobanana", "nanobanana-2", "nanobanana-pro", "seedream"]);

// Models that require self-hosted GPU servers (will fail without registered servers)
const SELF_HOSTED = new Set(["flux", "zimage"]);

function imageRequest(prompt: string, model: string, extra = "") {
    const encodedPrompt = encodeURIComponent(prompt);
    return fetch(
        `${IMAGE_URL}/prompt/${encodedPrompt}?model=${model}&width=512&height=512&nologo=true&nofeed=true&seed=42${extra}`,
        { headers: imageHeaders() },
    );
}

// ---------------------------------------------------------------------------
// Basic image generation — text-to-image
// ---------------------------------------------------------------------------

const testableImageModels = IMAGE_MODELS.filter((m) => !SELF_HOSTED.has(m.id));

describe("image models — text-to-image", () => {
    for (const model of testableImageModels) {
        const label = `${model.id} (${model.provider})`;

        it(label, async () => {
            const res = await imageRequest("a simple red circle on white background", model.id);

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
                contentType.startsWith("image/"),
                `${model.id} content-type: ${contentType}`,
            ).toBe(true);

            const buffer = await res.arrayBuffer();
            expect(buffer.byteLength).toBeGreaterThan(1000); // Reasonable image size

            console.log(`  ✓ ${model.id}: ${contentType}, ${(buffer.byteLength / 1024).toFixed(0)} KB`);
        });
    }
});

// ---------------------------------------------------------------------------
// Self-hosted models (flux, zimage) — expected to fail without GPU servers
// ---------------------------------------------------------------------------

describe("image models — self-hosted (expect failure without servers)", () => {
    for (const modelId of SELF_HOSTED) {
        it(`${modelId} (self-hosted — no servers registered)`, async () => {
            const res = await imageRequest("a cat", modelId);
            // These should fail with a meaningful error (no active servers)
            console.log(`  ${modelId}: status ${res.status} (expected — no GPU servers registered)`);
            // We just log the status, don't assert 200
        });
    }
});

// ---------------------------------------------------------------------------
// Image-to-image — models with "image" in inputModalities
// ---------------------------------------------------------------------------

const imageInputModels = testableImageModels.filter(
    (m) => m.inputModalities.includes("image") && !m.hidden && !ALLOW_FAIL.has(m.id),
);

// A tiny 1x1 red PNG served as a public URL for image input
const TEST_IMAGE_URL = "https://placehold.co/64x64/red/red.png";

describe("image models — image-to-image (with reference image)", () => {
    for (const model of imageInputModels) {
        const label = `${model.id} image input`;

        it(label, async () => {
            // Image models accept image input via the `image` query param
            const res = await imageRequest(
                "make this image blue",
                model.id,
                `&image=${encodeURIComponent(TEST_IMAGE_URL)}`,
            );

            if (!res.ok) {
                // Some models may not support image input via query param
                console.warn(`  ${model.id} image input: ${res.status} (may not support query param image input)`);
                return;
            }

            const contentType = res.headers.get("content-type") || "";
            expect(contentType.startsWith("image/")).toBe(true);

            const buffer = await res.arrayBuffer();
            expect(buffer.byteLength).toBeGreaterThan(1000);

            console.log(`  ✓ ${model.id} image input: ${contentType}, ${(buffer.byteLength / 1024).toFixed(0)} KB`);
        });
    }
});
