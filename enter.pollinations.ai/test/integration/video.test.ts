import { SELF } from "cloudflare:test";
import { describe, expect } from "vitest";
import { test } from "../fixtures.ts";

/**
 * Video Generation Integration Tests
 *
 * These tests verify video generation via the image endpoint with video models.
 * Uses VCR mock to record/replay responses - first run records, subsequent runs replay.
 *
 * Cost considerations:
 * - seedance: ~$0.03 per 2-second video (cheapest option)
 * - veo: ~$0.60 per 4-second video (expensive!)
 *
 * To record new snapshots: delete existing snapshots and run tests once.
 * Snapshots are stored in test/__snapshots__/
 */

describe("Video Generation Integration Tests", () => {
    /**
     * Test seedance text-to-video (T2V)
     * Uses minimum duration (2 seconds) to minimize cost during recording
     */
    test(
        "seedance T2V should return video/mp4",
        { timeout: 120000 }, // Video gen takes ~30-60 seconds
        async ({ apiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");

            const response = await SELF.fetch(
                `http://localhost:3000/api/image/a%20cat%20waving?model=seedance&duration=2`,
                {
                    method: "GET",
                    headers: {
                        authorization: `Bearer ${apiKey}`,
                    },
                },
            );

            expect(response.status).toBe(200);

            const contentType = response.headers.get("content-type");
            expect(contentType).toContain("video/mp4");

            // Verify we got actual video data
            const buffer = await response.arrayBuffer();
            expect(buffer.byteLength).toBeGreaterThan(1000); // At least 1KB
        },
    );

    /**
     * Test seedance image-to-video (I2V)
     * Provides an image URL to test the I2V model selection
     *
     * Note: I2V requires a valid accessible image URL.
     * The backend validates the image can be fetched.
     */
    test(
        "seedance I2V should return video/mp4",
        { timeout: 120000 },
        async ({ apiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");

            // Use a simple white image - results in smaller compressed video
            const imageUrl =
                "https://image.pollinations.ai/prompt/pure%20white%20background?width=512&height=512&nologo=true&seed=42";

            const response = await SELF.fetch(
                `http://localhost:3000/api/image/animate%20this%20image?model=seedance&duration=2&image=${encodeURIComponent(imageUrl)}`,
                {
                    method: "GET",
                    headers: {
                        authorization: `Bearer ${apiKey}`,
                    },
                },
            );

            // Log response for debugging if it fails
            if (response.status !== 200) {
                const body = await response.clone().text();
                console.log("I2V response:", response.status, body);
            }

            expect(response.status).toBe(200);

            const contentType = response.headers.get("content-type");
            expect(contentType).toContain("video/mp4");

            const buffer = await response.arrayBuffer();
            expect(buffer.byteLength).toBeGreaterThan(1000);
        },
    );

    /**
     * Test long prompts with image parameter (Issue #5581)
     * Verifies API handles long prompts correctly - the original report was
     * actually a Discord 8MB embed limit, not a Pollinations bug
     */
    test(
        "seedance I2V with long prompt should not fail",
        { timeout: 120000 },
        async ({ apiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");

            // Long prompt similar to the one that was reported as failing
            const longPrompt =
                "Make the character in the input image go on a wild, over-the-top adventure: " +
                "she's riding a giant slice of pizza through a city made entirely of candy, " +
                "dodging flying sushi and chased by a squad of tiny, grumpy robots wearing hats";

            // Use a simple image URL (not Discord CDN to avoid external dependencies)
            const imageUrl =
                "https://image.pollinations.ai/prompt/simple%20character?width=512&height=512&nologo=true&seed=42";

            const encodedPrompt = encodeURIComponent(longPrompt);
            const encodedImage = encodeURIComponent(imageUrl);

            const response = await SELF.fetch(
                `http://localhost:3000/api/image/${encodedPrompt}?model=seedance&duration=2&image=${encodedImage}`,
                {
                    method: "GET",
                    headers: {
                        authorization: `Bearer ${apiKey}`,
                    },
                },
            );

            // Log response for debugging
            if (response.status !== 200) {
                const body = await response.clone().text();
                console.log("Long prompt I2V response:", response.status, body);
            }

            // Should succeed, not return 413 or auth errors
            expect(response.status).toBe(200);

            const contentType = response.headers.get("content-type");
            expect(contentType).toContain("video/mp4");
        },
    );

    /**
     * Test video parameters are passed through correctly
     * Verifies duration and aspectRatio params don't cause validation errors
     */
    test(
        "video params should be accepted",
        { timeout: 120000 },
        async ({ apiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");

            const response = await SELF.fetch(
                `http://localhost:3000/api/image/test%20video?model=seedance&duration=5&aspectRatio=16:9`,
                {
                    method: "GET",
                    headers: {
                        authorization: `Bearer ${apiKey}`,
                    },
                },
            );

            // Should succeed or fail with upstream error, NOT validation error
            expect(response.status).not.toBe(400);
        },
    );

    /**
     * Test unauthenticated video request fails
     */
    test("video generation requires authentication", async ({ mocks }) => {
        await mocks.enable("polar", "tinybird");

        const response = await SELF.fetch(
            `http://localhost:3000/api/image/test?model=seedance`,
            {
                method: "GET",
                // No authorization header
            },
        );

        expect(response.status).toBe(401);
    });
});

/**
 * Wan (Alibaba) Video Generation Tests
 *
 * Cost considerations:
 * - wan with audio: $0.05/sec (720P)
 * - wan without audio: $0.025/sec (720P)
 */
describe("Wan Video Generation", () => {
    /**
     * Test wan image-to-video (I2V) with default audio
     * Wan 2.6 requires an image for I2V generation
     */
    test(
        "wan I2V should return video/mp4",
        { timeout: 180000 }, // Wan takes 1-2 minutes
        async ({ apiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");

            const imageUrl =
                "https://image.pollinations.ai/prompt/simple%20landscape?width=512&height=512&nologo=true&seed=42";

            const response = await SELF.fetch(
                `http://localhost:3000/api/generate/image/animate%20this%20scenic%20landscape?model=wan&duration=5&image=${encodeURIComponent(imageUrl)}`,
                {
                    method: "GET",
                    headers: {
                        authorization: `Bearer ${apiKey}`,
                    },
                },
            );

            if (response.status !== 200) {
                const body = await response.clone().text();
                console.log("Wan I2V response:", response.status, body);
            }

            expect(response.status).toBe(200);

            const contentType = response.headers.get("content-type");
            expect(contentType).toContain("video/mp4");

            const buffer = await response.arrayBuffer();
            expect(buffer.byteLength).toBeGreaterThan(1000);
        },
    );

    /**
     * Test wan I2V without audio (cost optimization)
     */
    test(
        "wan I2V without audio should return video/mp4",
        { timeout: 180000 },
        async ({ apiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");

            const imageUrl =
                "https://image.pollinations.ai/prompt/abstract%20pattern?width=512&height=512&nologo=true&seed=42";

            const response = await SELF.fetch(
                `http://localhost:3000/api/generate/image/make%20it%20move?model=wan&duration=5&audio=false&image=${encodeURIComponent(imageUrl)}`,
                {
                    method: "GET",
                    headers: {
                        authorization: `Bearer ${apiKey}`,
                    },
                },
            );

            if (response.status !== 200) {
                const body = await response.clone().text();
                console.log("Wan no-audio response:", response.status, body);
            }

            expect(response.status).toBe(200);

            const contentType = response.headers.get("content-type");
            expect(contentType).toContain("video/mp4");

            const buffer = await response.arrayBuffer();
            expect(buffer.byteLength).toBeGreaterThan(1000);
        },
    );

    /**
     * Test wan without image (should fail - I2V requires image)
     */
    test(
        "wan without image should fail with appropriate error",
        { timeout: 30000 },
        async ({ apiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");

            const response = await SELF.fetch(
                `http://localhost:3000/api/generate/image/create%20a%20video?model=wan&duration=5`,
                {
                    method: "GET",
                    headers: {
                        authorization: `Bearer ${apiKey}`,
                    },
                },
            );

            // Should fail since Wan requires an image for I2V
            expect([400, 500]).toContain(response.status);

            if (response.status !== 200) {
                const body = await response.text();
                expect(body.toLowerCase()).toMatch(/image|img_url|i2v/);
            }
        },
    );
});

/**
 * Expensive video tests - skipped by default
 * Run manually with: npm test -- --grep "Veo"
 */
describe("Veo Video Generation", () => {
    test(
        "veo T2V should return video/mp4",
        { timeout: 180000 }, // Veo takes longer
        async ({ apiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");

            const response = await SELF.fetch(
                `http://localhost:3000/api/image/a%20sunset%20timelapse?model=veo&duration=4`,
                {
                    method: "GET",
                    headers: {
                        authorization: `Bearer ${apiKey}`,
                    },
                },
            );

            expect(response.status).toBe(200);

            const contentType = response.headers.get("content-type");
            expect(contentType).toContain("video/mp4");

            const buffer = await response.arrayBuffer();
            expect(buffer.byteLength).toBeGreaterThan(1000);
        },
    );

    /**
     * Test veo image-to-video (I2V) - PR #6068
     * Provides an image URL to test the I2V functionality
     */
    test(
        "veo I2V should return video/mp4",
        { timeout: 180000 },
        async ({ apiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");

            // Use a simple white image - results in smaller compressed video
            const imageUrl =
                "https://image.pollinations.ai/prompt/pure%20white%20background?width=512&height=512&nologo=true&seed=42";

            const response = await SELF.fetch(
                `http://localhost:3000/api/image/animate%20this%20image?model=veo&duration=4&image=${encodeURIComponent(imageUrl)}`,
                {
                    method: "GET",
                    headers: {
                        authorization: `Bearer ${apiKey}`,
                    },
                },
            );

            // Log response for debugging if it fails
            if (response.status !== 200) {
                const body = await response.clone().text();
                console.log("Veo I2V response:", response.status, body);
            }

            expect(response.status).toBe(200);

            const contentType = response.headers.get("content-type");
            expect(contentType).toContain("video/mp4");

            const buffer = await response.arrayBuffer();
            expect(buffer.byteLength).toBeGreaterThan(1000);
        },
    );

    /**
     * Test veo first/last frame interpolation - Issue #6252
     * Provides two images via pipe separator: image[0]=first frame, image[1]=last frame
     */
    test(
        "veo interpolation with first and last frame should return video/mp4",
        { timeout: 180000 },
        async ({ apiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");

            // First frame: white background
            const firstFrame =
                "https://image.pollinations.ai/prompt/pure%20white%20background?width=512&height=512&nologo=true&seed=42";
            // Last frame: black background
            const lastFrame =
                "https://image.pollinations.ai/prompt/pure%20black%20background?width=512&height=512&nologo=true&seed=42";

            // Use pipe separator for multiple images
            const imageParam = `${firstFrame}|${lastFrame}`;

            const response = await SELF.fetch(
                `http://localhost:3000/api/image/transition%20between%20frames?model=veo&duration=4&image=${encodeURIComponent(imageParam)}`,
                {
                    method: "GET",
                    headers: {
                        authorization: `Bearer ${apiKey}`,
                    },
                },
            );

            // Log response for debugging if it fails
            if (response.status !== 200) {
                const body = await response.clone().text();
                console.log(
                    "Veo interpolation response:",
                    response.status,
                    body,
                );
            }

            expect(response.status).toBe(200);

            const contentType = response.headers.get("content-type");
            expect(contentType).toContain("video/mp4");

            const buffer = await response.arrayBuffer();
            expect(buffer.byteLength).toBeGreaterThan(1000);
        },
    );
});
