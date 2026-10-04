import { afterEach, expect, it, vi } from "vitest";
import { fetchWithRetry } from "./fetchWithRetry";

afterEach(() => {
    vi.unstubAllGlobals();
});

it("gives up on a non-429 HTTP error after one request", async () => {
    const fetchMock = vi.fn(
        async () => new Response("forbidden", { status: 403 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchWithRetry("/request")).rejects.toThrow(
        "HTTP 403: forbidden",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
});
