import { env } from "cloudflare:test";
import { getLinkedGithub } from "@shared/auth/github-account.ts";
import * as schema from "@shared/db/better-auth.ts";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";

describe("getLinkedGithub", () => {
    it("returns githubId + username for a linked github account", async () => {
        const db = drizzle(env.DB, { schema });
        const userId = "u-linked";
        await db.insert(schema.user).values({
            id: userId,
            name: "t",
            email: "u-linked@test.local",
            handle: "octocat",
            createdAt: new Date(),
            updatedAt: new Date(),
        });
        await db.insert(schema.account).values({
            id: "a-linked",
            accountId: "12345",
            providerId: "github",
            username: "octocat",
            userId,
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        const result = await getLinkedGithub(db, userId);
        expect(result).toEqual({ githubId: 12345, username: "octocat" });
    });

    it("returns null for a user with no github account", async () => {
        const db = drizzle(env.DB, { schema });
        const userId = "u-nogithub";
        await db.insert(schema.user).values({
            id: userId,
            name: "t",
            email: "u-nogithub@test.local",
            createdAt: new Date(),
            updatedAt: new Date(),
        });
        expect(await getLinkedGithub(db, userId)).toBeNull();
    });
});
