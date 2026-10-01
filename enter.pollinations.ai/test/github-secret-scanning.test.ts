import { env, SELF } from "cloudflare:test";
import { defaultKeyHasher } from "@better-auth/api-key";
import * as schema from "@shared/db/better-auth.ts";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect } from "vitest";
import { test } from "./fixtures.ts";

const KEY_ID = "test-secret-scanning-key";
const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
);
const publicKey = new Uint8Array(
    await crypto.subtle.exportKey("spki", keyPair.publicKey),
);
const publicKeyBase64 = btoa(String.fromCharCode(...publicKey));
const PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----\n${publicKeyBase64}\n-----END PUBLIC KEY-----`;

function p1363ToDer(signature: Uint8Array): Uint8Array {
    const encodeInteger = (value: Uint8Array) => {
        let first = value.findIndex((byte) => byte !== 0);
        if (first === -1) first = value.length - 1;
        let encoded = value.subarray(first);
        if ((encoded[0] & 0x80) !== 0) {
            encoded = Uint8Array.of(0, ...encoded);
        }
        return Uint8Array.of(0x02, encoded.length, ...encoded);
    };

    const r = encodeInteger(signature.subarray(0, 32));
    const s = encodeInteger(signature.subarray(32));
    return Uint8Array.of(0x30, r.length + s.length, ...r, ...s);
}

async function signedRequest(
    body: string,
    signature?: string,
): Promise<RequestInit> {
    const generatedSignature = p1363ToDer(
        new Uint8Array(
            await crypto.subtle.sign(
                { name: "ECDSA", hash: "SHA-256" },
                keyPair.privateKey,
                new TextEncoder().encode(body),
            ),
        ),
    );
    return {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Github-Public-Key-Identifier": KEY_ID,
            "Github-Public-Key-Signature":
                signature ?? btoa(String.fromCharCode(...generatedSignature)),
        },
        body,
    };
}

async function isEnabled(apiKey: string): Promise<boolean | null> {
    const db = drizzle(env.DB, { schema });
    const hashedKey = await defaultKeyHasher(apiKey);
    const stored = await db.query.apikey.findFirst({
        where: (apikey, { eq }) => eq(apikey.key, hashedKey),
    });
    return stored?.enabled ?? null;
}

describe("GitHub secret scanning", () => {
    test("rejects tampering, missing headers and unknown IDs without bypassing the key cache", async ({
        apiKey,
        mocks,
    }) => {
        mocks.github.state.secretScanningPublicKeys = [
            { key_identifier: KEY_ID, key: PUBLIC_KEY_PEM },
        ];
        await mocks.enable("github");
        const url =
            "https://enter.pollinations.ai/api/webhooks/github-secret-scanning";
        expect((await SELF.fetch(url, await signedRequest("[]"))).status).toBe(
            200,
        );
        const fetchCount = mocks.github.state.requests.length;
        const body = JSON.stringify([
            {
                token: apiKey,
                type: "pollinations_api_key",
                url: "",
                source: "content",
            },
        ]);
        const request = await signedRequest(body);
        const unknownHeaders = new Headers(request.headers);
        unknownHeaders.set("Github-Public-Key-Identifier", "unknown-key");
        for (const invalid of [
            { ...request, body: `${body} ` },
            { ...request, headers: { "Content-Type": "application/json" } },
            { ...request, headers: unknownHeaders },
        ]) {
            expect((await SELF.fetch(url, invalid)).status).toBe(401);
        }
        expect(await isEnabled(apiKey)).toBe(true);
        expect(mocks.github.state.requests.length).toBe(fetchCount);
    });

    test("rejects invalid signed payloads", async ({ apiKey, mocks }) => {
        mocks.github.state.secretScanningPublicKeys = [
            { key_identifier: KEY_ID, key: PUBLIC_KEY_PEM },
        ];
        await mocks.enable("github");
        for (const body of ["{", JSON.stringify({ token: apiKey })]) {
            const response = await SELF.fetch(
                "https://enter.pollinations.ai/api/webhooks/github-secret-scanning",
                await signedRequest(body),
            );
            expect(response.status).toBe(400);
        }
        expect(await isEnabled(apiKey)).toBe(true);
    });

    test("disables matched secret keys idempotently", async ({
        apiKey,
        pubApiKey,
        mocks,
    }) => {
        mocks.github.state.secretScanningPublicKeys = [
            { key_identifier: KEY_ID, key: PUBLIC_KEY_PEM },
        ];
        await mocks.enable("github");
        const body = JSON.stringify([
            {
                token: pubApiKey,
                type: "pollinations_api_key",
                url: "",
                source: "content",
            },
            {
                token: "ignored-token",
                type: "another_provider_key",
                url: "https://github.com/example/repo/blob/main/file",
                source: "content",
            },
            {
                token: "sk_00000000000000000000000000000000",
                type: "pollinations_api_key",
                url: "",
                source: "manual_submission",
            },
            {
                token: apiKey,
                type: "pollinations_api_key",
                url: "https://github.com/example/repo/blob/main/file",
                source: "content",
            },
        ]);

        const response = await SELF.fetch(
            "https://enter.pollinations.ai/api/webhooks/github-secret-scanning",
            await signedRequest(body),
        );
        const repeated = await SELF.fetch(
            "https://enter.pollinations.ai/api/webhooks/github-secret-scanning",
            await signedRequest(body),
        );

        expect(response.status).toBe(200);
        expect(repeated.status).toBe(200);
        expect(await isEnabled(apiKey)).toBe(false);
        expect(await isEnabled(pubApiKey)).toBe(true);
        const rejected = await SELF.fetch(
            "https://enter.pollinations.ai/api/account/key",
            {
                headers: { Authorization: `Bearer ${apiKey}` },
            },
        );
        expect(rejected.status).toBe(401);
    });

    test("rejects an invalid signature without disabling the key", async ({
        apiKey,
        mocks,
    }) => {
        mocks.github.state.secretScanningPublicKeys = [
            { key_identifier: KEY_ID, key: PUBLIC_KEY_PEM },
        ];
        await mocks.enable("github");
        const body = JSON.stringify([
            {
                token: apiKey,
                type: "pollinations_api_key",
                url: "https://github.com/example/repo/blob/main/file",
                source: "content",
            },
        ]);

        const response = await SELF.fetch(
            "https://enter.pollinations.ai/api/webhooks/github-secret-scanning",
            await signedRequest(body, "invalid"),
        );

        expect(response.status).toBe(401);
        expect(await isEnabled(apiKey)).toBe(true);
    });
});
