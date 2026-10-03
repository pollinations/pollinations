import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("fetchWithRetry", () => {
    it.each([
        400, 401, 403, 404, 500,
    ])("reports HTTP %s with its body after one request", async (status) => {
        const { fetchWithRetry } = await import("./fetchWithRetry");
        const fetchMock = vi.fn(
            async () => new Response("request rejected", { status }),
        );
        vi.stubGlobal("fetch", fetchMock);

        await expect(fetchWithRetry("/request")).rejects.toThrow(
            `HTTP ${status}: request rejected`,
        );
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(vi.getTimerCount()).toBe(0);
    });

    it("returns the successful response without consuming its body", async () => {
        const { fetchWithRetry } = await import("./fetchWithRetry");
        const response = new Response("success");
        const fetchMock = vi.fn().mockResolvedValue(response);
        vi.stubGlobal("fetch", fetchMock);
        const options = { method: "POST", body: "prompt" };

        await expect(fetchWithRetry("/request", options)).resolves.toBe(
            response,
        );
        expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/request", options);
        expect(response.bodyUsed).toBe(false);
    });

    it("waits for the 429 backoff plus its buffer before retrying", async () => {
        const { fetchWithRetry } = await import("./fetchWithRetry");
        const response = new Response("success");
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(
                Response.json({ retryAfterSeconds: 2 }, { status: 429 }),
            )
            .mockResolvedValueOnce(response);
        vi.stubGlobal("fetch", fetchMock);
        const options = { method: "POST", body: "prompt" };
        const result = fetchWithRetry("/request", options);

        await vi.advanceTimersByTimeAsync(2999);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1);
        await expect(result).resolves.toBe(response);
        expect(fetchMock.mock.calls).toEqual([
            ["/request", options],
            ["/request", options],
        ]);
    });

    it.each([
        "not JSON",
        "{}",
    ])("uses the default 429 delay for %s", async (body) => {
        const { fetchWithRetry } = await import("./fetchWithRetry");
        const response = new Response("success");
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(new Response(body, { status: 429 }))
            .mockResolvedValueOnce(response);
        vi.stubGlobal("fetch", fetchMock);
        const result = fetchWithRetry("/request");

        await vi.advanceTimersByTimeAsync(15999);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1);
        await expect(result).resolves.toBe(response);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("reports the final 429 after three requests and two waits", async () => {
        const { fetchWithRetry } = await import("./fetchWithRetry");
        const fetchMock = vi.fn(async () =>
            Response.json({ retryAfterSeconds: 2 }, { status: 429 }),
        );
        vi.stubGlobal("fetch", fetchMock);
        const rejected = expect(fetchWithRetry("/request")).rejects.toThrow(
            'HTTP 429: {"retryAfterSeconds":2}',
        );

        await vi.advanceTimersByTimeAsync(5999);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        await vi.advanceTimersByTimeAsync(1);
        await rejected;
        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(vi.getTimerCount()).toBe(0);
    });

    it("propagates transport errors without retrying", async () => {
        const { fetchWithRetry } = await import("./fetchWithRetry");
        const error = new TypeError("network unavailable");
        const fetchMock = vi.fn().mockRejectedValue(error);
        vi.stubGlobal("fetch", fetchMock);

        await expect(fetchWithRetry("/request")).rejects.toBe(error);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("keeps requests serialized and resumes the queue after failure", async () => {
        const { fetchWithRetry } = await import("./fetchWithRetry");
        let finishFirst!: (response: Response) => void;
        const firstResponse = new Promise<Response>((resolve) => {
            finishFirst = resolve;
        });
        const response = new Response("success");
        const fetchMock = vi
            .fn()
            .mockReturnValueOnce(firstResponse)
            .mockResolvedValue(response);
        vi.stubGlobal("fetch", fetchMock);
        const rejected = expect(fetchWithRetry("/first")).rejects.toThrow(
            "HTTP 403: forbidden",
        );
        const next = fetchWithRetry("/second");

        await vi.advanceTimersByTimeAsync(10000);
        expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/first", undefined);
        finishFirst(new Response("forbidden", { status: 403 }));
        await rejected;
        await vi.advanceTimersByTimeAsync(999);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1);
        await expect(next).resolves.toBe(response);
        expect(fetchMock.mock.calls).toEqual([
            ["/first", undefined],
            ["/second", undefined],
        ]);
    });
});
