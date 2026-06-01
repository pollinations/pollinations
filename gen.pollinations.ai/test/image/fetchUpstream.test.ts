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
        const error = await fetchUpstream(url, {
            errorLabel: "Foo failed",
        }).catch((e) => e);
        expect(error).toBeInstanceOf(HttpError);
        expect(error).toMatchObject({
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
