import { env, SELF } from "cloudflare:test";
import {
    account as accountTable,
    agent as agentTable,
    apikey as apiKeyTable,
    communityEndpoint as communityEndpointTable,
    session as sessionTable,
    user as userTable,
} from "@shared/db/better-auth.ts";
import {
    mediaItem as mediaItemTable,
    mediaTag as mediaTagTable,
} from "@shared/db/media-catalog.ts";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect } from "vitest";
import { test } from "../fixtures.ts";

describe("POST /api/auth/delete-user", () => {
    test("deletes the D1 account and linked records", async ({
        apiKey,
        sessionToken,
    }) => {
        const db = drizzle(env.DB);
        const [user] = await db.select({ id: userTable.id }).from(userTable);
        if (!user) throw new Error("Expected test user");

        await db.insert(mediaItemTable).values({
            id: "test-media-item",
            ownerUserId: user.id,
            appKeyId: null,
            contentType: "image/png",
            size: 123,
            createdAt: new Date(),
        });
        await db.insert(mediaTagTable).values({
            itemId: "test-media-item",
            tag: "test",
        });
        await db.insert(agentTable).values({
            id: "test-agent",
            ownerUserId: user.id,
            config: JSON.stringify({ instructions: "Test" }),
        });
        await db.insert(communityEndpointTable).values({
            id: "test-community-model",
            ownerUserId: user.id,
            name: "test-model",
            agentId: "test-agent",
            upstreamModel: "openai-fast",
            promptTextPrice: 0,
            completionTextPrice: 0,
        });

        const response = await SELF.fetch(
            "http://localhost:3000/api/auth/delete-user",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: `better-auth.session_token=${sessionToken}`,
                },
                body: JSON.stringify({}),
            },
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            success: true,
            message: "User deleted",
        });

        expect(await db.select().from(userTable)).toHaveLength(0);
        expect(await db.select().from(sessionTable)).toHaveLength(0);
        expect(await db.select().from(accountTable)).toHaveLength(0);
        expect(await db.select().from(apiKeyTable)).toHaveLength(0);
        expect(await db.select().from(agentTable)).toHaveLength(0);
        expect(await db.select().from(communityEndpointTable)).toHaveLength(0);
        expect(await db.select().from(mediaItemTable)).toHaveLength(0);
        expect(await db.select().from(mediaTagTable)).toHaveLength(0);

        const keyResponse = await SELF.fetch(
            "http://localhost:3000/api/account/profile",
            { headers: { Authorization: `Bearer ${apiKey}` } },
        );
        expect(keyResponse.status).toBe(401);
    });
});
