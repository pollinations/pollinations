import { afterEach, expect, it, vi } from "vitest";
import { readVendorJournals } from "./planning";

afterEach(() => {
    vi.unstubAllGlobals();
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
    const [first, concurrent] = await Promise.all([
        readVendorJournals(account),
        readVendorJournals(account),
    ]);
    expect(concurrent).toBe(first);
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
    expect((await readVendorJournals(other)).planning.recordedAt).toBe(
        recordedAt,
    );
    expect(fetch).toHaveBeenCalledTimes(16);
    await expect(readVendorJournals({})).rejects.toThrow("not configured");
});
