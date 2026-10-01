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

it.each([
    undefined,
    "test-only-github-token",
])("reads public GitHub stats without depending on credentials (%s)", async (token) => {
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
});

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

it("paginates submissions, ignores PRs and older issues, and caches successful pages", async () => {
    const page = Array.from({ length: 98 }, () => ({
        created_at: "2026-09-21T12:00:00Z",
    }));
    page.push({ created_at: "2026-09-21T12:00:00Z", pull_request: {} });
    page.push({ created_at: "2025-09-01T12:00:00Z" });
    const upstream = vi
        .fn()
        .mockResolvedValueOnce(Response.json(page))
        .mockResolvedValueOnce(
            Response.json([
                { created_at: "2026-09-27T23:59:59Z" },
                { created_at: "2026-09-28T00:00:00Z" },
            ]),
        );
    vi.stubGlobal("fetch", upstream);
    const request = () =>
        kpiRoutes.request(
            "https://kpi.test/app-submissions",
            {},
            { GITHUB_TOKEN: "expired-token" },
        );
    for (let i = 0; i < 2; i++) {
        const result = await request();
        expect(result.status).toBe(200);
        expect(await result.json()).toEqual({
            data: [
                { week: "2026-09-21", submitted: 99 },
                { week: "2026-09-28", submitted: 1 },
            ],
        });
    }
    expect(upstream).toHaveBeenCalledTimes(2);
    expect(new URL(upstream.mock.calls[1][0]).searchParams.get("page")).toBe(
        "2",
    );
    expect(
        new Headers(upstream.mock.calls[0][1].headers).has("Authorization"),
    ).toBe(false);
});

it("does not cache GitHub failures or return partial submission totals", async () => {
    const fullPage = Array.from({ length: 100 }, () => ({
        created_at: "2026-09-21T12:00:00Z",
    }));
    const upstream = vi
        .fn()
        .mockResolvedValueOnce(Response.json(fullPage))
        .mockResolvedValueOnce(
            Response.json(
                { message: "API rate limit exceeded" },
                { status: 403 },
            ),
        )
        .mockResolvedValueOnce(Response.json([]));
    vi.stubGlobal("fetch", upstream);
    const request = () =>
        kpiRoutes.request("https://kpi.test/app-submissions", {}, {});
    const failed = await request();
    expect(failed.status).toBe(502);
    expect(await failed.json()).toEqual({ error: "GitHub 403", data: [] });
    const recovered = await request();
    expect(recovered.status).toBe(200);
    expect(await recovered.json()).toEqual({
        data: [{ week: "2026-09-21", submitted: 100 }],
    });
    expect(upstream).toHaveBeenCalledTimes(3);
});
