import { env, SELF } from "cloudflare:test";
import { user as userTable } from "@shared/db/better-auth.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect } from "vitest";
import { test } from "./fixtures.ts";

describe("Admin authentication", () => {
    test("new OAuth accounts inherit active domain restrictions, with release taking precedence", async ({
        mocks,
    }) => {
        await mocks.enable("github", "tinybird");
        await env.SETUP_HOLDS.put("hold:held-signup.test", "held");
        await env.SETUP_HOLDS.put("hold:released-signup.test", "held");
        await env.SETUP_HOLDS.put("release:released-signup.test", "released");
        for (const [index, domain] of [
            "sub.held-signup.test",
            "released-signup.test",
            "ordinary-signup.test",
        ].entries()) {
            mocks.github.state.user.id = 45600 + index;
            mocks.github.state.user.email = `signup@${domain}`;
            const signIn = await SELF.fetch(
                "http://localhost:3000/api/auth/sign-in/social",
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ provider: "github" }),
                },
            );
            expect(signIn.status).toBe(200);
            const { url } = (await signIn.json()) as { url: string };
            const state = new URL(url).searchParams.get("state");
            const cookie = signIn.headers.get("Set-Cookie");
            if (!state || !cookie)
                throw new Error("Missing OAuth state or cookie");
            const callback = new URL(
                "http://localhost:3000/api/auth/callback/github",
            );
            callback.searchParams.set("code", "test-code");
            callback.searchParams.set("state", state);
            const response = await SELF.fetch(callback.toString(), {
                headers: { Cookie: cookie },
                redirect: "manual",
            });
            expect(response.status).toBe(302);
            await response.text();
            const created = await drizzle(env.DB)
                .select()
                .from(userTable)
                .where(eq(userTable.email, `signup@${domain}`))
                .get();
            expect(created?.questPollenRestricted).toBe(
                index === 0 ? true : null,
            );
        }
    });

    test("only an admin can clear the protected Quest Pollen restriction", async ({
        sessionToken,
    }) => {
        const db = drizzle(env.DB);
        const user = await db.select().from(userTable).get();
        if (!user) throw new Error("Missing fixture user");
        await db
            .update(userTable)
            .set({ questPollenRestricted: true })
            .where(eq(userTable.id, user.id));
        const headers = {
            Cookie: `better-auth.session_token=${sessionToken}`,
            "Content-Type": "application/json",
            Origin: "http://localhost:3000",
        };
        const selfUpdate = await SELF.fetch(
            "http://localhost:3000/api/auth/update-user",
            {
                method: "POST",
                headers,
                body: JSON.stringify({
                    name: user.name,
                    questPollenRestricted: false,
                }),
            },
        );
        await selfUpdate.text();
        expect(
            (await db.select().from(userTable).get())?.questPollenRestricted,
        ).toBe(true);
        const update = () =>
            SELF.fetch("http://localhost:3000/api/auth/admin/update-user", {
                method: "POST",
                headers,
                body: JSON.stringify({
                    userId: user.id,
                    data: { questPollenRestricted: false },
                }),
            });
        expect((await update()).status).toBe(403);
        await db
            .update(userTable)
            .set({ role: "admin" })
            .where(eq(userTable.id, user.id));
        const cleared = await update();
        expect(cleared.status).toBe(200);
        expect(
            (await db.select().from(userTable).get())?.questPollenRestricted,
        ).toBe(false);
    });

    const baseUrl = "https://enter.pollinations.ai";

    test("should reject requests without token", async () => {
        const response = await SELF.fetch(
            `${baseUrl}/api/admin/trigger-d1-sync`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
            },
        );
        expect(response.status).toBe(401);
    });

    test("should reject the Tinybird token", async () => {
        const response = await SELF.fetch(
            `${baseUrl}/api/admin/trigger-d1-sync`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: "Bearer test_tinybird_sync_token",
                },
            },
        );
        expect(response.status).toBe(401);
    });

    test("should allow the sync token to export a d1 page", async () => {
        const response = await SELF.fetch(
            `${baseUrl}/api/admin/trigger-d1-sync`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: "Bearer test_d1_export_token",
                },
                body: JSON.stringify({
                    datasource: "d1_user",
                }),
            },
        );
        expect(response.status).toBe(200);

        const body = (await response.json()) as {
            success: boolean;
            datasource: string;
            rows: unknown[];
            done: boolean;
        };
        expect(body.success).toBe(true);
        expect(body.datasource).toBe("d1_user");
        expect(body.rows).toEqual([]);
        expect(body.done).toBe(true);
    });

    test.each([
        ["unknown datasource", { datasource: "unknown" }],
        [
            "empty cursor",
            {
                datasource: "d1_user",
                cursor: "",
            },
        ],
    ])("should reject %s", async (_name, requestBody) => {
        const response = await SELF.fetch(
            `${baseUrl}/api/admin/trigger-d1-sync`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: "Bearer test_d1_export_token",
                },
                body: JSON.stringify(requestBody),
            },
        );
        expect(response.status).toBe(400);
    });
});
