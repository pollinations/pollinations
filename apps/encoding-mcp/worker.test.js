import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

async function clientFor(t, modern = false) {
    const client = new Client(
        { name: "encoding-test", version: "1" },
        modern ? { versionNegotiation: { mode: "auto" } } : {},
    );
    await client.connect(
        new StreamableHTTPClientTransport(
            new URL("https://encoding.internal/"),
            {
                fetch: (input, init) =>
                    worker.fetch(
                        input instanceof Request
                            ? input
                            : new Request(input, init),
                    ),
            },
        ),
    );
    t.after(() => client.close());
    return client;
}

async function call(client, name, args = {}) {
    const result = await client.callTool({ name, arguments: args });
    assert.notEqual(result.isError, true, JSON.stringify(result));
    return JSON.parse(result.content[0].text);
}

async function fails(client, name, args) {
    const result = await client.callTool({ name, arguments: args });
    assert.equal(result.isError, true, JSON.stringify(args));
}

test("private deployment has no public routes or preview URLs", () => {
    const config = JSON.parse(
        readFileSync(
            new URL("./wrangler.jsonc", import.meta.url),
            "utf8",
        ).replace(/^\s*\/\/.*$/gm, ""),
    );
    for (const env of [config, config.env.staging]) {
        assert.equal(env.workers_dev, false);
        assert.equal(env.preview_urls, false);
        assert.deepEqual(env.routes, []);
    }
});

test("private Worker leaves other routes to Gen", async () => {
    assert.equal(
        (await worker.fetch(new Request("https://encoding/mcp"))).status,
        404,
    );
});

for (const modern of [false, true])
    test(`stateless protocol ${modern ? "modern" : "legacy"}: list and call`, async (t) => {
        const client = await clientFor(t, modern);
        assert.equal(client.getProtocolEra(), modern ? "modern" : "legacy");
        assert.deepEqual(
            (await client.listTools()).tools.map((x) => x.name).sort(),
            [
                "checksum_crc32",
                "data_uri_build",
                "encoding_convert",
                "hash_text",
                "id_generate",
                "id_inspect",
                "jwt_inspect",
                "jwt_sign",
            ],
        );
        const converted = await call(client, "encoding_convert", {
            value: "héllo",
            to: "base64",
        });
        assert.equal(converted.value, "aMOpbGxv");
        assert.equal(converted.byteLength, 6);
    });

test("encodings round-trip and reject malformed input", async (t) => {
    const client = await clientFor(t);
    for (const to of ["base64", "base64url", "hex", "url", "html"]) {
        const encoded = await call(client, "encoding_convert", {
            value: "<a> & 'b' + ünïcode",
            to,
        });
        const back = await call(client, "encoding_convert", {
            value: encoded.value,
            from: to,
            to: "text",
        });
        assert.equal(back.value, "<a> & 'b' + ünïcode", to);
    }
    const hex = await call(client, "encoding_convert", {
        value: "Hi",
        to: "hex",
    });
    assert.deepEqual(hex, {
        from: "text",
        to: "hex",
        value: "4869",
        byteLength: 2,
    });
    // 0xff alone is not UTF-8; decoding must not silently replace it.
    await fails(client, "encoding_convert", { value: "ff", from: "hex" });
    await fails(client, "encoding_convert", { value: "abcde", from: "base64" });
    await fails(client, "encoding_convert", { value: "00zz", from: "hex" });
    await fails(client, "encoding_convert", { value: "100%", from: "url" });
});

test("data URIs parse and build", async (t) => {
    const client = await clientFor(t);
    const parsed = await call(client, "data_uri_build", {
        value: "data:text/plain;charset=utf-8;base64,SGk=",
    });
    assert.equal(parsed.mediaType, "text/plain;charset=utf-8");
    assert.equal(parsed.text, "Hi");
    const plain = await call(client, "data_uri_build", {
        value: "data:text/plain,Hi%20there",
    });
    assert.equal(plain.text, "Hi there");
    assert.equal(plain.base64, false);
    const built = await call(client, "data_uri_build", {
        mode: "build",
        mediaType: "image/png",
        value: "SGk=",
    });
    assert.equal(built.uri, "data:image/png;base64,SGk=");
    await fails(client, "data_uri_build", { value: "SGk=" });
});

