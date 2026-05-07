import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "../../src/image/httpError.ts";
import { fetchUpstream } from "../../src/image/utils/fetchUpstream.ts";

afterEach(() => {
    vi.restoreAllMocks();
});

describe("fetchUpstream", () => {
    it("returns the response unchanged on 2xx", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response('{"ok":true}', { status: 200 }),
        );

        const response = await fetchUpstream("https://example.com/api");
        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({ ok: true });
    });

    it("throws HttpError with upstreamUrl populated on non-ok response", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response("backend exploded", { status: 502 }),
        );

        const url = "https://example.com/api/v1/foo?id=bar";
        await expect(
            fetchUpstream(url, { errorLabel: "Foo failed" }),
        ).rejects.toMatchObject({
            name: "HttpError",
            status: 502,
            upstreamUrl: url,
            message: "Foo failed: backend exploded",
        });
    });

    it("falls back to a generic message when the upstream body is empty", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response("", { status: 503 }),
        );

        await expect(
            fetchUpstream("https://example.com/api"),
        ).rejects.toMatchObject({
            message: "Upstream request failed",
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

describe("fetchUpstream + HttpError integration", () => {
    it("HttpError carries the URL exactly as fetched (no stripping)", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response("nope", { status: 500 }),
        );

        const url =
            "https://ltx2-backend.pollinations.ai/result?prompt_id=abc-123";
        try {
            await fetchUpstream(url);
            expect.fail("should have thrown");
        } catch (e) {
            expect(e).toBeInstanceOf(HttpError);
            expect((e as HttpError).upstreamUrl).toBe(url);
        }
    });
});
