import { env, SELF } from "cloudflare:test";
import {
    applyProxyPolicyFields,
    isPendingChangeDue,
    PRICE_CHANGE_DELAY_MS,
    type ProxyListingPayload,
    parsePendingProxyPolicy,
    pickProxyPolicyFields,
} from "@shared/community-endpoints.ts";
import { createTestUser } from "@shared/test/fixtures/index.ts";
import { describe, expect, it } from "vitest";
import { resetGenerationModelRegistryCache } from "../src/model-registry.ts";

const OWNER_ID = "price-delay-owner";
const OWNER_GITHUB = "price-delay-owner";
const MODEL_NAME = "delayed-model";
const MODEL_ID = `${OWNER_GITHUB}/${MODEL_NAME}`;

function proxyPayload(prices: Record<string, number>): string {
    return JSON.stringify({
        bearerTokenCiphertext: "test-ciphertext",
        paidOnly: false,
        modality: "text",
        imagePricing: "request",
        inputModalities: ["text"],
        perUserRpm: null,
        fallbacks: [],
        prices: {
            promptTextPrice: 0,
            completionTextPrice: 0,
            ...prices,
        },
    });
}

async function seedOwner() {
    await createTestUser({
        id: OWNER_ID,
        name: OWNER_GITHUB,
        githubUsername: OWNER_GITHUB,
    });
}

// The stored payload always carries the newly submitted price; the pending
// snapshot preserves what model users saw before the submission.
async function seedModel(
    pendingAt: Date | null,
    opts: { visibility?: string; pendingVisibility?: string | null } = {},
) {
    await seedOwner();
    const visibility = opts.visibility ?? "public";
    const pendingVisibility = opts.pendingVisibility ?? null;
    await env.DB.prepare(
        `INSERT INTO community_endpoint
            (id, owner_user_id, name, title, type, base_url, upstream_model,
             payload, visibility, pending_payload, pending_visibility, pending_at,
             created_at, updated_at)
         VALUES (?, ?, ?, ?, 'proxy', 'https://upstream.test/v1', 'up',
             ?, ?, ?, ?, ?, unixepoch(), unixepoch())`,
    )
        .bind(
            `ep-${MODEL_NAME}`,
            OWNER_ID,
            MODEL_NAME,
            "Delay Test Model",
            proxyPayload({ promptTextPrice: 0.00009 }),
            visibility,
            pendingAt ? proxyPayload({ promptTextPrice: 0.00003 }) : null,
            pendingVisibility,
            pendingAt ? Math.floor(pendingAt.getTime() / 1000) : null,
        )
        .run();
}

async function dropModel() {
    await env.DB.prepare(`DELETE FROM community_endpoint WHERE id = ?`)
        .bind(`ep-${MODEL_NAME}`)
        .run();
}

interface CatalogEntry {
    name: string;
    pricing?: Record<string, string>;
}

