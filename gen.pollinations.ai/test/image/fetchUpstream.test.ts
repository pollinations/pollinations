import { UpstreamError } from "@shared/error.ts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchUpstream } from "../../src/image/utils/fetchUpstream.ts";

afterEach(() => {
    vi.restoreAllMocks();
});

describe("fetchUpstream", () => {
    it("keeps a malformed provider output URL as a retryable upstream failure", async () => {
        const cause = new TypeError("Invalid URL");
        const fetcher = vi.fn(async () => {
            throw cause;
        });
        await expect(
            fetchUpstream("not-a-url", {}, fetcher),
        ).rejects.toMatchObject({
            name: "UpstreamError",
            status: 502,
            upstreamStatus: 502,
            requestUrl: undefined,
            message: "Upstream request failed: Invalid URL",
            cause,
        });
    });

    it("retains the status and URL when reading the provider error body fails", async () => {
        const cause = new TypeError(
            "Network connection lost while reading error body",
        );
        const response = new Response(
            new ReadableStream({
                start(controller) {
                    controller.error(cause);
                },
            }),
            { status: 503, headers: { "x-request-id": "provider-request" } },
        );
        const fetcher = vi.fn(async () => response);
        await expect(
            fetchUpstream("https://provider.test/generate", {}, fetcher),
        ).rejects.toMatchObject({
            status: 503,
            upstreamStatus: 503,
            requestUrl: new URL("https://provider.test/generate"),
            upstreamHeaders: { "x-request-id": "provider-request" },
            message: cause.message,
            cause,
        });
    });

    it("returns the response unchanged on 2xx", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response('{"ok":true}', { status: 200 }),
        );

        const response = await fetchUpstream("https://example.com/api");
        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({ ok: true });
    });

    it("uses a provided fetcher", async () => {
        const fetcher = vi
            .fn()
            .mockResolvedValue(new Response("vpc", { status: 200 }));

        const response = await fetchUpstream(
            "http://127.0.0.1:8000/health",
            {},
            fetcher,
        );

        expect(fetcher).toHaveBeenCalledWith(
            "http://127.0.0.1:8000/health",
            {},
        );
        expect(await response.text()).toBe("vpc");
    });

    it("preserves the provider body and request URL on non-ok response", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response("backend exploded", { status: 502 }),
        );

        const url = "https://example.com/api/v1/foo?id=bar";
        const error = await fetchUpstream(url, {
            errorLabel: "Foo failed",
        }).catch((e) => e);
        expect(error).toBeInstanceOf(UpstreamError);
        expect(error).toMatchObject({
            name: "UpstreamError",
            status: 502,
            requestUrl: new URL(url),
            upstreamStatus: 502,
            responseBody: "backend exploded",
            message: "backend exploded",
        });
    });

    it("keeps the request URL when fetch itself rejects", async () => {
        vi.spyOn(globalThis, "fetch").mockRejectedValue(
            new TypeError("Network connection lost"),
        );

        const url = "https://replicate.delivery/x/image.png";
        await expect(
            fetchUpstream(url, { errorLabel: "Failed to download output" }),
        ).rejects.toMatchObject({
            name: "UpstreamError",
            status: 502,
            requestUrl: new URL(url),
            message: "Failed to download output: Network connection lost",
        });
    });

    it("falls back to a generic message when the upstream body is empty", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response("", { status: 503 }),
        );

        await expect(
            fetchUpstream("https://example.com/api"),
        ).rejects.toMatchObject({
            message:
                "We're temporarily down for maintenance. Sorry about that!",
            status: 503,
        });
    });

    it("propagates the request init (headers, method, body)", async () => {
        const fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValue(new Response("ok", { status: 200 }));

        await fetchUpstream("https://example.com/api", {
            method: "POST",
            headers: { Authorization: "Bearer xyz" },
            body: JSON.stringify({ foo: 1 }),
            errorLabel: "ignored on success",
        });

        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const [, init] = fetchSpy.mock.calls[0];
        expect(init).toMatchObject({
            method: "POST",
            headers: { Authorization: "Bearer xyz" },
            body: JSON.stringify({ foo: 1 }),
        });
        // errorLabel must not be passed to fetch as a RequestInit field
        expect(init).not.toHaveProperty("errorLabel");
    });
});
