import { SELF } from "cloudflare:test";
import { test } from "../fixtures.ts";
import { describe, expect } from "vitest";

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
                `http://localhost:3000/api/generate/image/a%20cat%20waving?model=seedance&duration=2`,
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
    // Skip I2V test until backend is deployed with the fix
    // The fix switches to seedance-1-0-lite-i2v model when image is provided
    test.skip(
        "seedance I2V should return video/mp4",
        { timeout: 120000 },
        async ({ apiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");

            // Use a proper image - favicon.ico is not valid for video generation
            const imageUrl =
                "https://image.pollinations.ai/prompt/a%20cat?width=512&height=512&nologo=true&seed=42";

            const response = await SELF.fetch(
                `http://localhost:3000/api/generate/image/animate%20this%20image?model=seedance&duration=2&image=${encodeURIComponent(imageUrl)}`,
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
     * Test video parameters are passed through correctly
     * Verifies duration and aspectRatio params don't cause validation errors
     */
    test(
        "video params should be accepted",
        { timeout: 120000 },
        async ({ apiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");

            const response = await SELF.fetch(
                `http://localhost:3000/api/generate/image/test%20video?model=seedance&duration=5&aspectRatio=16:9`,
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
            `http://localhost:3000/api/generate/image/test?model=seedance`,
            {
                method: "GET",
                // No authorization header
            },
        );

        expect(response.status).toBe(401);
    });
});

/**
 * Expensive video tests - skipped by default
 * Run manually with: npm test -- --grep "Veo"
 */
describe.skip("Veo Video Generation (Expensive)", () => {
    test(
        "veo T2V should return video/mp4",
        { timeout: 180000 }, // Veo takes longer
        async ({ apiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");

            const response = await SELF.fetch(
                `http://localhost:3000/api/generate/image/a%20sunset%20timelapse?model=veo&duration=4`,
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
});
