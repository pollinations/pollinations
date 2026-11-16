import { env } from "cloudflare:test";
import { expect, it } from "vitest";
import { importApps } from "../src/services/app-import.ts";
import {
    deleteApp,
    listApps,
    updateApp,
    updateAppSchema,
} from "../src/services/apps.ts";

const OWNER = 123;
const catalog = [
    {
        id: "mine",
        emoji: "🌻",
        name: "Mine",
        url: "https://mine.example",
        description: "Creates images with the Pollinations API.",
        language: "en",
        category: "image",
        platform: "web",
        githubUsername: "owner",
        githubUserId: String(OWNER),
        repositoryUrl: null,
        discordUsername: null,
        submittedDate: "2026-07-01",
        issueUrl: null,
        approvedDate: "2026-07-02",
    },
];

it("lets only the owner edit, unlist and delete an app", async () => {
    await importApps(env.DB, catalog);
    expect(await listApps(env.DB, OWNER)).toMatchObject([
        { id: "mine", name: "Mine", listed: true },
    ]);
    expect(await listApps(env.DB, 999)).toEqual([]);
    expect(await listApps(env.DB, null)).toEqual([]);

    // Someone else's account changes nothing.
    expect(await updateApp(env.DB, 999, "mine", { name: "Taken" })).toBeNull();
    expect(await deleteApp(env.DB, 999, "mine")).toBe(false);

    expect(
        await updateApp(env.DB, OWNER, "mine", {
            name: "Renamed",
            listed: false,
        }),
    ).toMatchObject({ name: "Renamed", listed: false });
    // The approval stays, so the owner lists it again without a new review.
    expect(
        await updateApp(env.DB, OWNER, "mine", { listed: true }),
    ).toMatchObject({ listed: true, approvedDate: "2026-07-02" });

    expect(await deleteApp(env.DB, OWNER, "mine")).toBe(true);
    expect(await listApps(env.DB, OWNER)).toEqual([]);
    expect(await updateApp(env.DB, OWNER, "mine", { name: "Back" })).toBeNull();
    // The catalog still lists the app; the import must not bring it back.
    expect(await importApps(env.DB, catalog)).toBe(0);
    expect(await listApps(env.DB, OWNER)).toEqual([]);
});

it("refuses an edit that breaks the catalog's rules", () => {
    const rejects = (edit: unknown) => !updateAppSchema.safeParse(edit).success;
    expect(rejects({ url: "javascript:alert(1)" })).toBe(true);
    expect(rejects({ description: "Too short" })).toBe(true);
    expect(rejects({ category: "not-a-category" })).toBe(true);
    expect(rejects({ name: "" })).toBe(true);
    expect(rejects({ name: "Fine", url: null, listed: false })).toBe(false);
});
