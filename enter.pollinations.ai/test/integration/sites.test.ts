import { env, SELF } from "cloudflare:test";
import {
    account as accountTable,
    user as userTable,
} from "@shared/db/better-auth.ts";
import { site as siteTable } from "@shared/db/sites.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect } from "vitest";
import { test } from "../fixtures.ts";

const MiB = 1024 * 1024;
const manifest = {
    "/index.html": { hash: "a".repeat(32), size: 120 },
    "/app.js": { hash: "b".repeat(32), size: 2048 },
};

type Manifest = Record<string, { hash: string; size: number }>;

// Answers the Cloudflare API calls the sites routes make and records them.
// Other hosts still reach the fixture's fetch mock. `missing` picks the
// buckets Cloudflare asks for.
function fakeCloudflare(
    missing: (manifest: Manifest) => string[][] = () => [["b".repeat(32)]],
) {
    const calls: { method: string; url: string; body: string | FormData }[] =
        [];
    const routed = globalThis.fetch;
    globalThis.fetch = (async (
        input: RequestInfo | URL,
        init?: RequestInit,
    ) => {
        const request = new Request(input, init);
        if (new URL(request.url).host !== "api.cloudflare.com") {
            return routed(input, init);
        }
        const body = request.headers
            .get("content-type")
            ?.startsWith("multipart/form-data")
            ? await request.formData()
            : await request.text();
        calls.push({ method: request.method, url: request.url, body });
        if (request.url.endsWith("/assets-upload-session")) {
            const { manifest } = JSON.parse(body as string);
            return Response.json({
                success: true,
                result: { jwt: "upload-jwt", buckets: missing(manifest) },
            });
        }
        if (request.url.includes("/workers/assets/upload")) {
            return Response.json({
                success: true,
                result: { jwt: "completion-jwt" },
            });
        }
        return Response.json({ success: true, result: {} });
    }) as typeof fetch;
    return calls;
}

const sites = (
    token: string,
    method: string,
    path = "",
    body?: unknown,
): Promise<Response> =>
    SELF.fetch(`http://localhost:3000/api/account/sites${path}`, {
        method,
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
    });

const upload = (token: string, name: string, files: unknown = manifest) =>
    sites(token, "POST", `/${name}/upload`, { manifest: files });

const deleteAccount = (sessionToken: string) =>
    SELF.fetch("http://localhost:3000/api/auth/delete-user", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Cookie: `better-auth.session_token=${sessionToken}`,
            Origin: "http://localhost:3000",
        },
        body: JSON.stringify({}),
    });

async function fixtureUserId() {
    const user = await drizzle(env.DB)
        .select({ id: userTable.id })
        .from(userTable)
        .get();
    if (!user) throw new Error("Missing fixture user");
    return user.id;
}

