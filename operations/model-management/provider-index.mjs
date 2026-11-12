import assert from "node:assert/strict";
import { createHash } from "node:crypto";

export const PROVIDER_INDEX_URL = "https://router.huggingface.co/v1/models";
const number = (value) => (Number.isFinite(value) && value >= 0 ? value : null);

export function providerIndex(source, inventory) {
    assert.ok(
        source.status === "fetched" &&
            source.url === PROVIDER_INDEX_URL &&
            source.fullPage === true &&
            typeof source.text === "string" &&
            Buffer.byteLength(source.text) <= 2 * 1024 * 1024 &&
            createHash("sha256").update(source.text).digest("hex") ===
                source.pageDigest,
        "Provider index needs exact complete fetched evidence",
    );
    const data = JSON.parse(source.text).data;
    assert.ok(
        Array.isArray(data) && data.length <= 5000,
        "Invalid provider index models",
    );
    const providers = new Map(),
        models = [];
    const canonical = (value) =>
        typeof value === "string" ? value.toLowerCase() : "";
    for (const row of data) {
        if (
            typeof row?.id !== "string" ||
            !/^[\w.-]{1,120}\/[\w.-]{1,200}$/.test(row.id) ||
            !Array.isArray(row.providers)
        )
            continue;
        const official = inventory
            .filter((model) =>
                [model.name, ...(model.aliases ?? [])].some(
                    (name) => canonical(name) === canonical(row.id),
                ),
            )
            .map(({ name }) => name);
        const observed = [];
        for (const route of row.providers.slice(0, 128)) {
            if (
                route?.status !== "live" ||
                typeof route.provider !== "string" ||
                !/^[a-z][a-z0-9-]{1,79}$/.test(route.provider)
            )
                continue;
            const hint = {
                name: route.provider,
                kind: "provider",
                modelNames: [],
                sourceIds: [source.id],
                evidence:
                    "Hugging Face routing metadata; direct provider prices, identity, credits and availability still require primary evidence.",
            };
            if (!providers.has(route.provider) && providers.size < 128)
                providers.set(route.provider, hint);
            const known = providers.get(route.provider);
            if (known)
                known.modelNames = [
                    ...new Set([...known.modelNames, ...official]),
                ];
            observed.push({
                provider: route.provider,
                input: number(route.pricing?.input),
                output: number(route.pricing?.output),
                throughput: number(route.throughput),
                contextLength: number(route.context_length),
                promotion: route.is_free === true,
            });
        }
        if (observed.length)
            models.push({
                name: row.id,
                officialNames: official,
                providers: observed,
            });
    }
    return {
        status: "fetched",
        sourceId: source.id,
        pageDigest: source.pageDigest,
        fetchedAt: source.fetchedAt,
        priceUnit:
            "USD per million tokens, reported by Hugging Face; verify directly",
        models,
        providers: [...providers.values()],
        officialMatches: models.filter(
            ({ officialNames }) => officialNames.length,
        ).length,
        scope: "Provider discovery hints only; not primary route verification or a recommendation.",
    };
}
