import { verify } from "node:crypto";
import * as schema from "@shared/db/better-auth.ts";
import { defaultKeyHasher } from "better-auth/plugins";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Env } from "../env.ts";

const GITHUB_KEYS_URL =
    "https://api.github.com/meta/public_keys/secret_scanning";
const POLLINATIONS_SECRET_TYPE = "pollinations_api_key";
const PUBLIC_KEY_CACHE_MS = 60 * 60 * 1000;

const GithubPublicKeysSchema = z.object({
    public_keys: z.array(
        z.object({
            key_identifier: z.string(),
            key: z.string(),
        }),
    ),
});

const GithubSecretMatchesSchema = z.array(
    z.object({
        token: z.string(),
        type: z.string(),
        url: z.string(),
        source: z.string(),
    }),
);

let publicKeys = new Map<string, string>();
let publicKeysFetchedAt = 0;

async function getGithubPublicKey(keyId: string): Promise<string | undefined> {
    const cached = publicKeys.get(keyId);
    if (cached && Date.now() - publicKeysFetchedAt < PUBLIC_KEY_CACHE_MS) {
        return cached;
    }

    const response = await fetch(GITHUB_KEYS_URL, {
        headers: {
            Accept: "application/vnd.github+json",
            "User-Agent": "pollinations-enter",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    });
    if (!response.ok) {
        throw new HTTPException(503, {
            message: "Unable to verify GitHub signature",
        });
    }

    const parsed = GithubPublicKeysSchema.safeParse(await response.json());
    if (!parsed.success) {
        throw new HTTPException(503, {
            message: "Unable to verify GitHub signature",
        });
    }

    publicKeys = new Map(
        parsed.data.public_keys.map((entry) => [
            entry.key_identifier,
            entry.key,
        ]),
    );
    publicKeysFetchedAt = Date.now();
    return publicKeys.get(keyId);
}

function hasValidSignature(
    rawBody: string,
    signature: string,
    publicKey: string,
): boolean {
    try {
        return verify(
            "sha256",
            Buffer.from(rawBody),
            publicKey,
            Buffer.from(signature, "base64"),
        );
    } catch {
        return false;
    }
}

export const githubSecretScanningRoutes = new Hono<Env>().post(
    "/github-secret-scanning",
    async (c) => {
        const keyId = c.req.header("Github-Public-Key-Identifier");
        const signature = c.req.header("Github-Public-Key-Signature");
        if (!keyId || !signature) {
            throw new HTTPException(401, { message: "Invalid signature" });
        }

        const rawBody = await c.req.text();
        const publicKey = await getGithubPublicKey(keyId);
        if (!publicKey || !hasValidSignature(rawBody, signature, publicKey)) {
            throw new HTTPException(401, { message: "Invalid signature" });
        }

        let payload: unknown;
        try {
            payload = JSON.parse(rawBody);
        } catch {
            throw new HTTPException(400, { message: "Invalid payload" });
        }
        const matches = GithubSecretMatchesSchema.safeParse(payload);
        if (!matches.success) {
            throw new HTTPException(400, { message: "Invalid payload" });
        }

        const tokens = [
            ...new Set(
                matches.data
                    .filter(
                        (match) =>
                            match.type === POLLINATIONS_SECRET_TYPE &&
                            match.token.startsWith("sk_"),
                    )
                    .map((match) => match.token),
            ),
        ];
        const hashes = await Promise.all(tokens.map(defaultKeyHasher));
        const db = drizzle(c.env.DB, { schema });
        const statements = hashes.map((hash) =>
            db
                .update(schema.apikey)
                .set({ enabled: false, updatedAt: new Date() })
                .where(
                    and(
                        eq(schema.apikey.key, hash),
                        eq(schema.apikey.prefix, "sk"),
                        eq(schema.apikey.enabled, true),
                    ),
                ),
        );
        const [firstStatement, ...remainingStatements] = statements;
        if (!firstStatement) return c.json({ success: true });

        const results = await db.batch([
            firstStatement,
            ...remainingStatements,
        ]);
        const disabledCount = results.reduce(
            (count, result) => count + result.meta.changes,
            0,
        );
        if (disabledCount > 0) {
            c.var.log.warn(
                "Disabled {disabledCount} API keys reported by GitHub secret scanning",
                { disabledCount },
            );
        }

        return c.json({ success: true });
    },
);
