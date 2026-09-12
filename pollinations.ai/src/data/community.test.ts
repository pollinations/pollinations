import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllGlobals());

const generatedAt = "2026-09-12T06:00:00.000Z";
const archive = (count = 1) => ({
    generatedAt,
    allTimeCount: count + 500,
    pullRequests: Array.from({ length: count }, (_, index) => ({
        number: index + 1,
        date: "2026-09-11",
        title: `Change ${index + 1}`,
        author: "builder",
    })),
});

describe("community history archive", () => {
    it("loads complete history beyond the old search cap without visitor GitHub API requests", async () => {
        vi.resetModules();
        const { loadPullRequestHistory } = await import("./community");
        const fetchMock = vi.fn(async (_url: string) =>
            Response.json(archive(1201)),
        );
        vi.stubGlobal("fetch", fetchMock);

        const history = await loadPullRequestHistory();
        expect(history.pullRequests).toHaveLength(1201);
        expect(history.allTimeCount).toBe(1701);
        expect(history.updatedAt).toBe(generatedAt);
        expect(history.fallback).toBe(false);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0][0]).toContain(
            "raw.githubusercontent.com",
        );
    });

    it("dates and identifies the bundled fallback, then retries the remote archive", async () => {
        vi.resetModules();
        const { loadPullRequestHistory } = await import("./community");
        const saved = { ...archive(), generatedAt: "2026-08-30T10:00:00.000Z" };
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(new Response("Unavailable", { status: 503 }))
            .mockResolvedValueOnce(Response.json(saved))
            .mockResolvedValueOnce(Response.json(archive(2)));
        vi.stubGlobal("fetch", fetchMock);

        await expect(loadPullRequestHistory()).resolves.toMatchObject({
            fallback: true,
            updatedAt: saved.generatedAt,
        });
        await expect(loadPullRequestHistory()).resolves.toMatchObject({
            fallback: false,
            updatedAt: generatedAt,
            allTimeCount: 502,
        });
        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(fetchMock.mock.calls[1][0]).toBe(
            "/data/community-pr-history.json",
        );
    });
});

describe("build diary stories", () => {
    const day = {
        date: "2026-09-11",
        prCount: 2,
        title: "Two changes",
        summary: "Merged two PRs.",
        imageUrl: null,
    };
    const month = {
        month: "2026-09",
        prCount: 30,
        title: null,
        summary: null,
        imageUrl: null,
    };

    it("fetches only the selected monthly summary", async () => {
        vi.resetModules();
        const { loadBuildDiaryStory } = await import("./community");
        const fetchMock = vi.fn(async (_url: string) =>
            Response.json({
                title: "September",
                summary: "A monthly summary.\n\nMore details.",
            }),
        );
        vi.stubGlobal("fetch", fetchMock);

        await expect(loadBuildDiaryStory(month, day)).resolves.toMatchObject({
            period: "month",
            month: "2026-09",
            prCount: 30,
            summary: "A monthly summary.",
        });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0][0]).toContain(
            "monthly/2026-09/summary.json",
        );
    });

    it("falls back to the selected day when its monthly summary does not exist", async () => {
        vi.resetModules();
        const { loadBuildDiaryStory } = await import("./community");
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(new Response("Missing", { status: 404 }))
            .mockResolvedValueOnce(
                Response.json({
                    date: day.date,
                    title: "Daily news",
                    summary: "Daily summary.",
                }),
            );
        vi.stubGlobal("fetch", fetchMock);

        await expect(loadBuildDiaryStory(month, day)).resolves.toMatchObject({
            period: "day",
            date: day.date,
            title: "Daily news",
            prCount: 2,
        });
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock.mock.calls[1][0]).toContain(
            "daily/2026-09-11/summary.json",
        );
    });
});
