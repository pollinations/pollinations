import { fileURLToPath } from "node:url";
import { readD1Migrations } from "@cloudflare/vitest-pool-workers/config";
import { Miniflare } from "miniflare";
import { describe, expect, it } from "vitest";
import { localIdentity, USER_ID } from "../fixtures";
import { createReviewServices } from "../review-services";
import { parseReviewSetup, prepareReviewData } from "../review-setup";

describe("local external-service review conditions", () => {
    it("keeps app lists available by default and resets connected fixtures without accepting writes", async () => {
        const service = createReviewServices();
        const request = (path: string, method = "GET") =>
            service.integrations(
                new Request(`https://composio.internal${path}`, { method }),
            );
        for (const connected of [false, true, false]) {
            if (connected) service.configure({ connections: "connected" });
            const response = await request("/connections");
            expect(response.status).toBe(200);
            const { data } = await response.json();
            expect(data).toHaveLength(connected ? 1 : 0);
            if (connected)
                expect(data[0]).toMatchObject({
                    toolkit: "github",
                    status: "ACTIVE",
                });
            const catalog = await request("/toolkits");
            expect(catalog.status).toBe(200);
            expect((await catalog.json()).data).toEqual([
                {
                    slug: "github",
                    name: "GitHub",
                    description: "Code and repositories.",
                    logo: null,
                },
            ]);
            service.configure({});
        }
        for (const [path, method] of [
            ["/connections", "POST"],
            ["/connections/flow-review-integration", "DELETE"],
            ["/unknown", "GET"],
        ])
            expect((await request(path, method)).status).toBe(503);
    });
    it("keeps credited payments and claimed rewards consistent with the wallet, including repeated preparation", async () => {
        const worker = new Miniflare({
            modules: true,
            script: "export default { fetch() { return new Response('review data test'); } }",
            compatibilityDate: "2026-04-24",
            d1Databases: ["DB"],
        });
        try {
            const db = await worker.getD1Database("DB");
            const migrations = await readD1Migrations(
                fileURLToPath(
                    new URL(
                        "../../../enter.pollinations.ai/drizzle",
                        import.meta.url,
                    ),
                ),
            );
            for (const migration of migrations)
                await db.batch(
                    migration.queries.map((query) => db.prepare(query)),
                );
            await db
                .prepare(
                    "INSERT INTO user (id, name, email, tier_balance, pack_balance) VALUES (?, 'Review data', 'review-data@connect.invalid', 2, 10)",
                )
                .bind(USER_ID)
                .run();
            const balances = () =>
                db
                    .prepare(
                        "SELECT tier_balance AS quest, pack_balance AS paid FROM user WHERE id = ?",
                    )
                    .bind(USER_ID)
                    .first();
            for (let repeat = 0; repeat < 2; repeat++) {
                await prepareReviewData(db, {
                    payment: "credited",
                    rewards: "claimed",
                });
                expect(await balances()).toEqual({ paid: 15, quest: 7 });
                expect(
                    await db
                        .prepare(
                            "SELECT pollen_credited FROM stripe_checkout_credits WHERE user_id = ?",
                        )
                        .bind(USER_ID)
                        .first(),
                ).toEqual({ pollen_credited: 5 });
                expect(
                    await db
                        .prepare(
                            "SELECT pollen_amount FROM rewards WHERE user_id = ? AND claimed_at IS NOT NULL",
                        )
                        .bind(USER_ID)
                        .first(),
                ).toEqual({ pollen_amount: 5 });
            }
            await prepareReviewData(db, { rewards: "available" });
            expect(await balances()).toEqual({ paid: 10, quest: 2 });
            expect(
                await db
                    .prepare(
                        "SELECT session_id FROM stripe_checkout_credits WHERE user_id = ?",
                    )
                    .bind(USER_ID)
                    .first(),
            ).toBeNull();
            expect(
                await db
                    .prepare(
                        "SELECT pollen_amount, claimed_at FROM rewards WHERE user_id = ?",
                    )
                    .bind(USER_ID)
                    .first(),
            ).toEqual({ pollen_amount: 5, claimed_at: null });
            await prepareReviewData(db, {});
            expect(await balances()).toEqual({ paid: 10, quest: 2 });
        } finally {
            await worker.dispose();
        }
    }, 30000);
    it("only accepts named conditions, with no arbitrary database or response payload", () => {
        expect(
            parseReviewSetup({ billing: "ready", rewards: "claimed" }),
        ).toEqual({ billing: "ready", rewards: "claimed" });
        for (const input of [
            { sql: "DELETE" },
            { billing: "production" },
            { body: { user: {} } },
            [],
            null,
        ])
            expect(() => parseReviewSetup(input)).toThrow();
    });
    it("keeps local billing records readable across configuration changes without forwarding", async () => {
        const service = createReviewServices();
        const customer = new Request(
            "https://api.stripe.com/v1/customers/cus_flow_review",
        );
        expect((await (await service.outbound(customer))?.json())?.id).toBe(
            "cus_flow_review",
        );
        service.configure({ billing: "ready" });
        expect((await (await service.outbound(customer))?.json())?.id).toBe(
            "cus_flow_review",
        );
        expect(
            await service.outbound(
                new Request(
                    "https://api.stripe.com/v1/customers/real_customer",
                ),
            ),
        ).toBeUndefined();
        expect(
            await service.outbound(new Request(customer, { method: "POST" })),
        ).toBeUndefined();
        service.configure({});
        expect((await (await service.outbound(customer))?.json())?.id).toBe(
            "cus_flow_review",
        );
    });
    it("supplies both protocols required by the real endpoint probe", async () => {
        const service = createReviewServices();
        service.configure({ endpoint: "success" });
        const response = (stream: boolean) =>
            service.outbound(
                new Request("https://flow-review.invalid/v1/chat/completions", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ stream }),
                }),
            );
        expect(
            (await (await response(false))?.json())?.usage.total_tokens,
        ).toBe(3);
        const streamed = await response(true);
        expect(streamed?.headers.get("content-type")).toBe("text/event-stream");
        expect(await streamed?.text()).toContain("data: [DONE]");
    });
    it("keeps the quest catalog available independently of reward preparation, never a GitHub mutation", async () => {
        const service = createReviewServices();
        const request = (query = "query($query:String!){ search { nodes } }") =>
            new Request("https://api.github.com/graphql", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    query,
                    variables: {
                        query: "repo:pollinations/pollinations label:POLLEN-QUEST is:issue",
                    },
                }),
            });
        expect(await (await service.outbound(request()))?.json()).toEqual({
            data: {
                search: {
                    nodes: [],
                    pageInfo: { hasNextPage: false, endCursor: null },
                },
            },
        });
        service.configure({ rewards: "available" });
        expect(await (await service.outbound(request()))?.json()).toEqual({
            data: {
                search: {
                    nodes: [],
                    pageInfo: { hasNextPage: false, endCursor: null },
                },
            },
        });
        expect(
            await service.outbound(request("mutation { addComment { id } }")),
        ).toBeUndefined();
        service.configure({});
        expect(await (await service.outbound(request()))?.json()).toEqual({
            data: {
                search: {
                    nodes: [],
                    pageInfo: { hasNextPage: false, endCursor: null },
                },
            },
        });
    });
    it("covers current quest profile and paginated report queries without accepting unrelated GitHub calls", async () => {
        const service = createReviewServices();
        const profile = await service.outbound(
            new Request(`https://api.github.com/user/${localIdentity.id}`),
        );
        expect(await profile?.json()).toEqual(localIdentity);
        const query = (search: string) =>
            new Request("https://api.github.com/graphql", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    query: "query($query:String!,$after:String){ search { nodes pageInfo } }",
                    variables: { query: search, after: null },
                }),
            });
        const reports = await service.outbound(
            query(
                `repo:pollinations/pollinations is:issue is:closed author:${localIdentity.login} updated:>=2026-06-25`,
            ),
        );
        expect(await reports?.json()).toEqual({
            data: {
                search: {
                    nodes: [],
                    pageInfo: { hasNextPage: false, endCursor: null },
                },
            },
        });
        expect(
            await service.outbound(query("repo:unrelated/repository is:issue")),
        ).toBeUndefined();
        expect(
            await service.outbound(
                new Request(`https://api.github.com/user/${localIdentity.id}`, {
                    method: "POST",
                }),
            ),
        ).toBeUndefined();
    });
    it("provides empty earnings and quest analytics without enabling unrelated Tinybird reads or writes", async () => {
        const service = createReviewServices();
        for (const pipe of [
            "developer_earnings_today",
            "quest_model_modalities",
            "quest_app_usage",
            "app_directory_public",
        ]) {
            const request = new Request(
                `http://localhost:7181/v0/pipes/${pipe}.json`,
            );
            expect(await (await service.outbound(request))?.json()).toEqual({
                data: [],
                rows: 0,
            });
            expect(
                await service.outbound(
                    new Request(request, { method: "POST" }),
                ),
            ).toBeUndefined();
        }
        expect(
            await service.outbound(
                new Request("http://localhost:7181/v0/pipes/unknown.json"),
            ),
        ).toBeUndefined();
    });
});
