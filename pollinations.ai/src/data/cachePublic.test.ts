import { afterEach, describe, expect, it, vi } from "vitest";
import { cachePublic } from "./cachePublic";

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe("public request cache", () => {
    it("shares in-flight work and expires five minutes after success", async () => {
        vi.useFakeTimers();
        let finish!: (value: number) => void;
        const load = vi.fn(
            () =>
                new Promise<number>((resolve) => {
                    finish = resolve;
                }),
        );
        const cached = cachePublic(load);
        const first = cached();
        expect(cached()).toBe(first);
        await Promise.resolve();
        vi.advanceTimersByTime(10 * 60_000);
        expect(cached()).toBe(first); // Pending work does not expire.
        finish(42);
        await expect(first).resolves.toBe(42);
        vi.advanceTimersByTime(5 * 60_000 - 1);
        expect(cached()).toBe(first);
        vi.advanceTimersByTime(1);
        const next = cached();
        expect(next).not.toBe(first);
        expect(cached()).toBe(next);
        await Promise.resolve();
        finish(43);
        await expect(next).resolves.toBe(43);
        expect(load).toHaveBeenCalledTimes(2);
    });

    it("keeps different public queries separate", async () => {
        const load = vi.fn(async (limit: number) => limit);
        const cached = cachePublic(load);
        await expect(
            Promise.all([cached(3), cached(12), cached(3)]),
        ).resolves.toEqual([3, 12, 3]);
        expect(load).toHaveBeenCalledTimes(2);
    });

    it("does not cache failures", async () => {
        const load = vi
            .fn()
            .mockRejectedValueOnce(new Error("offline"))
            .mockResolvedValueOnce(1);
        const cached = cachePublic(load);
        await expect(cached()).rejects.toThrow("offline");
        await expect(cached()).resolves.toBe(1);
        expect(load).toHaveBeenCalledTimes(2);
    });
});

describe("website public loaders", () => {
    it("shares Discord requests between the header and Community, then refreshes", async () => {
        vi.useFakeTimers();
        vi.resetModules();
        const { loadDiscordPresence } = await import("./community");
        const fetchMock = vi.fn(async () =>
            Response.json({ presence_count: 10 }),
        );
        vi.stubGlobal("fetch", fetchMock);
        await expect(
            Promise.all([loadDiscordPresence(), loadDiscordPresence()]),
        ).resolves.toEqual([10, 10]);
        await loadDiscordPresence();
        expect(fetchMock).toHaveBeenCalledTimes(1);
        vi.advanceTimersByTime(5 * 60_000);
        await loadDiscordPresence();
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("reuses votes on return visits, preserving distinct limits", async () => {
        vi.resetModules();
        const { loadVotingIssues } = await import("./community");
        const fetchMock = vi.fn(async () => Response.json({ items: [] }));
        vi.stubGlobal("fetch", fetchMock);
        await Promise.all([loadVotingIssues(3), loadVotingIssues(3)]);
        await loadVotingIssues(3);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        await loadVotingIssues(5);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("reuses valid leaderboard data but retries invalid responses", async () => {
        vi.resetModules();
        const { loadQuestLeaderboard } = await import(
            "../ui/components/QuestLeaderboard"
        );
        const data = {
            leaderboard: [],
            totals: { contributors: 0, completedQuests: 0, totalPollen: 0 },
        };
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(Response.json({}))
            .mockResolvedValueOnce(Response.json(data));
        vi.stubGlobal("fetch", fetchMock);
        await expect(loadQuestLeaderboard()).rejects.toThrow(
            "Invalid quest leaderboard",
        );
        await expect(
            Promise.all([loadQuestLeaderboard(), loadQuestLeaderboard()]),
        ).resolves.toEqual([data, data]);
        await loadQuestLeaderboard();
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });
});