test("hashes match known digests and verify without leaking", async (t) => {
    const client = await clientFor(t);
    const empty = await call(client, "hash_text", { text: "" });
    assert.equal(
        empty.digest,
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    // RFC 4231 test case 2.
    const hmac = await call(client, "hash_text", {
        text: "what do ya want for nothing?",
        algorithm: "sha256",
        key: "Jefe",
    });
    assert.equal(
        hmac.digest,
        "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
    );
    const verified = await call(client, "hash_text", {
        text: "",
        expected:
            "E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855",
    });
    assert.equal(verified.matches, true);
    assert.equal(
        (await call(client, "hash_text", { text: "", expected: "e3b0" }))
            .matches,
        false,
    );
    const base64 = await call(client, "hash_text", {
        text: "abc",
        encoding: "base64url",
    });
    assert.equal(base64.digest, "ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0");
    await fails(client, "hash_text", { text: "abc", algorithm: "md5" });
});

test("JWT inspection reports claims, verifies HS256 and refuses to guess", async (t) => {
    const client = await clientFor(t);
    const signed = await call(client, "jwt_sign", {
        claims: {
            sub: "user-1",
            iss: "pollinations",
            exp: 2000000000,
            nbf: 1000000000,
        },
        secret: "hunter2",
        keyId: "k1",
    });
    const inspected = await call(client, "jwt_inspect", {
        token: `Bearer ${signed.token}`,
        secret: "hunter2",
    });
    assert.equal(inspected.payload.sub, "user-1");
    assert.equal(inspected.keyId, "k1");
    assert.equal(inspected.claims.expiresAt.iso, "2033-05-18T03:33:20.000Z");
    assert.equal(inspected.validSignature, true);
    // exp 2033 is still ahead; the reading comes from the claim, not the clock.
    assert.equal(inspected.expired, false);
    // nbf 2001 has passed, so its offset from now is negative.
    assert.equal(inspected.claims.notBefore.secondsFromNow < 0, true);
    const past = await call(client, "jwt_sign", {
        claims: { exp: 1000000000 },
        secret: "hunter2",
    });
    const expired = await call(client, "jwt_inspect", {
        token: past.token,
        secret: "hunter2",
    });
    assert.equal(expired.expired, true);

    // Flip the first signature character: A and B are both valid base64url, so
    // the token still parses but the signature no longer matches.
    const [header, payload, signature] = signed.token.split(".");
    const tamperedSignature = `${signature[0] === "A" ? "B" : "A"}${signature.slice(1)}`;
    const tampered = await call(client, "jwt_inspect", {
        token: `${header}.${payload}.${tamperedSignature}`,
        secret: "hunter2",
    });
    assert.equal(tampered.validSignature, false);
    // A bad signature must not be reported as "expired"; nothing is known.
    assert.equal(tampered.expired, null);

    const wrongSecret = await call(client, "jwt_inspect", {
        token: signed.token,
        secret: "wrong",
    });
    assert.equal(wrongSecret.validSignature, false);
    assert.equal(wrongSecret.expired, null);

    const unverified = await call(client, "jwt_inspect", {
        token: signed.token,
    });
    assert.match(unverified.signature, /not checked/);
    assert.equal(unverified.validSignature, undefined);

    const es256 = [
        Buffer.from(JSON.stringify({ alg: "ES256", typ: "JWT" })).toString(
            "base64url",
        ),
        Buffer.from(JSON.stringify({ sub: "x" })).toString("base64url"),
        "sig",
    ].join(".");
    await fails(client, "jwt_inspect", { token: es256, secret: "k" });
    await fails(client, "jwt_inspect", { token: "not.a.jwt" });
    await fails(client, "jwt_inspect", { token: "only-two.parts" });
});

test("identifiers are time-ordered, well-formed and explained", async (t) => {
    const client = await clientFor(t);
    const now = Date.UTC(2026, 10, 10, 12, 0, 0);
    const v7 = await call(client, "id_generate", {
        kind: "uuid7",
        count: 3,
        now,
    });
    assert.equal(v7.ids.length, 3);
    for (const id of v7.ids) {
        assert.match(
            id,
            /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        );
        const info = await call(client, "id_inspect", { id });
        assert.equal(info.version, 7);
        assert.equal(info.rfcVariant, true);
        assert.equal(info.timestamp, "2026-11-10T12:00:00.000Z");
    }
    // The 48-bit timestamp prefix is what makes v7 sortable; the remaining bits
    // are random, so only a later millisecond must sort after an earlier one.
    const later = await call(client, "id_generate", { now: now + 1 });
    assert.equal(later.ids[0] > v7.ids[0], true);

    const ulids = await call(client, "id_generate", {
        kind: "ulid",
        count: 2,
        now,
    });
    for (const id of ulids.ids) {
        assert.match(id, /^[0-9A-HJKMNP-TV-Z]{26}$/);
        assert.equal(
            (await call(client, "id_inspect", { id })).timestamp,
            "2026-11-10T12:00:00.000Z",
        );
    }
    const v1 = await call(client, "id_inspect", {
        id: "c232ab00-9414-11ec-b3c8-9f6bdeced846",
    });
    assert.equal(v1.version, 1);
    assert.equal(v1.timestamp, "2022-02-22T19:22:22.000Z");
    await fails(client, "id_inspect", { id: "not-an-id" });
    await fails(client, "id_generate", { count: 21 });
});

test("CRC-32 matches the reference vectors", async (t) => {
    const client = await clientFor(t);
    assert.equal(
        (await call(client, "checksum_crc32", { value: "123456789" })).crc32,
        "cbf43926",
    );
    assert.equal(
        (
            await call(client, "checksum_crc32", {
                value: "48656c6c6f",
                from: "hex",
            })
        ).crc32,
        "f7d18982",
    );
    const checked = await call(client, "checksum_crc32", {
        value: "123456789",
        expected: "0xCBf43926",
    });
    assert.equal(checked.matches, true);
    assert.equal(
        (
            await call(client, "checksum_crc32", {
                value: "123456789",
                expected: "00000000",
            })
        ).matches,
        false,
    );
    await fails(client, "checksum_crc32", { value: "zz", from: "hex" });
});
