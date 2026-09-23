import { env } from "cloudflare:test";
import { user as userTable } from "@shared/db/better-auth.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect } from "vitest";
import { onAfterSessionCreate } from "../src/auth.ts";
import { test } from "./fixtures.ts";

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

        await mocks.enable("github");
        mocks.github.state.user = {
            id: githubId,
            login: "newlogin",
            name: "New Name",
            email: "sync@example.com",
            avatar_url: "https://example.com/avatar.png",
            created_at: "2020-01-01T00:00:00Z",
        };

        const promises: Promise<unknown>[] = [];
        const executionCtx = {
            waitUntil: (promise: Promise<unknown>) => promises.push(promise),
            passThroughOnException: () => {},
        } as unknown as ExecutionContext;

        const handler = onAfterSessionCreate(env, executionCtx);
        await handler({ userId }, null);
        await Promise.all(promises);

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

        await mocks.enable("github");
        mocks.github.state.user = {
            id: githubId,
            login: "onlylogin",
            name: "",
            email: "sync2@example.com",
            avatar_url: "https://example.com/avatar.png",
            created_at: "2020-01-01T00:00:00Z",
        };

        const promises: Promise<unknown>[] = [];
        const executionCtx = {
            waitUntil: (promise: Promise<unknown>) => promises.push(promise),
            passThroughOnException: () => {},
        } as unknown as ExecutionContext;

        const handler = onAfterSessionCreate(env, executionCtx);
        await handler({ userId }, null);
        await Promise.all(promises);

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

    test("leaves database unchanged if name and username already match", async ({
        mocks,
    }) => {
        const db = drizzle(env.DB);
        const userId = "test-user-sync-3";
        const githubId = 12345;

        await db.insert(userTable).values({
            id: userId,
            name: "Current Name",
            email: "sync3@example.com",
            githubId,
            githubUsername: "currentlogin",
        });

        await mocks.enable("github");
        mocks.github.state.user = {
            id: githubId,
            login: "currentlogin",
            name: "Current Name",
            email: "sync3@example.com",
            avatar_url: "https://example.com/avatar.png",
            created_at: "2020-01-01T00:00:00Z",
        };

        const promises: Promise<unknown>[] = [];
        const executionCtx = {
            waitUntil: (promise: Promise<unknown>) => promises.push(promise),
            passThroughOnException: () => {},
        } as unknown as ExecutionContext;

        const handler = onAfterSessionCreate(env, executionCtx);
        await handler({ userId }, null);
        await Promise.all(promises);

        const [updatedUser] = await db
            .select({
                name: userTable.name,
                githubUsername: userTable.githubUsername,
            })
            .from(userTable)
            .where(eq(userTable.id, userId))
            .limit(1);

        expect(updatedUser?.name).toBe("Current Name");
        expect(updatedUser?.githubUsername).toBe("currentlogin");
    });
});
