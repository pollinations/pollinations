import {
    createExecutionContext,
    createScheduledController,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import { app } from "@shared/db/apps.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { expect, it } from "vitest";
import worker from "../src/index.ts";
import { importApps } from "../src/services/app-import.ts";
import { test } from "./fixtures.ts";

// One entry as operations/app-management/app.json holds it.
const entry = (id: string, overrides: Record<string, unknown> = {}) => ({
    id,
    emoji: "🌻",
    name: `App ${id}`,
    url: "https://example.com",
    description: "Creates images with the Pollinations API.",
    language: "en",
    category: "image",
    platform: "web",
    githubUsername: "example",
    githubUserId: "123",
    repositoryUrl: null,
    repositoryStars: 12,
    discordUsername: null,
    other: "someone@example.test",
    submittedDate: "2026-07-01",
    issueUrl: "https://github.com/pollinations/pollinations/issues/1",
    approvedDate: "2026-07-02",
    byop: false,
    requests24h: 0,
    ...overrides,
});

it("adds the catalog apps the database lacks and leaves the others alone", async () => {
    const db = drizzle(env.DB);
    // More apps than one statement's 100 bound values can carry.
    const catalog = Array.from({ length: 20 }, (_, i) => entry(`app-${i}`));

    expect(await importApps(env.DB, catalog)).toBe(20);

    await db.update(app).set({ name: "Renamed" }).where(eq(app.id, "app-0"));
    const added = entry("app-new", {
        screenshotUrl: "https://media.pollinations.ai/shot",
        approvedDate: null,
    });
    expect(await importApps(env.DB, [added, ...catalog])).toBe(1);

    expect(await db.$count(app)).toBe(21);
    expect(await db.select().from(app).where(eq(app.id, "app-0"))).toEqual([
        {
            id: "app-0",
            name: "Renamed",
            emoji: "🌻",
            description: "Creates images with the Pollinations API.",
            category: "image",
            platform: "web",
            language: "en",
            url: "https://example.com",
            repositoryUrl: null,
            screenshotUrl: null,
            githubUserId: 123,
            githubUsername: "example",
            discordUsername: null,
            submittedDate: "2026-07-01",
            issueUrl: "https://github.com/pollinations/pollinations/issues/1",
            approvedDate: "2026-07-02",
            unlisted: false,
            deleted: false,
        },
    ]);
    // Everything in the catalog is listed, so an old entry without an
    // approval date takes its submission date.
    const [row] = await db.select().from(app).where(eq(app.id, "app-new"));
    expect(row).toMatchObject({
        screenshotUrl: "https://media.pollinations.ai/shot",
        approvedDate: "2026-07-01",
    });
});

it("refuses a catalog with a malformed app", async () => {
    const catalog = [entry("good"), entry("bad", { githubUserId: "octocat" })];

    await expect(importApps(env.DB, catalog)).rejects.toThrow();
    expect(await drizzle(env.DB).$count(app)).toBe(0);
});

test("the 15-minute job imports the catalog GitHub serves", async ({
    mocks,
}) => {
    await mocks.enable("github");
    mocks.github.state.appCatalog = [entry("from-github")];

    const ctx = createExecutionContext();
    await worker.scheduled(createScheduledController(), env, ctx);
    await waitOnExecutionContext(ctx);

    expect(
        await drizzle(env.DB)
            .select({ name: app.name })
            .from(app)
            .where(eq(app.id, "from-github")),
    ).toEqual([{ name: "App from-github" }]);
});
