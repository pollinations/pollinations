import { createHash } from "node:crypto";
import type { D1Database } from "@cloudflare/workers-types";
import { serializeSignedCookie } from "better-call";
import { type Conditions, defaultConditions } from "./conditions-data";
import githubProfile from "./github-profile.json";
import { ADMIN_ORIGIN } from "./local-origins";

export type { Conditions } from "./conditions-data";

// Inert fixtures confined to this harness's loopback-only, isolated database.
// This signing value is the existing Enter Workers test binding.
export const TEST_AUTH_SECRET = "not-a-secret-workers-test-only";
// Same inert public signing fixture already used by the Admin preview.
export const TEST_DASHBOARD_SECRET =
    "public-admin-preview-only-not-a-real-secret";
export const USER_ID = "flow-local-user";
export const OWNER_ID = "flow-local-developer";
export const CLIENT_KEY_ID = "flow-local-app";
export const CLIENT_ID = "pk_flow_local_example_not_a_real_credential";
export const ADMIN_CLIENT_ID = "pk_admin_preview_only";
export const CALLBACK_URL = "http://localhost:4180/flow-example.html";
const SESSION_TOKEN = "flow-local-session-fixture-not-a-real-credential";
export const localIdentity = {
    // Public profile imported from https://api.github.com/users/pollinationsagent.
    // Keep the same identity in D1, local sign-in and disposable review databases.
    ...githubProfile,
    // GitHub does not publish this account's email; authentication remains local.
    email: "pollinations-agent@flow.test",
} as const;

export async function seedFixtures(
    db: D1Database,
    kv: { put(key: string, value: string): Promise<unknown> },
) {
    const now = Math.floor(Date.now() / 1000);
    await db.batch([
        db.prepare("DELETE FROM flow_device"),
        db
            .prepare("DELETE FROM device_code WHERE client_id = ?")
            .bind(CLIENT_ID),
        db
            .prepare("DELETE FROM rewards WHERE user_id IN (?, ?)")
            .bind(USER_ID, OWNER_ID),
        db
            .prepare("DELETE FROM user WHERE id IN (?, ?)")
            .bind(USER_ID, OWNER_ID),
        db
            .prepare(`INSERT INTO user
                (id, name, email, email_verified, github_id, github_username,
                 image, tier_balance, pack_balance, created_at, updated_at)
                VALUES (?, ?, ?, 1, ?, ?, ?, 0, 10, ?, ?)`)
            .bind(
                USER_ID,
                localIdentity.name,
                localIdentity.email,
                localIdentity.id,
                localIdentity.login,
                localIdentity.avatar_url,
                now,
                now,
            ),
        // An existing account has already collected onboarding rewards. Keep
        // key creation from changing the deliberately selected wallet fixture.
        ...[
            ["first_api_key", "Create your first API key"],
            ["use_app", "Use a Pollinations app"],
        ].map(([quest, title]) =>
            db
                .prepare(`INSERT OR REPLACE INTO rewards
                (id, idempotency_key, user_id, quest_id, title,
                 pollen_amount, balance_bucket, earned_at, claimed_at)
                VALUES (?, ?, ?, ?, ?, 0.25, 'tier', ?, ?)`)
                .bind(
                    `flow-local-${quest}`,
                    `quest:${quest}:github:${localIdentity.id}`,
                    USER_ID,
                    quest,
                    title,
                    now * 1000,
                    now * 1000,
                ),
        ),
        db
            .prepare(`INSERT INTO user
                (id, name, email, email_verified, github_id, github_username,
                 tier_balance, pack_balance, created_at, updated_at)
                VALUES (?, ?, ?, 1, ?, ?, 0, 0, ?, ?)`)
            .bind(
                OWNER_ID,
                "Flow Example Developer",
                "developer@flow.test",
                100000002,
                "developer",
                now,
                now,
            ),
        db
            .prepare(`INSERT INTO apikey
                (id, name, start, prefix, key, user_id, enabled,
                 rate_limit_enabled, request_count, pollen_balance,
                 permissions, metadata, created_at, updated_at)
                VALUES (?, ?, ?, 'pk', ?, ?, 1, 0, 0, 0, ?, ?, ?, ?)`)
            .bind(
                CLIENT_KEY_ID,
                "App example",
                CLIENT_ID.slice(0, 10),
                createHash("sha256").update(CLIENT_ID).digest("base64url"),
                OWNER_ID,
                JSON.stringify({ models: [] }),
                JSON.stringify({
                    keyType: "publishable",
                    createdVia: "flow-local-fixture",
                    plaintextKey: CLIENT_ID,
                    redirectUris: [CALLBACK_URL],
                    earningsEnabled: false,
                }),
                now,
                now,
            ),
        db
            .prepare(`INSERT INTO oauth_client
                (id, client_id, user_id, disabled, skip_consent, scopes,
                 name, redirect_uris, token_endpoint_auth_method, grant_types,
                 response_types, public, type, require_pkce, created_at, updated_at)
                VALUES ('flow-local-admin-client', ?, ?, 0, 1, ?, ?, ?,
                        'none', ?, ?, 1, 'user-agent-based', 1, ?, ?)`)
            .bind(
                ADMIN_CLIENT_ID,
                OWNER_ID,
                JSON.stringify(["openid", "profile", "email"]),
                "Admin example",
                JSON.stringify([`${ADMIN_ORIGIN}/auth/callback`]),
                JSON.stringify(["authorization_code"]),
                JSON.stringify(["code"]),
                now,
                now,
            ),
        db
            .prepare(`INSERT OR REPLACE INTO flow_conditions
                (id, account, pollen, allowance, role) VALUES (1, ?, ?, ?, ?)`)
            .bind(
                defaultConditions.account,
                defaultConditions.pollen,
                defaultConditions.allowance,
                defaultConditions.role,
            ),
    ]);
    await syncLocalIdentity(db);
    await setConditions(db, defaultConditions);
    // Token-priced preflight requires a historical estimate. Seed the real
    // cache shape for the one text model exercised by this local fixture.
    await kv.put(
        "model-stats-v3",
        JSON.stringify({
            ttl: 3600,
            value: { data: [{ model: "openai", avg_cost_usd: 0.01 }] },
        }),
    );
}

