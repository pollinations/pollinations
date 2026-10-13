import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { assess } from "./researcher.mjs";

const hash = (text) => createHash("sha256").update(text).digest("hex");
const digest = (value) =>
    typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const recent = (value, maxAge = 30 * 86400000) => {
    const age = Date.now() - Date.parse(value);
    return Number.isFinite(age) && age >= 0 && age <= maxAge;
};

export async function reuseModel(
    previous,
    model,
    { guidanceDigest, inventory, fetch },
) {
    try {
        const old = previous?.models?.find((row) => row.name === model.name);
        assert.ok(old?.status === "researched");
        assert.ok(
            digest(guidanceDigest) &&
                previous.guidance?.digest === guidanceDigest,
        );
        assert.equal(old.contractDigest, hash(JSON.stringify(model)));
        assert.ok(
            Number.isFinite(Date.parse(old.researchedAt)) &&
                recent(old.refreshedAt ?? old.researchedAt),
        );
        assert.ok(
            Array.isArray(old.routes) &&
                Array.isArray(old.discoveries) &&
                Array.isArray(old.gaps),
        );
        const unresolved =
            old.routes.length === 0 && old.discoveries.length === 0;
        if (unresolved) {
            assert.ok(
                old.recommendation == null &&
                    old.gaps.length &&
                    old.gaps.every(
                        (gap) => typeof gap === "string" && gap.trim(),
                    ) &&
                    recent(old.researchedAt, 86400000),
            );
        }
        assert.ok(Array.isArray(old.searches));
        const scopes = new Map();
        for (const { scope, queries } of old.searches) {
            assert.ok(typeof scope === "string" && !scopes.has(scope));
            assert.ok(
                Array.isArray(queries) &&
                    queries.length &&
                    queries.every(
                        (query) => typeof query === "string" && query.trim(),
                    ),
            );
            scopes.set(scope, new Set(queries));
        }
        if (unresolved)
            assert.ok(
                [...scopes.values()].some((queries) =>
                    [...queries].some(
                        (query) => query.split(":")[2] === "challenge",
                    ),
                ),
            );
        const referenced = new Set([
            ...old.routes.flatMap((route) =>
                route.claims.map((claim) => claim.sourceId),
            ),
            ...old.discoveries.flatMap((item) => item.sourceIds),
        ]);
        assert.ok(
            (unresolved || referenced.size) &&
                [...referenced].every(
                    (id) => typeof id === "string" && id.length,
                ),
        );
        const available = Array.isArray(old.sources)
            ? old.sources
            : old.sourceIds?.map((id) =>
                  previous.sources?.find((source) => source.id === id),
              );
        assert.ok(Array.isArray(available) && available.every(Boolean));
        assert.equal(
            new Set(available.map((source) => source.id)).size,
            available.length,
        );
        const originals = unresolved
            ? available.filter((source) => source.status === "fetched")
            : [...referenced].map((id) =>
                  available.find((source) => source.id === id),
              );
        if (unresolved) assert.ok(originals.length && originals.length <= 50);
        for (const source of originals) {
            assert.ok(
                source?.status === "fetched" &&
                    typeof source.id === "string" &&
                    source.id.length &&
                    source.extractionVersion === 2 &&
                    digest(source.pageDigest),
            );
            assert.ok(
                typeof source.text === "string" &&
                    source.text.trim() &&
                    source.digest === hash(source.text),
            );
            assert.ok(recent(source.at) && recent(source.fetchedAt));
            const url = new URL(source.url);
            assert.ok(
                url.protocol === "https:" &&
                    !url.username &&
                    !url.password &&
                    (!url.port || url.port === "443"),
            );
            assert.ok(
                source.focus === undefined ||
                    (typeof source.focus === "string" && source.focus.trim()),
            );
        }
        // Assess before fetching so malformed historical evidence costs no refresh work.
        const baseline = assess(old, originals, scopes, model, inventory);
        assert.ok(
            baseline.routes.every(
                (route, index) =>
                    route.claims.length === old.routes[index].claims.length,
            ),
        );
        assert.equal(baseline.discoveries.length, old.discoveries.length);
        const sources = [];
        for (const source of originals) {
            const maxCharacters =
                source.maxCharacters ?? Math.max(4000, source.text.length);
            assert.ok(
                Number.isSafeInteger(maxCharacters) &&
                    maxCharacters >= 1000 &&
                    maxCharacters <= 18000,
            );
            const refreshed = await fetch(
                source.url,
                "http",
                source.focus,
                maxCharacters,
            );
            assert.ok(
                refreshed &&
                    (!refreshed.status || refreshed.status === "fetched"),
            );
            assert.equal(refreshed.method, "scrapling-http");
            assert.equal(refreshed.extractionVersion, 2);
            assert.equal(refreshed.pageDigest, source.pageDigest);
            assert.ok(
                typeof refreshed.text === "string" && refreshed.text.trim(),
            );
            assert.ok(recent(refreshed.fetchedAt));
            assert.ok(typeof refreshed.url === "string");
            const url = new URL(refreshed.url);
            assert.ok(
                url.protocol === "https:" &&
                    !url.username &&
                    !url.password &&
                    (!url.port || url.port === "443"),
            );
            sources.push({
                ...source,
                ...refreshed,
                id: source.id,
                status: "fetched",
                at: refreshed.fetchedAt,
                digest: hash(refreshed.text),
            });
        }
        const assessed = assess(old, sources, scopes, model, inventory);
        assert.ok(
            assessed.routes.every(
                (route, index) =>
                    route.claims.length === old.routes[index].claims.length &&
                    !(
                        route.verification === "documented" &&
                        old.routes[index].verification !== "documented"
                    ) &&
                    !(
                        route.identitySupported &&
                        !old.routes[index].identitySupported
                    ) &&
                    !(
                        route.availabilitySupported &&
                        !old.routes[index].availabilitySupported
                    ),
            ),
        );
        assert.equal(assessed.discoveries.length, old.discoveries.length);
        return {
            ...old,
            ...assessed,
            sources,
            reused: true,
            ...(unresolved ? { reusedUnresolved: true } : {}),
            refreshedAt: new Date().toISOString(),
        };
    } catch {
        // Invalid historical evidence or failed refresh resumes normal research.
        return null;
    }
}
