import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
    MAX_HANDOFF_BYTES,
    makeHandoff,
    proposalKey,
    sanitize,
} from "./collect-research.mjs";

const at = "2026-10-06T12:00:00.000Z";
const base = { at, revision: "abc123", findings: [], gaps: [] };

test("canonical proposal key ignores lane, rates and source but respects version/change", () => {
    const discovery = makeHandoff(
        {
            ...base,
            registry: [
                { name: "canonical", route: { model: "vendor/version" } },
            ],
            findings: [
                {
                    id: "vendor/version",
                    kind: "sourcing_lead",
                    source: "openrouter",
                    upstreamRates: { input: 3 },
                },
            ],
        },
        "discovery",
        {},
    );
    const pricing = makeHandoff(
        {
            ...base,
            findings: [
                {
                    model: "canonical",
                    kind: "price_review",
                    facts: { changes: [{ configured: 99 }] },
                },
            ],
        },
        "pricing",
        {},
    );
    assert.equal(discovery.findings[0].key, pricing.findings[0].key);
    assert.notEqual(
        proposalKey("canonical", "v1", "model_review"),
        proposalKey("canonical", "v2", "model_review"),
    );
    assert.notEqual(
        proposalKey("canonical", null, "retirement_review"),
        pricing.findings[0].key,
    );
});

test("credentials are removed recursively and configured route costs remain private", () => {
    const secret = "actual-provider-credential";
    const result = makeHandoff(
        {
            ...base,
            findings: [
                {
                    model: "canonical",
                    kind: "price_review",
                    facts: {
                        configuredCost: 123,
                        account: "private-account",
                        note: secret,
                        token: secret,
                    },
                    evidence: [
                        "https://management.azure.com/subscriptions/private-account",
                        "https://private-account.openai.azure.com/openai/models",
                        "https://openrouter.ai/api/v1/models?key=sk_test",
                    ],
                },
            ],
        },
        "pricing",
        { PROVIDER_API_KEY: secret },
    );
    const text = JSON.stringify(result);
    assert(!text.includes(secret));
    assert(!text.includes("sk_test"));
    assert.equal(result.findings[0].evidence.finding.facts.configuredCost, 123);
    assert.equal(
        result.findings[0].evidence.finding.facts.account,
        "private-account",
    );
    const { evidence, ...publicFinding } = result.findings[0];
    const publicText = JSON.stringify(publicFinding);
    assert(!publicText.includes("123"));
    assert(!publicText.includes("private-account"));
    assert.equal(publicFinding.sourceUrls.length, 1);
    assert(!("token" in evidence.finding.facts));
    assert.equal(
        sanitize(
            {
                Authorization: "Bearer test",
                note: "Bearer sk_test",
                api_key: "test",
            },
            {},
        ).note,
        "Bearer [redacted]",
    );
});

test("partial and unavailable sources retain gaps alongside successful findings", () => {
    const result = makeHandoff(
        {
            ...base,
            sources: [
                {
                    source: "fal",
                    status: "partial",
                    queries: [
                        {
                            label: "page-2",
                            status: "unavailable",
                            error: "HTTP 503",
                        },
                    ],
                    observations: [
                        {
                            id: "fal/model",
                            version: "v1",
                            signals: [{ kind: "editorial" }],
                        },
                    ],
                },
                {
                    source: "replicate",
                    queries: [
                        {
                            status: "unavailable",
                            error: "Existing REPLICATE_API_TOKEN required",
                        },
                    ],
                    observations: [],
                },
            ],
            findings: [{ id: "fal/model", source: "fal", kind: "investigate" }],
        },
        "discovery",
        {},
    );
    assert.equal(result.findings.length, 1);
    assert.equal(result.findings[0].evidence.observation.version, "v1");
    assert(result.gaps.some((g) => g.error === "HTTP 503"));
    assert(result.gaps.some((g) => g.source === "replicate"));
});

test("bounded output retains exact routes and explicitly counts omitted evidence", () => {
    const findings = Array.from({ length: 200 }, (_, i) => ({
        model: `model-${i}`,
        kind: "price_review",
        facts: {
            large: "x".repeat(5000),
            rows: Array(40).fill("z".repeat(3000)),
        },
    }));
    const result = makeHandoff(
        {
            ...base,
            findings,
            observations: [
                {
                    name: "model-0",
                    route: {
                        model: "vendor/precise-version",
                        providerOptions: {
                            only: ["pin"],
                            allow_fallbacks: false,
                        },
                    },
                },
            ],
        },
        "pricing",
        {},
    );
    assert(Buffer.byteLength(JSON.stringify(result)) <= MAX_HANDOFF_BYTES);
    assert(result.findings.length > 0);
    assert.equal(
        result.findings[0].evidence.observation.route.model,
        "vendor/precise-version",
    );
    assert.equal(
        result.findings[0].evidence.observation.route.providerOptions
            .allow_fallbacks,
        false,
    );
    assert(result.gaps.some((g) => g.omittedFindings > 0));
});

