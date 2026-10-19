import { afterEach, expect, it, vi } from "vitest";
import { readVendorJournals } from "./planning";

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
});

it("caches journals for 24 hours, supports explicit refresh, isolates credentials and retries failures", async () => {
    // Ephemeral test key only; no provider credential or network access.
    const keys = await crypto.subtle.generateKey(
        {
            name: "RSASSA-PKCS1-v1_5",
            modulusLength: 2048,
            publicExponent: new Uint8Array([1, 0, 1]),
            hash: "SHA-256",
        },
        true,
        ["sign", "verify"],
    );
    const privateKey = Buffer.from(
        await crypto.subtle.exportKey("pkcs8", keys.privateKey),
    ).toString("base64");
    const env = (email: string) => ({
        ECONOMICS_GOOGLE_DRIVE_CREDENTIALS: JSON.stringify({
            client_email: email,
            private_key: `-----BEGIN PRIVATE KEY-----\n${privateKey}\n-----END PRIVATE KEY-----`,
        }),
    });
    vi.useFakeTimers();
    let unavailable = false;
    let recordedAt = "2026-10-18T12:00:00Z";
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        if (unavailable) return new Response("Unavailable", { status: 503 });
        if (url.hostname === "oauth2.googleapis.com")
            return Response.json({ access_token: "test-only-token" });
        if (url.pathname.endsWith("/files"))
            return Response.json({
                files: [{ id: "vendor-file", name: "example.json" }],
            });
        return Response.json({
            version: 1,
            vendor: { id: "example" },
            recordedAt,
            forecastRules: {},
            reviewNotes: {},
        });
    });
    vi.stubGlobal("fetch", fetch);
    const account = env("test@example.invalid");
    const first = await readVendorJournals(account);
    expect(await readVendorJournals(account)).toBe(first);
    expect(fetch).toHaveBeenCalledTimes(3);
    vi.advanceTimersByTime(23 * 60 * 60_000);
    expect(await readVendorJournals(account)).toBe(first);
    expect(fetch).toHaveBeenCalledTimes(3);
    vi.advanceTimersByTime(60 * 60_000 + 1);
    recordedAt = "2026-10-19T12:00:00Z";
    const refreshed = await readVendorJournals(account);
    expect(refreshed.planning.recordedAt).toBe(recordedAt);
    expect(refreshed).not.toBe(first);
    expect(fetch).toHaveBeenCalledTimes(6);
    recordedAt = "2026-10-19T12:01:00Z";
    const forced = await readVendorJournals(account, true);
    expect(forced.planning.recordedAt).toBe(recordedAt);
    expect(forced).not.toBe(refreshed);
    expect(await readVendorJournals(account)).toBe(forced);
    expect(fetch).toHaveBeenCalledTimes(9);
    const other = env("other@example.invalid");
    expect(await readVendorJournals(other)).not.toBe(refreshed);
    expect(fetch).toHaveBeenCalledTimes(12);
    unavailable = true;
    await expect(readVendorJournals(other, true)).rejects.toThrow(
        "authentication failed",
    );
    unavailable = false;
    expect((await readVendorJournals(other, true)).planning.recordedAt).toBe(
        recordedAt,
    );
    expect(fetch).toHaveBeenCalledTimes(16);
    await expect(readVendorJournals({})).rejects.toThrow("not configured");

    // A stalled request must not be reused by the next request, and a late
    // result must not replace the newer successful refresh.
    let release: ((response: Response) => void) | undefined;
    fetch.mockImplementationOnce(
        () =>
            new Promise<Response>((resolve) => {
                release = resolve;
            }),
    );
    const isolated = env("independent@example.invalid");
    const slow = readVendorJournals(isolated);
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    recordedAt = "2026-10-19T13:00:00Z";
    const newer = await readVendorJournals(isolated);
    expect(newer.planning.recordedAt).toBe(recordedAt);
    recordedAt = "2026-10-19T12:00:00Z";
    release?.(Response.json({ access_token: "test-only-token" }));
    expect((await slow).planning.recordedAt).toBe(recordedAt);
    expect(await readVendorJournals(isolated)).toBe(newer);

    // The whole load deadline reaches the upstream request; a timed-out
    // refresh cannot poison the completed cache or prevent another refresh.
    const deadline = new AbortController();
    const timeout = AbortSignal.timeout.bind(AbortSignal);
    vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) =>
        ms === 60_000 ? deadline.signal : timeout(ms),
    );
    let pendingSignal: AbortSignal | undefined;
    fetch.mockImplementationOnce((_input, options?: RequestInit) => {
        pendingSignal = options?.signal ?? undefined;
        return new Promise<Response>((_resolve, reject) => {
            pendingSignal?.addEventListener("abort", () =>
                reject(pendingSignal?.reason),
            );
        });
    });
    const timedOut = readVendorJournals(isolated, true);
    const rejected = expect(timedOut).rejects.toThrow("timed out");
    await vi.waitFor(() => expect(pendingSignal).toBeDefined());
    deadline.abort(new DOMException("Journal load timed out", "TimeoutError"));
    await rejected;
    expect(await readVendorJournals(isolated)).toBe(newer);
    vi.restoreAllMocks();
    expect(await readVendorJournals(isolated, true)).not.toBe(newer);
});
