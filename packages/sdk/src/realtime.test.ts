import { describe, expect, it } from "vitest";
import { base64ToPcm16, pcm16ToBase64, realtimeUrl } from "./realtime.js";

describe("realtimeUrl", () => {
    it("builds a secure WebSocket URL with model and key", () => {
        expect(
            realtimeUrl({ apiKey: "sk_test", model: "openai/gpt-realtime-2.1" }),
        ).toBe(
            "wss://gen.pollinations.ai/v1/realtime?model=openai%2Fgpt-realtime-2.1&key=sk_test",
        );
    });

    it("converts an http base URL and strips a trailing slash", () => {
        expect(
            realtimeUrl({
                apiKey: "sk_test",
                baseUrl: "http://localhost:8080/",
            }),
        ).toBe(
            "ws://localhost:8080/v1/realtime?model=openai%2Fgpt-realtime-2.1&key=sk_test",
        );
    });
});

describe("PCM helpers", () => {
    it("round-trips 16-bit samples", () => {
        const samples = new Int16Array([0, 1, -1, 1234, -1234, 32767, -32768]);
        const decoded = base64ToPcm16(pcm16ToBase64(samples));
        expect(Array.from(decoded)).toEqual(Array.from(samples));
    });
});
