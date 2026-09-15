import { afterEach, describe, expect, it, vi } from "vitest";
import {
    appIdentity,
    type DirectoryApp,
    selectShowcaseApps,
} from "./publicStats";

afterEach(() => vi.unstubAllGlobals());

describe("app identity", () => {
    it("keeps same-name apps at different URLs distinct", () => {
        const first = {
            name: "AI Image Generator",
            web_url: "https://first.example",
            github_repository_url: "",
        };
        const second = { ...first, web_url: "https://second.example" };
        expect(appIdentity(first)).not.toBe(appIdentity(second));
        expect(appIdentity(first)).toBe(
            appIdentity({ ...first, name: "ai image generator" }),
        );
    });

    it("identifies repository-only apps", () => {
        expect(
            appIdentity({
                name: "CLI",
                web_url: "",
                github_repository_url: "https://github.com/example/cli",
            }),
        ).toBe("cli|https://github.com/example/cli");
    });
});

describe("app showcase", () => {
    const app = (name: string, requests: number, date = "2026-09-01") =>
        ({
            name,
            description: "An app",
            requests_24h: requests,
            approved_date: date,
        }) as DirectoryApp;

    it("selects active apps by usage and recency without mutating the catalog", () => {
        const catalog = [
            app("Low usage", 99),
            app("Popular", 500),
            app("Newer", 100, "2026-09-11"),
            app("Older", 100),
            { ...app("No description", 1000), description: "" },
        ];
        expect(selectShowcaseApps(catalog).map((item) => item.name)).toEqual([
            "Popular",
            "Newer",
            "Older",
        ]);
        expect(catalog[0].name).toBe("Low usage");
    });

    it("limits the showcase to eight apps", () => {
        expect(
            selectShowcaseApps(
                Array.from({ length: 12 }, (_, i) => app(String(i), 100 + i)),
            ),
        ).toHaveLength(8);
        expect(selectShowcaseApps([])).toEqual([]);
    });
});

describe("platform stats", () => {
    it("retries a failed catalog rather than reporting zero models or caching failure", async () => {
        vi.resetModules();
        const { loadPlatformStats } = await import("./publicStats");
        let catalogAvailable = false;
        const fetchMock = vi.fn(async (url: string) => {
            if (url.endsWith("/models")) {
                return catalogAvailable
                    ? Response.json([
                          { name: "model", category: "image" },
                          {
                              name: "owner/agent",
                              category: "text",
                              agent: true,
                          },
                      ])
                    : new Response("Unavailable", { status: 503 });
            }
            return Response.json({
                data: url.includes("weekly_health_stats")
                    ? [
                          {
                              week: "2026-01-05",
                              total_requests: 1234,
                              official_availability: 99.9,
                          },
                      ]
                    : [],
            });
        });
        vi.stubGlobal("fetch", fetchMock);

        await expect(loadPlatformStats()).rejects.toThrow("models: 503");
        catalogAvailable = true;
        await expect(loadPlatformStats()).resolves.toMatchObject({
            models: 1,
            agents: 1,
        });
        expect(fetchMock).toHaveBeenCalledTimes(6);
        await loadPlatformStats();
        expect(fetchMock).toHaveBeenCalledTimes(6);
    });

    it("rejects malformed catalog responses", async () => {
        vi.resetModules();
        const { loadPlatformStats } = await import("./publicStats");
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => Response.json({ data: [] })),
        );
        await expect(loadPlatformStats()).rejects.toThrow(
            "models: invalid catalog",
        );
    });

    it("does not turn missing health data into zero weekly requests", async () => {
        vi.resetModules();
        const { loadPlatformStats } = await import("./publicStats");
        vi.stubGlobal(
            "fetch",
            vi.fn(async (url: string) =>
                Response.json(url.endsWith("/models") ? [] : { data: [] }),
            ),
        );
        await expect(loadPlatformStats()).rejects.toThrow(
            "weekly health: no complete week available",
        );
    });
});
