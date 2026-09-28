import { afterEach, describe, expect, it, vi } from "vitest";
import {
    appIdentity,
    byopRequests24h,
    compareAppUsage,
    type DirectoryApp,
    describeModelKinds,
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
            byop: "",
            requests_24h: null,
        }) as DirectoryApp;
    const usage = (item: DirectoryApp, request_count = 1): WeeklyAppUsage => ({
        app_name: item.name,
        app_url: item.web_url,
        owner: "OWNER",
        request_count,
    });

    it("keeps server ranking and marks verified Pollen Pay usage without mutating the catalog", () => {
        const first = app("First");
        const second = app("Second");
        const result = selectWeeklyApps(
            [second, first],
            [usage(first, 50), usage(second, 10)],
        );
        expect(result.map((item) => item.name)).toEqual(["First", "Second"]);
        expect(result.every((item) => item.byop === true)).toBe(true);
        expect(first.byop).toBe("");
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

    it("does not turn stale developer totals into BYOP daily usage", () => {
        const stale = { ...app("Stale flag"), requests_24h: "999999" };
        const verified = {
            ...app("Verified"),
            byop: true,
            requests_24h: "200",
        };
        const [first, second] = selectWeeklyApps(
            [stale, verified],
            [usage(stale), usage(verified)],
        );
        expect(first.byop).toBe(true);
        expect(first.requests_24h).toBeNull();
        expect(isBuzz(first)).toBe(false);
        expect(second.requests_24h).toBe(200);
        expect(isBuzz(second)).toBe(true);
        expect(stale.requests_24h).toBe("999999");
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

    it("requests eight weekly apps, shares the catalog, and retries failed rankings", async () => {
        vi.resetModules();
        const { loadWeeklyApps } = await import("./publicStats");
        const item = app("App");
        let available = false;
        const fetchMock = vi.fn(async (url: string) => {
            if (url.includes("app_top_weekly")) {
                expect(new URL(url).searchParams.get("limit")).toBe("8");
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
        await expect(hello).resolves.toEqual([{ ...item, byop: true }]);
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
                return Response.json({
                    data: url.includes("weekly_health_stats")
                        ? [
                              {
                                  week: "2026-01-05",
                                  total_requests: 1234,
                                  availability: 99.7,
                              },
                          ]
                        : [],
                });
            }),
        );

        await expect(loadPlatformStats()).resolves.toMatchObject({
            community: 2,
            models: 5,
            agents: 1,
            byCategory: { text: 3, image: 3 },
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
            models: 0,
            agents: 0,
            community: 0,
            byCategory: {},
        });
        await loadPlatformStats();
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});

describe("model kinds", () => {
    it("lists every catalog category, largest first, with readable labels", () => {
        expect(
            describeModelKinds({
                "3d": 3,
                audio: 27,
                embedding: 6,
                image: 58,
                realtime: 4,
                text: 190,
                video: 19,
            }),
        ).toBe("Text, image, audio, video, embeddings, realtime and 3D");
    });

    it("skips uncategorised entries and handles a single or empty catalog", () => {
        expect(describeModelKinds({ other: 9, text: 1 })).toBe("Text");
        expect(describeModelKinds({})).toBeNull();
    });
});
