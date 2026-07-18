import assert from "node:assert/strict";
import test from "node:test";
import { imageTools } from "../src/services/imageService.js";
import { clearApiKey, setApiKey } from "../src/utils/authUtils.js";

const VIDEO_GENERATION_TIMEOUT_MS = 10 * 60 * 1000;

test("video generation tools allow long-running requests", async () => {
    const originalFetch = globalThis.fetch;
    const originalSetTimeout = globalThis.setTimeout;
    const originalClearTimeout = globalThis.clearTimeout;
    const timeoutDelays = [];
    const requests = [];

    globalThis.setTimeout = (_callback, delay) => {
        timeoutDelays.push(delay);
        return 1;
    };
    globalThis.clearTimeout = () => {};
    globalThis.fetch = async (url, init = {}) => {
        requests.push({ url: String(url), init });
        if (String(url).endsWith("/image/models")) {
            return Response.json([
                { name: "wan-fast", output_modalities: ["video"] },
            ]);
        }
        return new Response(new Uint8Array([0, 1, 2]), {
            status: 200,
            headers: { "content-type": "video/mp4" },
        });
    };
    setApiKey("sk_test");

    try {
        const generateVideo = imageTools.find(
            ([name]) => name === "generateVideo",
        )[3];
        const generateVideoUrl = imageTools.find(
            ([name]) => name === "generateVideoUrl",
        )[3];

        await generateVideo({ prompt: "test", model: "wan-fast" });
        await generateVideoUrl({ prompt: "test", model: "wan-fast" });

        assert.equal(
            timeoutDelays.filter(
                (delay) => delay === VIDEO_GENERATION_TIMEOUT_MS,
            ).length,
            2,
        );
        assert.equal(requests.at(-1).init.method, "HEAD");
        assert.equal(
            requests.at(-1).init.headers.Authorization,
            "Bearer sk_test",
        );
    } finally {
        clearApiKey();
        globalThis.fetch = originalFetch;
        globalThis.setTimeout = originalSetTimeout;
        globalThis.clearTimeout = originalClearTimeout;
    }
});
