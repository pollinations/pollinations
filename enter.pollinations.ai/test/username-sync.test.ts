import {
    createExecutionContext,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import { user as userTable } from "@shared/db/better-auth.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect } from "vitest";
import { onAfterSessionCreate } from "../src/auth.ts";
import { test } from "./fixtures.ts";

async function syncProfile(userId: string) {
    const ctx = createExecutionContext();
    await onAfterSessionCreate(env, ctx)({ userId }, null);
    await waitOnExecutionContext(ctx);
}

describe("onAfterSessionCreate profile sync", () => {
    test("syncs updated name and github_username when GitHub profile changes", async ({
        mocks,
    }) => {
        const db = drizzle(env.DB);
        const userId = "test-user-sync-1";
        const githubId = 12345;

        await db.insert(userTable).values({
            id: userId,
            name: "Old Name",
            email: "sync@example.com",
            githubId,
            githubUsername: "oldlogin",
        });

        await mocks.enable("github", "tinybird");
        mocks.github.state.user = {
            ...mocks.github.state.user,
            login: "newlogin",
            name: "New Name",
        };

        await syncProfile(userId);

        const [updatedUser] = await db
            .select({
                name: userTable.name,
                githubUsername: userTable.githubUsername,
            })
            .from(userTable)
            .where(eq(userTable.id, userId))
            .limit(1);

        expect(updatedUser?.name).toBe("New Name");
        expect(updatedUser?.githubUsername).toBe("newlogin");
    });

    test("falls back to GitHub login when GitHub name is empty", async ({
        mocks,
    }) => {
        const db = drizzle(env.DB);
        const userId = "test-user-sync-2";
        const githubId = 12345;

        await db.insert(userTable).values({
            id: userId,
            name: "Old Name",
            email: "sync2@example.com",
            githubId,
            githubUsername: "oldlogin",
        });

        await mocks.enable("github", "tinybird");
        mocks.github.state.user = {
            ...mocks.github.state.user,
            login: "onlylogin",
            name: "",
        };

        await syncProfile(userId);

        const [updatedUser] = await db
            .select({
                name: userTable.name,
                githubUsername: userTable.githubUsername,
            })
            .from(userTable)
            .where(eq(userTable.id, userId))
            .limit(1);

        expect(updatedUser?.name).toBe("onlylogin");
        expect(updatedUser?.githubUsername).toBe("onlylogin");
    });
});