test("same proposal enriches private source evidence without duplicate findings", () => {
    const result = makeHandoff(
        {
            ...base,
            findings: [
                {
                    model: "canonical",
                    kind: "price_review",
                    evidence: ["https://openrouter.ai/api/v1/models"],
                    facts: { first: true },
                },
                {
                    model: "canonical",
                    kind: "pricing_review",
                    url: "https://gen.pollinations.ai/models",
                    facts: { second: true },
                },
            ],
        },
        "pricing",
        {},
    );
    assert.equal(result.findings.length, 1);
    assert.equal(
        result.findings[0].evidence.related[0].finding.facts.second,
        true,
    );
    assert.equal(result.findings[0].sourceUrls.length, 2);
});

test("empty pricing result still describes known pricing coverage gaps", () => {
    const result = makeHandoff(base, "pricing", {});
    assert.equal(result.findings.length, 0);
    assert.match(
        result.gaps[0],
        /modalities, variants, credits and account terms/,
    );
    assert.throws(
        () => makeHandoff({ ...base, at: "invalid" }, "pricing", {}),
        /Invalid/,
    );
});

test("discovery CLI replay writes a private handoff without network/inference", async () => {
    const dir = await mkdtemp(join(tmpdir(), "research-replay-"));
    try {
        const replay = join(dir, "replay.json");
        await writeFile(
            replay,
            JSON.stringify({
                ...base,
                findings: [
                    {
                        id: "owner/model",
                        kind: "investigate",
                        version: "abc",
                        url: "https://huggingface.co/owner/model",
                    },
                ],
            }),
        );
        const script = fileURLToPath(
            new URL("./collect-research.mjs", import.meta.url),
        );
        await promisify(execFile)(process.execPath, [
            script,
            "--kind",
            "discovery",
            "--out",
            join(dir, "out"),
            "--replay",
            replay,
        ]);
        const result = JSON.parse(
            await readFile(join(dir, "out/handoff.json"), "utf8"),
        );
        assert.equal(result.kind, "discovery");
        assert.equal(result.findings[0].model, "owner/model");
        const invalid = await promisify(execFile)(process.execPath, [
            script,
            "--kind",
            "discovery",
            "--out",
            "relative",
        ]).then(
            () => null,
            (e) => e,
        );
        assert.equal(invalid.code, 1);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test("pricing CLI replay preserves exact configured routes and source failures", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pricing-replay-"));
    try {
        const replay = join(dir, "replay.json");
        const catalogUrl =
            "https://openrouter.ai/api/v1/models?output_modalities=all";
        await writeFile(
            replay,
            JSON.stringify({
                at,
                revision: "fixture",
                inventory: [
                    {
                        name: "priced",
                        provider: "openrouter",
                        category: "text",
                        route: {
                            model: "vendor/version",
                            providerOptions: {
                                only: ["pin"],
                                allow_fallbacks: false,
                            },
                        },
                        cost: {
                            promptTextTokens: 0.00001,
                            completionTextTokens: 0.00002,
                        },
                        fallbacks: [],
                    },
                ],
                sources: [
                    {
                        url: catalogUrl,
                        at,
                        status: "unavailable",
                        error: "HTTP 503",
                    },
                ],
            }),
        );
        const script = fileURLToPath(
            new URL("./collect-research.mjs", import.meta.url),
        );
        await promisify(execFile)(process.execPath, [
            script,
            "--kind",
            "pricing",
            "--out",
            join(dir, "out"),
            "--replay",
            replay,
        ]);
        const result = JSON.parse(
            await readFile(join(dir, "out/handoff.json"), "utf8"),
        );
        assert.equal(result.revision, "fixture");
        assert.equal(result.kind, "pricing");
        assert(result.gaps.some((g) => g.error === "HTTP 503"));
        assert.equal(result.findings.length, 0);
        const snapshot = JSON.parse(
            await readFile(join(dir, "out/snapshot.json"), "utf8"),
        );
        assert.equal(snapshot.observations[0].route.model, "vendor/version");
        assert.equal(snapshot.observations[0].exactPrice, false);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});