export async function syncLocalIdentity(db: D1Database) {
    const now = Math.floor(Date.now() / 1000);
    await db.batch([
        db
            .prepare(`UPDATE user SET name = ?, email = ?, github_username = ?, image = ?, github_id = ?
            WHERE id = ?`)
            .bind(
                localIdentity.name,
                localIdentity.email,
                localIdentity.login,
                localIdentity.avatar_url,
                localIdentity.id,
                USER_ID,
            ),
        // A provider link selects the existing fixture user on a real callback.
        // It contains no provider token and does not reset account conditions.
        db
            .prepare(`INSERT INTO account
            (id, provider_id, account_id, user_id, created_at, updated_at)
            SELECT 'flow-local-github-account', 'github', ?, id, ?, ?
            FROM user WHERE id = ?
            ON CONFLICT(id) DO UPDATE SET
                account_id = excluded.account_id, updated_at = excluded.updated_at`)
            .bind(String(localIdentity.id), now, now, USER_ID),
    ]);
}

export async function setConditions(
    db: D1Database,
    patch: Partial<Conditions>,
) {
    const stored = await db
        .prepare(
            "SELECT account, pollen, allowance, role FROM flow_conditions WHERE id = 1",
        )
        .first<Conditions>();
    const conditions = { ...defaultConditions, ...stored, ...patch };
    const statements = [
        db
            .prepare(
                "UPDATE flow_conditions SET account = ?, pollen = ?, allowance = ?, role = ? WHERE id = 1",
            )
            .bind(
                conditions.account,
                conditions.pollen,
                conditions.allowance,
                conditions.role,
            ),
    ];
    if (patch.pollen !== undefined) {
        statements.push(
            db
                .prepare(
                    "UPDATE user SET tier_balance = ?, pack_balance = ? WHERE id = ?",
                )
                .bind(
                    conditions.pollen === "quest" ? 5 : 0,
                    conditions.pollen === "paid" ? 10 : 0,
                    USER_ID,
                ),
        );
    }
    if (patch.account !== undefined) {
        statements.push(
            db
                .prepare(
                    "UPDATE user SET banned = ?, ban_reason = ? WHERE id = ?",
                )
                .bind(
                    conditions.account === "banned" ? 1 : 0,
                    conditions.account === "banned"
                        ? "Local test condition"
                        : null,
                    USER_ID,
                ),
            db.prepare("DELETE FROM session WHERE user_id = ?").bind(USER_ID),
        );
        if (conditions.account !== "signed-out") {
            const now = Math.floor(Date.now() / 1000);
            statements.push(
                db
                    .prepare(`INSERT INTO session
                        (id, token, user_id, created_at, updated_at, expires_at)
                        VALUES ('flow-local-session', ?, ?, ?, ?, ?)`)
                    .bind(SESSION_TOKEN, USER_ID, now, now, now + 7 * 86400),
            );
        }
    }
    if (patch.allowance !== undefined) {
        statements.push(
            db
                .prepare(`UPDATE apikey SET pollen_balance = ?
                    WHERE user_id = ? AND byop_client_key_id = ?`)
                .bind(
                    conditions.allowance === "available" ? 5 : 0,
                    USER_ID,
                    CLIENT_KEY_ID,
                ),
        );
    }
    if (patch.role !== undefined) {
        statements.push(
            db
                .prepare("UPDATE user SET role = ? WHERE id = ?")
                .bind(conditions.role === "admin" ? "admin" : "user", USER_ID),
        );
    }
    await db.batch(statements);
}