describe("/api/account/sites", () => {
    test("uploads, publishes, lists and deletes a site", async ({
        accountToken,
    }) => {
        const calls = fakeCloudflare();
        const userId = await fixtureUserId();

        const session = await upload(accountToken, "my-site");
        expect(session.status).toBe(200);
        expect(await session.json()).toEqual({
            uploadUrl:
                "https://api.cloudflare.com/client/v4/accounts/b6ec751c0862027ba269faf7029b2501/workers/assets/upload?base64=true",
            jwt: "upload-jwt",
            buckets: [["b".repeat(32)]],
        });
        expect(calls[0].url).toMatch(
            /\/workers\/dispatch\/namespaces\/pollinations-hosting-test\/scripts\/my-site\/assets-upload-session$/,
        );
        expect(JSON.parse(calls[0].body as string)).toEqual({ manifest });

        const published = await sites(accountToken, "PUT", "/my-site", {
            jwt: "completion-jwt",
        });
        expect(published.status).toBe(200);
        expect(await published.json()).toMatchObject({
            name: "my-site",
            url: "https://my-site.pollinations.app",
            publishedAt: expect.any(String),
            blocked: false,
        });
        expect(calls[1].method).toBe("PUT");
        const metadata = JSON.parse(
            await ((calls[1].body as FormData).get("metadata") as Blob).text(),
        );
        expect(metadata).toMatchObject({
            assets: {
                jwt: "completion-jwt",
                config: { not_found_handling: "single-page-application" },
            },
            tags: [`user-${userId}`],
        });
        expect(metadata).not.toHaveProperty("main_module");

        const list = await sites(accountToken, "GET");
        expect(await list.json()).toMatchObject({
            data: [
                { name: "my-site", url: "https://my-site.pollinations.app" },
            ],
            limits: { sites: 5, bytesPerSite: 200 * MiB },
        });

        const deleted = await sites(accountToken, "DELETE", "/my-site");
        expect(deleted.status).toBe(200);
        expect(calls[2]).toMatchObject({ method: "DELETE" });
        expect(calls[2].url).toMatch(/\/scripts\/my-site$/);
        expect(await drizzle(env.DB).select().from(siteTable)).toEqual([]);
    });

    test("rejects invalid names and manifests before calling Cloudflare", async ({
        accountToken,
    }) => {
        const calls = fakeCloudflare();
        const bigFiles = Object.fromEntries(
            Array.from({ length: 9 }, (_, i) => [
                i ? `/${i}.bin` : "/index.html",
                { hash: String(i).repeat(32), size: 25 * MiB },
            ]),
        );
        const cases: [string, unknown][] = [
            ["My-Site", manifest],
            ["1234-abc", manifest],
            ["www", manifest],
            ["my--site", manifest],
            ["my-site", { "/app.js": manifest["/app.js"] }],
            [
                "my-site",
                {
                    ...manifest,
                    "/big.bin": { hash: "c".repeat(32), size: 26 * MiB },
                },
            ],
            ["my-site", bigFiles],
        ];
        for (const [name, files] of cases) {
            const response = await upload(accountToken, name, files);
            expect(response.status, name).toBe(400);
        }
        expect(calls).toEqual([]);
    });

    test("limits each account to five sites", async ({ accountToken }) => {
        fakeCloudflare();
        for (const name of ["one", "two", "three", "four", "five"]) {
            expect((await upload(accountToken, `site-${name}`)).status).toBe(
                200,
            );
        }
        // Redeploying an owned site still works at the limit.
        expect((await upload(accountToken, "site-one")).status).toBe(200);
        const sixth = await upload(accountToken, "site-six");
        expect(sixth.status).toBe(403);
        expect(await sixth.text()).toContain("at most 5 sites");
    });

    test("keeps names owned by another account", async ({ accountToken }) => {
        const calls = fakeCloudflare();
        const db = drizzle(env.DB);
        await db.insert(userTable).values({
            id: "other-user",
            name: "Other",
            email: "other@example.com",
        });
        await db.insert(siteTable).values({
            name: "taken",
            userId: "other-user",
            createdAt: new Date(),
        });

        expect((await upload(accountToken, "taken")).status).toBe(409);
        expect(
            (await sites(accountToken, "PUT", "/taken", { jwt: "x" })).status,
        ).toBe(409);
        expect((await sites(accountToken, "DELETE", "/taken")).status).toBe(
            404,
        );
        expect(calls).toEqual([]);
    });

    test("an admin takedown keeps the name reserved", async ({
        accountToken,
    }) => {
        const calls = fakeCloudflare();
        await upload(accountToken, "bad-site");

        const blocked = await SELF.fetch(
            "http://localhost:3000/api/admin/sites/bad-site/block",
            {
                method: "POST",
                headers: { Authorization: `Bearer ${env.PLN_ENTER_TOKEN}` },
            },
        );
        expect(blocked.status).toBe(200);
        expect(calls.at(-1)).toMatchObject({ method: "DELETE" });

        expect((await upload(accountToken, "bad-site")).status).toBe(403);
        expect((await sites(accountToken, "DELETE", "/bad-site")).status).toBe(
            403,
        );
        const list = await sites(accountToken, "GET");
        expect(await list.json()).toMatchObject({
            data: [{ name: "bad-site", blocked: true }],
        });
    });

    test("publishes inline files in one request", async ({ accountToken }) => {
        const calls = fakeCloudflare((manifest) => [
            Object.values(manifest).map((file) => file.hash),
        ]);
        const png = btoa("\x89PNG fake");

        const response = await sites(accountToken, "PUT", "/inline-site", {
            files: [
                { file: "index.html", data: "<h1>Hi</h1>" },
                { file: "/img/logo.png", data: png, encoding: "base64" },
            ],
        });
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({
            url: "https://inline-site.pollinations.app",
            publishedAt: expect.any(String),
        });

        const manifest = JSON.parse(calls[0].body as string).manifest;
        expect(manifest).toEqual({
            "/index.html": { hash: expect.any(String), size: 11 },
            "/img/logo.png": { hash: expect.any(String), size: 9 },
        });
        const form = calls[1].body as FormData;
        const html = form.get(manifest["/index.html"].hash) as Blob;
        expect(html.type).toBe("text/html");
        expect(await html.text()).toBe(btoa("<h1>Hi</h1>"));
        const logo = form.get(manifest["/img/logo.png"].hash) as Blob;
        expect(logo.type).toBe("image/png");
        expect(await logo.text()).toBe(png);
        const metadata = JSON.parse(
            await ((calls[2].body as FormData).get("metadata") as Blob).text(),
        );
        expect(metadata.assets.jwt).toBe("completion-jwt");
    });

    test("checks inline files before claiming the name", async ({
        accountToken,
    }) => {
        const calls = fakeCloudflare();
        const noIndex = await sites(accountToken, "PUT", "/inline-site", {
            files: [{ file: "app.js", data: "1" }],
        });
        expect(noIndex.status).toBe(400);
        // Rejected before any file is hashed.
        const tooMany = await sites(accountToken, "PUT", "/inline-site", {
            files: Array.from({ length: 1001 }, (_, i) => ({
                file: i ? `${i}.txt` : "index.html",
                data: "1",
            })),
        });
        expect(tooMany.status).toBe(400);
        const tooBig = await sites(accountToken, "PUT", "/inline-site", {
            files: [{ file: "index.html", data: "x".repeat(6 * MiB) }],
        });
        expect(tooBig.status).toBe(413);
        expect(calls).toEqual([]);
        expect(await drizzle(env.DB).select().from(siteTable)).toEqual([]);
    });

    test("API keys need account:machines", async ({ apiKey }) => {
        expect((await sites(apiKey, "GET")).status).toBe(403);
    });

    test("deleting the account deletes its sites but keeps takedowns reserved", async ({
        accountToken,
        sessionToken,
    }) => {
        const calls = fakeCloudflare();
        const userId = await fixtureUserId();
        await upload(accountToken, "my-site");
        await upload(accountToken, "bad-site");
        await SELF.fetch(
            "http://localhost:3000/api/admin/sites/bad-site/block",
            {
                method: "POST",
                headers: { Authorization: `Bearer ${env.PLN_ENTER_TOKEN}` },
            },
        );

        const response = await deleteAccount(sessionToken);
        expect(response.status).toBe(200);
        expect(calls.at(-1)).toMatchObject({
            method: "DELETE",
            url: expect.stringMatching(
                new RegExp(
                    `/namespaces/pollinations-hosting-test/scripts\\?tags=user-${userId}%3Ayes$`,
                ),
            ),
        });
        expect(
            await drizzle(env.DB)
                .select({ name: siteTable.name, userId: siteTable.userId })
                .from(siteTable),
        ).toEqual([{ name: "bad-site", userId: null }]);
    });

    test("a failed site cleanup keeps the account", async ({
        accountToken,
        sessionToken,
    }) => {
        fakeCloudflare();
        await upload(accountToken, "my-site");
        const routed = globalThis.fetch;
        globalThis.fetch = (async (
            input: RequestInfo | URL,
            init?: RequestInit,
        ) =>
            new Request(input, init).url.startsWith(
                "https://api.cloudflare.com/",
            )
                ? Response.json({ success: false }, { status: 500 })
                : routed(input, init)) as typeof fetch;

        expect((await deleteAccount(sessionToken)).ok).toBe(false);

        const db = drizzle(env.DB);
        expect(await db.select().from(accountTable)).not.toEqual([]);
        expect(await db.select().from(siteTable)).toHaveLength(1);
    });

    test("an admin removing a user deletes their sites", async ({
        sessionToken,
    }) => {
        const calls = fakeCloudflare();
        const db = drizzle(env.DB);
        await db
            .update(userTable)
            .set({ role: "admin" })
            .where(eq(userTable.id, await fixtureUserId()));
        await db.insert(userTable).values({
            id: "other-user",
            name: "Other",
            email: "other@example.com",
        });
        await db.insert(siteTable).values({
            name: "their-site",
            userId: "other-user",
            createdAt: new Date(),
        });

        const response = await SELF.fetch(
            "http://localhost:3000/api/auth/admin/remove-user",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: `better-auth.session_token=${sessionToken}`,
                    Origin: "http://localhost:3000",
                },
                body: JSON.stringify({ userId: "other-user" }),
            },
        );
        expect(response.status).toBe(200);
        expect(calls.at(-1)?.url).toMatch(/\?tags=user-other-user%3Ayes$/);
        expect(await db.select().from(siteTable)).toEqual([]);
    });
});
