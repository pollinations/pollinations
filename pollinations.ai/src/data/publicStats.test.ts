import { afterEach, describe, expect, it, vi } from "vitest";
import {
    appIdentity,
    byopRequests24h,
    compareAppUsage,
    type DirectoryApp,
    isBuzz,
    selectWeeklyApps,
    type WeeklyAppUsage,
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

describe("BYOP-only popularity", () => {
    const app = (
        byop: DirectoryApp["byop"],
        requests_24h: DirectoryApp["requests_24h"],
    ) => ({ byop, requests_24h }) as DirectoryApp;

    it.each([true, 1, "true"])("accepts the catalog BYOP flag %s", (flag) => {
        expect(byopRequests24h(app(flag, "250"))).toBe(250);
        expect(isBuzz(app(flag, "250"))).toBe(true);
    });

    it.each([
        false,
        0,
        "false",
        "",
    ])("ignores developer totals for flag %s", (flag) => {
        expect(byopRequests24h(app(flag, 999999))).toBeNull();
        expect(isBuzz(app(flag, 999999))).toBe(false);
    });

    it.each([
        null,
        "",
        " ",
        "invalid",
        -1,
        Infinity,
        NaN,
    ])("treats invalid or missing usage %s as unknown", (requests) => {
        expect(byopRequests24h(app(true, requests))).toBeNull();
        expect(isBuzz(app(true, requests))).toBe(false);
    });

    it("preserves measured zero and the popularity threshold", () => {
        expect(byopRequests24h(app(true, "0"))).toBe(0);
        expect(isBuzz(app(true, 99))).toBe(false);
        expect(isBuzz(app(true, 100))).toBe(true);
    });

    it("ranks BYOP usage first and retains other apps without ranking their developer totals", () => {
        const developerApp = app(false, 999999);
        const secondDeveloperApp = app(false, 999999);
        const zero = app(true, 0);
        const low = app(true, 20);
        const high = app(true, "200");
        const catalog = [developerApp, zero, low, secondDeveloperApp, high];
        expect([...catalog].sort(compareAppUsage)).toEqual([
            high,
            low,
            zero,
            developerApp,
            secondDeveloperApp,
        ]);
        expect(compareAppUsage(developerApp, app(false, 1))).toBe(0);
        expect(catalog[0]).toBe(developerApp);
    });
});

describe("weekly featured apps", () => {
    const app = (name: string, web_url = `https://${name}.example`) =>
        ({
            name,
            web_url,
            github_username: "owner",
            language: "en",
            byop: "",
            requests_24h: null,
        }) as DirectoryApp;
    const usage = (item: DirectoryApp, request_count = 1): WeeklyAppUsage => ({
        app_name: item.name,
        app_url: item.web_url,
        owner: "OWNER",
        request_count,
    });

    it("keeps server ranking", () => {
        const first = app("First");
        const second = app("Second");
        const result = selectWeeklyApps(
            [second, first],
            [usage(first, 50), usage(second, 10)],
        );
        expect(result.map((item) => item.name)).toEqual(["First", "Second"]);
    });

    it("requires the exact catalog URL, name, and owner, not just a shared hostname", () => {
        const item = app("App", "https://shared.example/app");
        const wrong = [
            { ...usage(item), app_url: "https://shared.example/another" },
            { ...usage(item), app_name: "Unlisted app" },
            { ...usage(item), owner: "someone-else" },
        ];
        expect(selectWeeklyApps([item], wrong)).toEqual([]);
        expect(selectWeeklyApps([item], [...wrong, usage(item)])).toHaveLength(
            1,
        );
    });

    it("adds no usage or description threshold to the server ranking", () => {
        const catalog = [app("Low usage"), app("No description")];
        expect(
            selectWeeklyApps(catalog, [
                usage(catalog[0], 1),
                usage(catalog[1], 0),
            ]).map((item) => item.name),
        ).toEqual(["Low usage", "No description"]);
    });

    it("features English listings only, bilingual ones included", () => {
        const catalog = [
            { ...app("English"), language: "en-US" },
            { ...app("Bilingual"), language: "zh-TW,en" },
            { ...app("French"), language: "fr" },
            { ...app("Untagged"), language: "" },
        ];
        expect(
            selectWeeklyApps(
                catalog,
                catalog.map((item) => usage(item)),
            ).map((item) => item.name),
        ).toEqual(["English", "Bilingual"]);
    });

    it("caps at eight distinct apps and never fills missing entries from unranked apps", () => {
        const catalog = Array.from({ length: 12 }, (_, i) => app(`App${i}`));
        expect(
            selectWeeklyApps(catalog, [usage(catalog[0]), usage(catalog[0])]),
        ).toHaveLength(1);
        expect(
            selectWeeklyApps(
                catalog,
                catalog.map((item) => usage(item)),
            ),
        ).toHaveLength(8);
        expect(selectWeeklyApps(catalog, [])).toEqual([]);
        expect(
            selectWeeklyApps(
                [],
                catalog.map((item) => usage(item)),
            ),
        ).toEqual([]);
    });

    it("requests a wider weekly ranking, shares the catalog, and retries failed rankings", async () => {
        vi.resetModules();
        const { loadWeeklyApps } = await import("./publicStats");
        const item = app("App");
        let available = false;
        const fetchMock = vi.fn(async (url: string) => {
            if (url.includes("app_top_weekly")) {
                expect(new URL(url).searchParams.get("limit")).toBe("50");
                return available
                    ? Response.json({ data: [usage(item)] })
                    : new Response("Unavailable", { status: 503 });
            }
            return Response.json({ data: [item] });
        });
        vi.stubGlobal("fetch", fetchMock);
        await expect(loadWeeklyApps()).rejects.toThrow("app_top_weekly: 503");
        available = true;
        const hello = loadWeeklyApps();
        const apps = loadWeeklyApps();
        expect(hello).toBe(apps);
        await expect(hello).resolves.toEqual([item]);
        expect(await loadWeeklyApps()).toBe(await hello);
        expect(fetchMock).toHaveBeenCalledTimes(3);
    });
});

describe("platform stats", () => {
    it("counts community models and agents by catalog metadata, not name separators", async () => {
        vi.resetModules();
        const { loadPlatformStats } = await import("./publicStats");
        const catalog = [
            {
                name: "openai/gpt-5.4-nano",
                category: "text",
                community: false,
            },
            { name: "flux", category: "image", community: false },
            {
                name: "google/gemini-image",
                category: "image",
                community: false,
            },
            {
                name: "community/example/image",
                category: "image",
                community: true,
            },
            {
                name: "community/example/agent",
                category: "text",
                community: true,
                agent: true,
            },
            // Missing classification must not be guessed from the name.
            { name: "community/unclassified/model", category: "text" },
        ];
        vi.stubGlobal(
            "fetch",
            vi.fn(async (url: string) => {
                if (url.endsWith("/models")) return Response.json(catalog);
                return Response.json({ data: [] });
            }),
        );

        await expect(loadPlatformStats()).resolves.toMatchObject({
            // Community agents count as agents, not community models.
            community: 1,
            agents: 1,
            // Kinds count official models only; agents are not a kind.
            kinds: { text: 2, image: 2 },
        });
    });

    it("picks the two newest general-purpose models per category and for the community", async () => {
        vi.resetModules();
        const { loadPlatformStats } = await import("./publicStats");
        const catalog = [
            {
                name: "old",
                title: "Old",
                category: "image",
                publisher: "A",
                added_date: 1,
            },
            {
                name: "new",
                title: "New",
                category: "image",
                publisher: "B",
                added_date: 3,
            },
            {
                name: "new-turbo",
                title: "New Turbo",
                category: "image",
                publisher: "B",
                added_date: 2,
            },
            {
                name: "owner/newer",
                category: "image",
                community: true,
                added_date: 4,
            },
            {
                name: "codex",
                category: "text",
                is_specialized: true,
                added_date: 5,
            },
            { name: "chat", category: "text", publisher: "C", added_date: 2 },
        ];
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => Response.json(catalog)),
        );

        await expect(loadPlatformStats()).resolves.toMatchObject({
            // Community models form their own group. Specialized models and
            // a second model from the same publisher are left out; untitled
            // models fall back to their name.
            newest: {
                image: ["New", "Old"],
                text: ["chat"],
                community: ["owner/newer"],
            },
        });
    });

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
            return Response.json({ data: [] });
        });
        vi.stubGlobal("fetch", fetchMock);

        await expect(loadPlatformStats()).rejects.toThrow("models: 503");
        catalogAvailable = true;
        await expect(loadPlatformStats()).resolves.toMatchObject({
            agents: 1,
        });
        expect(fetchMock).toHaveBeenCalledTimes(2);
        await loadPlatformStats();
        expect(fetchMock).toHaveBeenCalledTimes(2);
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

    it("only loads the catalog, without unused health or MCP requests", async () => {
        vi.resetModules();
        const { loadPlatformStats } = await import("./publicStats");
        const fetchMock = vi.fn(async (url: string) => {
            if (url !== "https://gen.pollinations.ai/models")
                throw new Error("Unexpected unused request");
            return Response.json([]);
        });
        vi.stubGlobal("fetch", fetchMock);
        await expect(loadPlatformStats()).resolves.toEqual({
            agents: 0,
            community: 0,
            kinds: {},
            newest: {},
        });
        await loadPlatformStats();
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});

describe("requests in the last hour", () => {
    it("sums each model's rollup row once, not its retried route attempts", async () => {
        vi.resetModules();
        const { loadRequestsLastHour } = await import("./publicStats");
        vi.stubGlobal(
            "fetch",
            vi.fn(async () =>
                Response.json({
                    data: [
                        { model: "a", is_rollup: 1, total_requests: 10 },
                        { model: "a", is_rollup: 0, total_requests: 12 },
                        { model: "b", is_rollup: 1, total_requests: 5 },
                    ],
                }),
            ),
        );

        await expect(loadRequestsLastHour()).resolves.toBe(15);
    });
});
