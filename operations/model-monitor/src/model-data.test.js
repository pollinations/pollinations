import assert from "node:assert/strict";
import { test } from "node:test";
import {
    computeHealthStatus,
    mergeModelHealth,
    migrateFavorites,
    normalizeCatalogModel,
} from "./model-data.js";

const canonical = "anthropic/claude-opus-5";
const model = normalizeCatalogModel({
    name: canonical,
    category: "text",
    aliases: ["claude-large", "claude-opus-4.8"],
    provider: "bedrock",
});
const oldStats = {
    model: "claude-large",
    event_type: "generate.text",
    provider: "bedrock",
    total_requests: 10,
    errors_5xx: 10,
};
const newStats = {
    model: canonical,
    event_type: "generate.text",
    provider: "bedrock",
    model_used: `${canonical}:bedrock`,
    total_requests: 5,
    status_2xx: 5,
    own_calls: 5,
    own_calls_ok: 4,
    fallback_rescues: 1,
};

test("old catalog still matches old statistics before the rollout", () => {
    const oldModel = normalizeCatalogModel({
        name: "claude-large",
        category: "text",
        aliases: [canonical],
    });
    const [result] = mergeModelHealth([oldModel], [oldStats], true);
    assert.equal(result.catalogStatus, "visible");
    assert.equal(result.stats, oldStats);
});

test("new catalog awaits traffic instead of inheriting historical failures", () => {
    const [current, historical] = mergeModelHealth([model], [oldStats], true);
    assert.equal(current.name, canonical);
    assert.equal(current.stats, null);
    assert.equal(computeHealthStatus(current.stats), "waiting");
    assert.equal(historical.name, "claude-large");
    assert.equal(historical.catalogStatus, "historical");
    assert.equal(historical.stats, oldStats);
    assert.equal(historical.title, undefined);
});

test("mixed history preserves counts, IDs, route attribution and fallback health", () => {
    const results = mergeModelHealth([model], [oldStats, newStats], true);
    assert.equal(results.length, 2);
    assert.equal(results[0].stats, newStats);
    assert.equal(results[1].stats, oldStats);
    assert.equal(computeHealthStatus(results[0].stats), "on");
    assert.equal(
        results.reduce((sum, row) => sum + row.stats.total_requests, 0),
        15,
    );
    assert.equal(results[0].stats.fallback_rescues, 1);
    assert.equal(results[0].stats.model_used, `${canonical}:bedrock`);
});

test("canonical IDs take precedence over aliases and wrong modalities remain anomalies", () => {
    const other = normalizeCatalogModel({
        name: "claude-large",
        category: "text",
    });
    const results = mergeModelHealth([model, other], [oldStats], true);
    assert.equal(results.length, 2);
    assert.equal(results[1].catalogStatus, "visible");
    const [, anomaly] = mergeModelHealth(
        [model],
        [{ ...newStats, event_type: "generate.image" }],
        true,
    );
    assert.equal(anomaly.catalogStatus, "anomaly");
});

test("community, unknown and unavailable-catalog rows are not relabeled", () => {
    const community = normalizeCatalogModel({
        name: "owner/custom-model",
        category: "text",
        community: true,
    });
    const rows = [
        { ...newStats, model: community.name, provider: "community" },
        { ...oldStats, model: "retired-unknown" },
        { ...oldStats, model: "undefined" },
    ];
    const results = mergeModelHealth([community], rows, true);
    assert.deepEqual(
        results.map((row) => row.name),
        [community.name, "retired-unknown"],
    );
    assert.equal(results[0].community, true);
    assert.equal(results[1].catalogStatus, "unregistered");
    assert.equal(
        mergeModelHealth([], [oldStats], false)[0].catalogStatus,
        "catalog-unavailable",
    );
});

test("video aliases use image events while preserving video favorites", () => {
    const video = normalizeCatalogModel({
        name: "publisher/video-1",
        output_modalities: ["video"],
        aliases: ["old-video"],
    });
    assert.equal(video.endpointType, "image");
    const results = mergeModelHealth(
        [video],
        [{ ...oldStats, model: "old-video", event_type: "generate.image" }],
        true,
    );
    assert.equal(results[1].catalogStatus, "historical");
    assert.deepEqual(migrateFavorites(["video-old-video"], results), [
        "video-publisher/video-1",
    ]);
});

test("favorites migrate and deduplicate without erasing unknown selections", () => {
    const favorites = [
        "text-claude-large",
        `text-${canonical}`,
        "text-owner/custom-model",
        "audio-claude-large",
    ];
    const migrated = migrateFavorites(favorites, [model]);
    assert.deepEqual(migrated, [
        `text-${canonical}`,
        "text-owner/custom-model",
        "audio-claude-large",
    ]);
    assert.deepEqual(migrateFavorites(migrated, [model]), migrated);
    assert.deepEqual(migrateFavorites(favorites, []), favorites);
});

test("favorites preserve exact IDs and do not guess colliding aliases", () => {
    const other = normalizeCatalogModel({
        name: "other/model",
        category: "text",
        aliases: ["claude-large"],
    });
    assert.deepEqual(migrateFavorites(["text-claude-large"], [model, other]), [
        "text-claude-large",
    ]);
    const exact = normalizeCatalogModel({
        name: "claude-large",
        category: "text",
    });
    assert.deepEqual(migrateFavorites(["text-claude-large"], [model, exact]), [
        "text-claude-large",
    ]);
});

test("search variants remain complete identities with distinct execution routes", () => {
    const search = normalizeCatalogModel({
        name: "google/gemini-2.5-flash-lite:search",
        category: "text",
        aliases: ["gemini-search"],
    });
    const stats = {
        ...newStats,
        model: search.name,
        model_used: `${search.name}:openrouter:ai-studio`,
    };
    const [result] = mergeModelHealth([search], [stats], true);
    assert.equal(result.stats, stats);
    assert.deepEqual(migrateFavorites(["text-gemini-search"], [search]), [
        `text-${search.name}`,
    ]);
});

test("no traffic is neutral, but even one real server failure is not hidden", () => {
    assert.equal(computeHealthStatus(null), "waiting");
    assert.equal(
        computeHealthStatus({ total_requests: 10, errors_4xx: 10 }),
        "waiting",
    );
    assert.equal(
        computeHealthStatus({ total_requests: 1, errors_5xx: 1 }),
        "off",
    );
    assert.equal(
        computeHealthStatus({ status_2xx: 95, errors_5xx: 5 }),
        "degraded",
    );
    assert.equal(computeHealthStatus({ status_2xx: 96, errors_5xx: 4 }), "on");
});