export async function readState(db: D1Database) {
    const conditions = await db
        .prepare(
            "SELECT account, pollen, allowance, role FROM flow_conditions WHERE id = 1",
        )
        .first<Conditions>();
    const user = await db
        .prepare(`SELECT id, name, email, github_username AS githubUsername,
            banned, role, tier_balance AS questPollen, pack_balance AS paidPollen
            FROM user WHERE id = ?`)
        .bind(USER_ID)
        .first<{
            id: string;
            name: string;
            email: string;
            githubUsername: string;
            banned: number;
            role: string | null;
            questPollen: number;
            paidPollen: number;
        }>();
    if (!conditions || !user)
        throw new Error("Local fixtures are not initialized");
    const key = await db
        .prepare(`SELECT id, pollen_balance AS allowance, enabled FROM apikey
            WHERE user_id = ? AND byop_client_key_id = ?
            ORDER BY created_at DESC, rowid DESC LIMIT 1`)
        .bind(USER_ID, CLIENT_KEY_ID)
        .first<{ id: string; allowance: number | null; enabled: number }>();
    const activeSession = await db
        .prepare(
            "SELECT id FROM session WHERE user_id = ? AND expires_at > ? LIMIT 1",
        )
        .bind(USER_ID, Math.floor(Date.now() / 1000))
        .first();
    const device = await db
        .prepare(`SELECT c.user_code AS userCode,
            c.verification_uri AS verificationUri,
            c.verification_uri_complete AS verificationUriComplete,
            c.status AS savedStatus, d.status AS grantStatus,
            d.expires_at AS expiresAt, d.client_id AS clientId
            FROM flow_device c LEFT JOIN device_code d
                ON d.device_code = c.device_code WHERE c.id = 1`)
        .first<{
            userCode: string;
            verificationUri: string;
            verificationUriComplete: string;
            savedStatus: DeviceStatus;
            grantStatus: "pending" | "approved" | "denied" | null;
            expiresAt: number | null;
            clientId: string | null;
        }>();
    const deviceStatus: DeviceStatus =
        device?.savedStatus === "completed"
            ? "completed"
            : device?.expiresAt && device.expiresAt <= Date.now() / 1000
              ? "expired"
              : (device?.grantStatus ?? "used");
    const adminClient = await db
        .prepare("SELECT id FROM oauth_client WHERE client_id = ?")
        .bind(ADMIN_CLIENT_ID)
        .first();
    const { questPollen, paidPollen, ...profile } = user;
    return {
        conditions: {
            ...conditions,
            account: user.banned
                ? "banned"
                : activeSession
                  ? "signed-in"
                  : "signed-out",
            pollen:
                paidPollen > 0 ? "paid" : questPollen > 0 ? "quest" : "empty",
            role: user.role?.split(",").some((role) => role.trim() === "admin")
                ? "admin"
                : "member",
            ...(key && {
                allowance: key.allowance === 0 ? "exhausted" : "available",
            }),
        } as Conditions,
        user: { ...profile, banned: Boolean(user.banned) },
        wallet: { questPollen, paidPollen, total: questPollen + paidPollen },
        connection: {
            clientId: CLIENT_ID,
            keyId: key?.id ?? null,
            allowance: key?.allowance ?? null,
            enabled: Boolean(key?.enabled),
        },
        admin: { clientId: ADMIN_CLIENT_ID, registered: Boolean(adminClient) },
        device: device
            ? {
                  userCode: device.userCode,
                  clientId: device.clientId,
                  verificationUri: device.verificationUri,
                  verificationUriComplete: device.verificationUriComplete,
                  status: deviceStatus,
              }
            : null,
        runtime: {
            enterOrigin: "http://localhost:4180",
            genBaseUrl: "http://localhost:4180/gen",
        },
    };
}

export type DeviceStatus =
    | "pending"
    | "approved"
    | "denied"
    | "expired"
    | "completed"
    | "used";

export type FlowState = Awaited<ReturnType<typeof readState>>;

export async function sessionCookie(
    db: D1Database,
    account: Conditions["account"],
) {
    const session =
        account === "signed-out"
            ? null
            : await db
                  .prepare(
                      "SELECT token FROM session WHERE user_id = ? AND expires_at > ? ORDER BY created_at DESC, rowid DESC LIMIT 1",
                  )
                  .bind(USER_ID, Math.floor(Date.now() / 1000))
                  .first<{ token: string }>();
    if (!session) {
        return "better-auth.session_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0";
    }
    return serializeSignedCookie(
        "better-auth.session_token",
        session.token,
        TEST_AUTH_SECRET,
        { path: "/", httpOnly: true, sameSite: "lax", maxAge: 7 * 86400 },
    );
}
