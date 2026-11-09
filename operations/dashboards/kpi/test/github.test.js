import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { kpiRoutes } from "../worker/kpi.ts";

afterEach(() => vi.unstubAllGlobals());

beforeEach(() => {
    const entries = new Map();
    vi.stubGlobal("caches", {
        open: async () => ({
            match: async (key) => entries.get(key.url)?.clone(),
            put: async (key, response) =>
                entries.set(key.url, response.clone()),
        }),
    });
});

it.each([undefined, "test-only-github-token"])(
    "reads public GitHub stats without depending on credentials (%s)",
    async (token) => {
        const upstream = vi.fn().mockResolvedValue(
            Response.json([
                {
                    date: "2026-09-28",
                    stars: 12,
                    capturedAt: "2026-09-28T00:17:00Z",
                },
            ]),
        );
        vi.stubGlobal("fetch", upstream);
        const result = await kpiRoutes.request(
            "https://kpi.test/github",
            {},
            { GITHUB_TOKEN: token },
        );
        expect(result.status).toBe(200);
        expect(await result.json()).toMatchObject({ stars: 12 });
        expect(upstream.mock.calls[0][0]).toBe(
            "https://raw.githubusercontent.com/pollinations/pollinations/kpi-data/github-stars.json",
        );
        const headers = new Headers(upstream.mock.calls[0][1].headers);
        expect(headers.get("Authorization")).toBeNull();
    },
);

it("reports unavailable star snapshots instead of a fake zero", async () => {
    vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response("Not found", { status: 404 })),
    );
    const response = await kpiRoutes.request("https://kpi.test/github");
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
        error: "GitHub star snapshots unavailable",
    });
});

it("reads weekly app submissions from the daily snapshot", async () => {
    const weeks = [{ week: "2026-09-21", submitted: 99 }];
    const upstream = vi.fn().mockResolvedValue(Response.json(weeks));
    vi.stubGlobal("fetch", upstream);
    const result = await kpiRoutes.request("https://kpi.test/app-submissions");
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ data: weeks });
    expect(upstream.mock.calls[0][0]).toBe(
        "https://raw.githubusercontent.com/pollinations/pollinations/kpi-data/github-app-submissions.json",
    );
});

it("reports missing app submissions without caching the failure", async () => {
    const weeks = [{ week: "2026-09-21", submitted: 99 }];
    const upstream = vi
        .fn()
        .mockResolvedValueOnce(new Response("Not found", { status: 404 }))
        .mockResolvedValueOnce(Response.json(weeks));
    vi.stubGlobal("fetch", upstream);
    const request = () => kpiRoutes.request("https://kpi.test/app-submissions");
    const missing = await request();
    expect(missing.status).toBe(502);
    expect(await missing.json()).toEqual({
        error: "App submission snapshots unavailable",
        data: [],
    });
    const recovered = await request();
    expect(await recovered.json()).toEqual({ data: weeks });
    expect(upstream).toHaveBeenCalledTimes(2);
});
