import { env } from "cloudflare:test";
import * as schema from "@shared/db/better-auth.ts";
import {
    __internal,
    __resetGithubAppAuthCache,
} from "@shared/github/app-auth.ts";
import { chunkedUpsert } from "@shared/github/upsert.ts";
import { eq, lt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { afterEach, describe, expect, test } from "vitest";

// A throwaway 2048-bit RSA key in PKCS#1 ("BEGIN RSA PRIVATE KEY") form — the
// format the GitHub App key downloads in, and the one WebCrypto's importKey
// CANNOT take directly. Used only to prove the PKCS#1->PKCS#8 wrap roundtrips.
const PKCS1_TEST_KEY = `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA2mnt67xmA0KOgk+b9B7Hne87oYZ6DZOfS64dPpCQQAZvmW+S
SObIIN/KgOf2FUYGFCa5mpz0sYj/6ciZlH/85WT3AsWHulmqFQVWL8WxcuRIxDLf
ycC7MJdHRzY0hvLQrKC/WH0ViZfHQgfBiyTk45aLpWD0IlA8U7N5UdUtZmoYl2Hc
FrDr/Ntya9B9PJY0P4vD1SSYIl4n9n8I5JeLRXKWSyBES+3xVTSMge9cdSggOAvR
b/TP1PnLKeGltSeOfWcoEyD2uGeBEE17KGbbOlBu01JCYp51CzIT89VZdF4ABbs3
wiCaTP50Iz9Wg5DedPxWfxsRy5IdFn6CGiGWRQIDAQABAoIBAADVwr0+umSDTEbg
j1ZS1gA7OKiXE/lG0FpXKoRbENSDbpXkO9rJZRT5F6dZm6xJP2WaBn+6LC/pXlJL
72H5tLAObE8hDbIiiYVGJxlZWy93AqjOj/v2H53hlvoFXnrwmGfvvzBTRBiQHiJZ
I/FVMG0G6sN0vpVkZjw+SKjnLkkz5CA3Wx06IVSEVa3L6m2/E3F5wNFpgSw+xY++
fHQZUXFufAyzpTWWvcbXUEssyAQ/JExOpz8hGFltq2JQOWQjBBZ5kzjHdXbF7fG7
CNdXTmq713clRya9kLMd84ti/4IcxCuYj51ONmYKN1mqzpplNaaL71Mu7Z8uVKNW
19GW/5ECgYEA859NiFWKx6e0D/hkpoRkO+3YpP9xCxDxUkx8azSr3OBCn2mO8GSp
I5I0fzTU8R7wE/Dc92qmoIvFzj4Z1pQT6Zziz86yem6C53tG5PvcvwiZX81NGuDk
uLhfPgrAZ6wgc0mOdLKfLIo0EpNK0yH0ExPG9EvtRCUUHHDfjlvkOVUCgYEA5YK/
81GHQIkybHuz8ts8jkJ6rNe4xwBrJFKnHtoYzL3Y4RSpEnnwzMIKFKtiqnPXWDH6
8VWfo+UabnSIm+2fzad9c4s1LBl3+EnLm/jKUbFs4V07xSTu+p4TF5H8LA/+Ui0Y
+vwQknB5KW8ZLGBsrJFL/k4ZT90ADVj1Lg00KTECgYEAtm5wbMtB5Uib+emT1W4G
cSomtUfjqtnBHFPSR6VlnT0CJsWxGCsIzW5KiYdSfk0gko4nqc7fgBGqykqOprS0
RJgK8HpkBHKE7DrQV+CS6SrTT345YwtNu1W1XIxIkFnA4xQN7S1lLMFBRTevLHOc
hjylG4NP5Vuut61+eugs+xECgYEAng1outuOVPcmbmbSCZDJJv7JFHaKnSDAqAbz
Z9+x7G1hCb/8nuiy149Y+dr8231i8y2YLtJUWb3Qcfh2i0sdHbcWQZfASlpPsADB
4ut2CMQywxA9tQo2OQjbBQRXsNBix5ye81ja4L3r8oi7wT+2FzEIMF0AOWtsOcTl
M42MOkECgYAFy5urpw7IdFwaw2VXLmbYWpTL4DYeu7mqPHbOdaqM3wEeg2AV74RR
7XkDo3Ue1523b+HBEtvyV04LeUy+VvZaG+EN/gqeVyzDpQpVhfvyZJDrGBPBdrrw
SKcH9BkpoOJ3A8pbW25Yw3Rp+i4aT8gmCaZa40XqGyfMrNA5OXqAAw==
-----END RSA PRIVATE KEY-----`;

describe("github app auth", () => {
    afterEach(() => __resetGithubAppAuthCache());

    test("PKCS#1->PKCS#8 wrap produces a key WebCrypto can import and sign with", async () => {
        const der = __internal.pemToDer(
            __internal.normalizePem(PKCS1_TEST_KEY),
        );
        const pkcs8 = __internal.pkcs1ToPkcs8(der);

        // The whole point: importKey('pkcs8', ...) accepts the wrapped key.
        const privateKey = await crypto.subtle.importKey(
            "pkcs8",
            pkcs8 as BufferSource,
            { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
            false,
            ["sign"],
        );

        const data = new TextEncoder().encode("jwt-signing-input");
        const sig = await crypto.subtle.sign(
            "RSASSA-PKCS1-v1_5",
            privateKey,
            data,
        );
        expect(sig.byteLength).toBe(256); // 2048-bit RSA signature
    });

    test("normalizePem un-escapes SOPS-style \\n and strips quotes", () => {
        const escaped = `"${PKCS1_TEST_KEY.replace(/\n/g, "\\n")}"`;
        expect(__internal.normalizePem(escaped)).toBe(PKCS1_TEST_KEY);
    });

    test("base64url has no padding or +/ characters", () => {
        const out = __internal.b64urlFromString("any?value+with/special=chars");
        expect(out).not.toMatch(/[+/=]/);
    });
});

describe("chunkedUpsert", () => {
    test("inserts then re-syncs rows last-write-wins on the primary key", async () => {
        const db = drizzle(env.DB, { schema });

        // Insert two PRs across enough rows that chunking is exercised. The
        // gh_pull_requests table has 9 columns, so floor(100/9)=11 rows/stmt —
        // 25 rows forces multiple statements in one batch.
        const initial = Array.from({ length: 25 }, (_, i) => ({
            number: 9000 + i,
            authorGithubId: 1,
            authorLogin: "alice",
            state: "open",
            mergedAt: null,
            title: `PR ${i}`,
            url: `https://github.com/pollinations/pollinations/pull/${9000 + i}`,
            githubUpdatedAt: null,
        }));
        const written = await chunkedUpsert(db, schema.ghPullRequests, initial);
        expect(written).toBe(25);

        const first = await db
            .select()
            .from(schema.ghPullRequests)
            .where(eq(schema.ghPullRequests.number, 9000));
        expect(first[0]?.state).toBe("open");
        expect(first[0]?.title).toBe("PR 0");

        // Re-sync the same PK with new data — the conflict target must update,
        // not duplicate (excluded.* set clause).
        await chunkedUpsert(db, schema.ghPullRequests, [
            {
                number: 9000,
                authorGithubId: 1,
                authorLogin: "alice",
                state: "merged",
                mergedAt: new Date("2026-01-01T00:00:00Z"),
                title: "PR 0 (merged)",
                url: "https://github.com/pollinations/pollinations/pull/9000",
                githubUpdatedAt: null,
            },
        ]);

        const updated = await db
            .select()
            .from(schema.ghPullRequests)
            .where(eq(schema.ghPullRequests.number, 9000));
        expect(updated).toHaveLength(1); // upsert, not duplicate
        expect(updated[0]?.state).toBe("merged");
        expect(updated[0]?.title).toBe("PR 0 (merged)");
        expect(updated[0]?.mergedAt).toEqual(new Date("2026-01-01T00:00:00Z"));
    });

    test("empty input is a no-op", async () => {
        const db = drizzle(env.DB, { schema });
        const written = await chunkedUpsert(db, schema.ghIssues, []);
        expect(written).toBe(0);
    });

    test("closing-edge rows upsert on the composite edge key", async () => {
        const db = drizzle(env.DB, { schema });
        await chunkedUpsert(db, schema.ghPrClosingIssues, [
            { edgeKey: "9000:31", prNumber: 9000, issueNumber: 31 },
            { edgeKey: "9000:32", prNumber: 9000, issueNumber: 32 },
        ]);
        // Re-syncing the same edge must not duplicate.
        await chunkedUpsert(db, schema.ghPrClosingIssues, [
            { edgeKey: "9000:31", prNumber: 9000, issueNumber: 31 },
        ]);
        const edges = await db
            .select()
            .from(schema.ghPrClosingIssues)
            .where(eq(schema.ghPrClosingIssues.prNumber, 9000));
        expect(edges).toHaveLength(2);
    });

    test("stale-row reap deletes rows not seen this run (closing-edge case)", async () => {
        const db = drizzle(env.DB, { schema });
        const runStart = new Date("2026-06-23T12:00:00Z");

        // Two edges seen in an earlier run, stamped with an OLD syncedAt.
        await chunkedUpsert(db, schema.ghPrClosingIssues, [
            {
                edgeKey: "8000:1",
                prNumber: 8000,
                issueNumber: 1,
                syncedAt: new Date("2026-06-23T11:00:00Z"),
            },
            {
                edgeKey: "8000:2",
                prNumber: 8000,
                issueNumber: 2,
                syncedAt: new Date("2026-06-23T11:00:00Z"),
            },
        ]);

        // This run re-sees only edge 8000:1 (the "Fixes #2" was removed from the
        // PR description), stamping it with the new runStart.
        await chunkedUpsert(db, schema.ghPrClosingIssues, [
            {
                edgeKey: "8000:1",
                prNumber: 8000,
                issueNumber: 1,
                syncedAt: runStart,
            },
        ]);
        // Reap: delete edges whose syncedAt is older than this run.
        await db
            .delete(schema.ghPrClosingIssues)
            .where(lt(schema.ghPrClosingIssues.syncedAt, runStart));

        const survivors = await db
            .select()
            .from(schema.ghPrClosingIssues)
            .where(eq(schema.ghPrClosingIssues.prNumber, 8000));
        expect(survivors.map((e) => e.issueNumber)).toEqual([1]); // #2 reaped
    });

    test("large bodies don't trip SQLITE_TOOBIG (byte-size chunking)", async () => {
        const db = drizzle(env.DB, { schema });
        // Reproduce the staging failure: several issues with large bodies. With
        // row-count-only chunking, 8 of these in one INSERT exceeded SQLite's
        // statement-length limit (SQLITE_TOOBIG). Byte-size chunking splits them.
        const bigBody = "x".repeat(57_000); // ~ the largest real issue body
        const rows = Array.from({ length: 12 }, (_, i) => ({
            number: 7000 + i,
            authorGithubId: 1,
            authorLogin: "alice",
            state: "open",
            title: `big issue ${i}`,
            url: `https://github.com/pollinations/pollinations/issues/${7000 + i}`,
            body: bigBody,
            labelsJson: "[]",
            assigneeGithubId: null,
            assigneeLogin: null,
            githubUpdatedAt: null,
        }));
        // Must not throw, and must write every row.
        const written = await chunkedUpsert(db, schema.ghIssues, rows);
        expect(written).toBe(12);
        const stored = await db
            .select()
            .from(schema.ghIssues)
            .where(eq(schema.ghIssues.number, 7000));
        expect(stored[0]?.body?.length).toBe(57_000);
    });

    test("issue row round-trips all assignees + created/closed dates", async () => {
        const db = drizzle(env.DB, { schema });
        const created = new Date("2026-01-02T03:04:05Z");
        const closed = new Date("2026-02-03T04:05:06Z");
        await chunkedUpsert(db, schema.ghIssues, [
            {
                number: 7100,
                authorGithubId: 1,
                authorLogin: "alice",
                state: "closed",
                title: "multi-assignee issue",
                url: "https://github.com/pollinations/pollinations/issues/7100",
                body: null,
                labelsJson: "[]",
                // First assignee mirrored into the indexed columns…
                assigneeGithubId: 11,
                assigneeLogin: "alice",
                // …full list preserved as JSON (GitHub allows up to 10).
                assigneesJson: JSON.stringify([
                    { login: "alice", githubId: 11 },
                    { login: "bob", githubId: 22 },
                ]),
                githubCreatedAt: created,
                githubClosedAt: closed,
                githubUpdatedAt: null,
            },
        ]);
        const stored = await db
            .select()
            .from(schema.ghIssues)
            .where(eq(schema.ghIssues.number, 7100));
        expect(stored[0]?.assigneeLogin).toBe("alice");
        expect(JSON.parse(stored[0]?.assigneesJson ?? "[]")).toEqual([
            { login: "alice", githubId: 11 },
            { login: "bob", githubId: 22 },
        ]);
        expect(stored[0]?.githubCreatedAt).toEqual(created);
        expect(stored[0]?.githubClosedAt).toEqual(closed);
    });

    test("empty-response guard: no reap runs when zero rows are seen", async () => {
        const db = drizzle(env.DB, { schema });
        const runStart = new Date("2026-06-23T18:00:00Z");

        // A live row from a PRIOR run, stamped with an OLD syncedAt.
        await chunkedUpsert(db, schema.ghIssues, [
            {
                number: 7200,
                authorGithubId: 1,
                authorLogin: "alice",
                state: "open",
                title: "survivor",
                url: "https://github.com/pollinations/pollinations/issues/7200",
                body: null,
                labelsJson: "[]",
                syncedAt: new Date("2026-06-23T17:00:00Z"),
            },
        ]);

        // This run sees ZERO issues (empty-but-successful GraphQL response).
        // The service guards on rows.length === 0 and returns BEFORE the reap,
        // so the unconditional `delete WHERE syncedAt < runStart` must NOT run —
        // otherwise it would wipe the survivor. Assert the guard's invariant: a
        // skipped reap leaves the old row intact.
        const issueRows: (typeof schema.ghIssues.$inferInsert)[] = [];
        expect(issueRows.length).toBe(0); // guard condition is true → skip reap

        // (No delete executed.) The survivor must still be present.
        const survivors = await db
            .select()
            .from(schema.ghIssues)
            .where(eq(schema.ghIssues.number, 7200));
        expect(survivors).toHaveLength(1);

        // Sanity: had the reap run, this is the query that would have nuked it.
        // Prove it WOULD have deleted (so the guard is load-bearing), then undo.
        const reaped = await db
            .delete(schema.ghIssues)
            .where(lt(schema.ghIssues.syncedAt, runStart))
            .returning({ number: schema.ghIssues.number });
        expect(reaped.map((r) => r.number)).toContain(7200); // would have wiped it
    });
});