async function fetchCatalogEntry(): Promise<CatalogEntry | undefined> {
    // The registry caches for 60s; tests must see fresh rows.
    resetGenerationModelRegistryCache();
    const response = await SELF.fetch(
        "https://gen.pollinations.ai/models?community=true",
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    const list = Array.isArray(body)
        ? (body as CatalogEntry[])
        : ((body as { data?: CatalogEntry[] }).data ?? []);
    return list.find((model) => model.name === MODEL_ID);
}

describe("community model 12-hour price-change delay", () => {
    it("exposes the migration columns", async () => {
        const { results } = await env.DB.prepare(
            `PRAGMA table_info(community_endpoint)`,
        ).all<{ name: string }>();
        const columns = new Set(results.map((row) => row.name));
        expect(columns.has("pending_payload")).toBe(true);
        expect(columns.has("pending_visibility")).toBe(true);
        expect(columns.has("pending_at")).toBe(true);
    });

    it("keeps serving the previous price while the window runs", async () => {
        await seedModel(new Date());
        try {
            const entry = await fetchCatalogEntry();
            expect(entry).toBeDefined();
            // Model users still see the snapshotted price; the submitted one
            // is not served anywhere on the entry.
            expect(JSON.stringify(entry)).toContain("0.00003");
            expect(JSON.stringify(entry)).not.toContain("0.00009");
        } finally {
            await dropModel();
        }
    });

    it("switches to the submitted price once the window elapses", async () => {
        await seedModel(new Date(Date.now() - PRICE_CHANGE_DELAY_MS - 1000));
        try {
            const entry = await fetchCatalogEntry();
            // The snapshot stops being applied; the payload takes over.
            expect(JSON.stringify(entry)).toContain("0.00009");
            expect(JSON.stringify(entry)).not.toContain("0.00003");
        } finally {
            await dropModel();
        }
    });

    it("serves the payload price with no pending change", async () => {
        await seedModel(null);
        try {
            const entry = await fetchCatalogEntry();
            expect(JSON.stringify(entry)).toContain("0.00009");
            expect(JSON.stringify(entry)).not.toContain("0.00003");
        } finally {
            await dropModel();
        }
    });

    it("hides a private-to-public flip until the window elapses", async () => {
        await seedModel(new Date(), {
            visibility: "private",
            pendingVisibility: "public",
        });
        try {
            const entry = await fetchCatalogEntry();
            expect(entry).toBeUndefined();
        } finally {
            await dropModel();
        }
    });

    it("lists a matured private-to-public flip from the payload", async () => {
        await seedModel(new Date(Date.now() - PRICE_CHANGE_DELAY_MS - 1000), {
            visibility: "private",
            pendingVisibility: "public",
        });
        try {
            const entry = await fetchCatalogEntry();
            expect(entry).toBeDefined();
            expect(JSON.stringify(entry)).toContain("0.00009");
        } finally {
            await dropModel();
        }
    });
});

describe("pending policy helpers", () => {
    const serving: ProxyListingPayload = JSON.parse(
        proxyPayload({ promptTextPrice: 0.00003 }),
    );

    it("parses stored pending fields and ignores unknown keys", () => {
        const parsed = parsePendingProxyPolicy(
            JSON.stringify({
                paidOnly: true,
                bearerTokenCiphertext: "must-not-leak-into-policy",
                prices: { promptTextPrice: 9 },
            }),
        );
        expect(parsed).toEqual({
            paidOnly: true,
            prices: { promptTextPrice: 9 },
        });
        expect(parsePendingProxyPolicy(null)).toBeNull();
        expect(parsePendingProxyPolicy("not-json")).toBeNull();
    });

    it("overlays only the snapshotted fields onto the payload", () => {
        const merged = applyProxyPolicyFields(serving, {
            paidOnly: true,
            prices: { promptTextPrice: 7 },
        } as unknown as Parameters<typeof applyProxyPolicyFields>[1]);
        expect(merged.paidOnly).toBe(true);
        expect(merged.prices.promptTextPrice).toBe(7);
        expect(merged.bearerTokenCiphertext).toBe("test-ciphertext");
        expect(
            applyProxyPolicyFields(
                serving,
                null as unknown as Parameters<typeof applyProxyPolicyFields>[1],
            ),
        ).toBe(serving);
    });

    it("captures exactly the policy fields of a payload", () => {
        const snapshot = pickProxyPolicyFields(serving);
        expect(snapshot.prices.promptTextPrice).toBe(0.00003);
        expect(snapshot.paidOnly).toBe(false);
        expect(JSON.stringify(snapshot)).not.toContain("bearerTokenCiphertext");
    });

    it("marks a change due only after the full delay", () => {
        expect(isPendingChangeDue(null)).toBe(false);
        expect(isPendingChangeDue(new Date())).toBe(false);
        expect(
            isPendingChangeDue(
                new Date(Date.now() - PRICE_CHANGE_DELAY_MS + 60_000),
            ),
        ).toBe(false);
        expect(
            isPendingChangeDue(
                new Date(Date.now() - PRICE_CHANGE_DELAY_MS - 1),
            ),
        ).toBe(true);
    });
});
