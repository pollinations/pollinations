import { env, SELF } from "cloudflare:test";
import { describe, expect } from "vitest";
import { importApps } from "../../src/services/app-import.ts";
import { test } from "../fixtures.ts";

// The mocked GitHub profile signs in as github id 12345.
const OTHER_OWNER = "99999";
const APPS_URL = "http://localhost:3000/api/account/apps";

// One entry as operations/app-management/app.json holds it.
const entry = (id: string, overrides: Record<string, unknown> = {}) => ({
    id,
    emoji: "🧩",
    name: id,
    url: `https://${id}.example`,
    description: "An app that does one thing well.",
    language: "en",
    category: "build",
    platform: "web",
    githubUsername: "testuser",
    githubUserId: "12345",
    repositoryUrl: null,
    discordUsername: null,
    submittedDate: "2026-01-01",
    issueUrl: null,
    approvedDate: "2026-01-01",
    ...overrides,
});

describe("/api/account/apps", () => {
    test("requires authorization", async () => {
        expect((await SELF.fetch(APPS_URL)).status).toBe(401);
        expect(
            (await SELF.fetch(`${APPS_URL}/older`, { method: "DELETE" }))
                .status,
        ).toBe(401);
    });

    test("lists the signed-in account's apps, newest approval first", async ({
        accountToken,
    }) => {
        await importApps(env.DB, [
            entry("older", { approvedDate: "2025-03-01" }),
            entry("theirs", { githubUserId: OTHER_OWNER }),
            entry("newest", { approvedDate: "2026-09-01" }),
        ]);

        const response = await SELF.fetch(APPS_URL, {
            headers: { Authorization: `Bearer ${accountToken}` },
        });

        expect(response.status).toBe(200);
        const { apps } = (await response.json()) as {
            apps: { id: string; listed: boolean }[];
        };
        expect(apps.map((app) => app.id)).toEqual(["newest", "older"]);
        expect(apps.every((app) => app.listed)).toBe(true);
    });

    test("lets the owner edit, unlist and delete an app, and no one else", async ({
        accountToken,
    }) => {
        await importApps(env.DB, [
            entry("mine"),
            entry("theirs", { githubUserId: OTHER_OWNER }),
        ]);
        const send = (id: string, method: string, body?: unknown) =>
            SELF.fetch(`${APPS_URL}/${id}`, {
                method,
                headers: {
                    Authorization: `Bearer ${accountToken}`,
                    "Content-Type": "application/json",
                },
                body: body ? JSON.stringify(body) : undefined,
            });

        expect((await send("theirs", "PATCH", { name: "Taken" })).status).toBe(
            404,
        );
        expect((await send("theirs", "DELETE")).status).toBe(404);
        expect(
            (await send("mine", "PATCH", { url: "javascript:alert(1)" }))
                .status,
        ).toBe(400);

        const edited = await send("mine", "PATCH", {
            name: "Renamed",
            listed: false,
        });
        expect(edited.status).toBe(200);
        expect(await edited.json()).toMatchObject({
            app: { id: "mine", name: "Renamed", listed: false },
        });

        expect((await send("mine", "DELETE")).status).toBe(200);
        const response = await SELF.fetch(APPS_URL, {
            headers: { Authorization: `Bearer ${accountToken}` },
        });
        expect(await response.json()).toEqual({ apps: [] });
    });

    test("returns an empty list for an account that has no app", async ({
        accountToken,
    }) => {
        await importApps(env.DB, [
            entry("theirs", { githubUserId: OTHER_OWNER }),
        ]);

        const response = await SELF.fetch(APPS_URL, {
            headers: { Authorization: `Bearer ${accountToken}` },
        });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ apps: [] });
    });
});
