import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.useRealTimers();
    vi.resetModules();
});

it("appends an authenticated snapshot while preserving history and using the file SHA", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-29T00:17:00Z"));
    vi.stubEnv("GH_TOKEN", "test-only-token");
    const history = [
        { date: "2026-09-28", stars: 100, capturedAt: "2026-09-28T00:17:00Z" },
    ];
    const fetch = vi
        .fn()
        .mockResolvedValueOnce(Response.json({ object: { sha: "branch" } }))
        .mockResolvedValueOnce(
            Response.json({
                sha: "file",
                content: Buffer.from(JSON.stringify(history)).toString(
                    "base64",
                ),
            }),
        )
        .mockResolvedValueOnce(Response.json({ stargazers_count: 98 }))
        .mockResolvedValueOnce(Response.json({}));
    vi.stubGlobal("fetch", fetch);
    await import("../scripts/snapshot-stars.mjs");
    const update = JSON.parse(fetch.mock.calls[3][1].body);
    expect(update).toMatchObject({ branch: "kpi-data", sha: "file" });
    expect(
        JSON.parse(Buffer.from(update.content, "base64").toString()),
    ).toEqual([
        ...history,
        {
            date: "2026-09-29",
            stars: 98,
            capturedAt: "2026-09-29T00:17:00.000Z",
        },
    ]);
    for (const [, options] of fetch.mock.calls) {
        expect(options.headers.Authorization).toBe("Bearer test-only-token");
    }
});

it("does not replace a day's first snapshot on a retry", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-29T04:00:00Z"));
    vi.stubEnv("GH_TOKEN", "test-only-token");
    const fetch = vi
        .fn()
        .mockResolvedValueOnce(Response.json({ object: { sha: "branch" } }))
        .mockResolvedValueOnce(
            Response.json({
                sha: "file",
                content: Buffer.from(
                    JSON.stringify([{ date: "2026-09-29", stars: 98 }]),
                ).toString("base64"),
            }),
        )
        .mockResolvedValueOnce(Response.json({ stargazers_count: 110 }));
    vi.stubGlobal("fetch", fetch);
    await import("../scripts/snapshot-stars.mjs");
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(
        fetch.mock.calls.some(([, options]) => options.method === "PUT"),
    ).toBe(false);
});
