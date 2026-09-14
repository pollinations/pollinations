export function normalizeCatalogModel(model) {
    const name = model.name || model.id;
    if (!name) return null;
    const out = model.output_modalities;
    const type =
        model.category ||
        ["video", "embedding", "audio", "image", "text"].find((type) =>
            out?.includes(type),
        ) ||
        "unknown";
    return {
        ...model,
        name,
        aliases: model.aliases || [],
        community: model.community === true,
        type,
        endpointType: ["video", "3d"].includes(type) ? "image" : type,
        catalogStatus: "visible",
    };
}

// Match statistics by the recorded ID only. An alias may have represented
// another version in the past, so it must never transfer historical health.
// Identity is the exception: what a model *is* comes from catalog metadata,
// never from the shape of the recorded ID or the endpoint it was served on.
export function mergeModelHealth(models, healthStats, catalogAvailable) {
    const stats = healthStats.filter((row) => row.model !== "undefined");
    const matchesEndpoint = (model, row) =>
        row.event_type === `generate.${model.endpointType || model.type}`;
    const current = models.map((model) => {
        const row =
            stats.find(
                (row) =>
                    row.model === model.name && matchesEndpoint(model, row),
            ) ?? null;
        return {
            ...model,
            provider: model.provider || row?.provider,
            stats: row,
        };
    });
    const extra = stats
        .filter(
            (row) =>
                !models.some(
                    (model) =>
                        model.name === row.model && matchesEndpoint(model, row),
                ),
        )
        .map((row) => {
            const eventType =
                row.event_type?.replace("generate.", "") || "unknown";
            const sameName = models.filter((model) => model.name === row.model);
            const aliased = models.find(
                (model) =>
                    model.aliases.includes(row.model) &&
                    matchesEndpoint(model, row),
            );
            let catalogStatus = "unregistered";
            let description = "Unregistered model";
            let community = row.provider === "community";
            // Endpoints are coarser than categories: video and 3D both record
            // image events. Only fall back to the event type when no catalog
            // entry claims this ID.
            let type = eventType;
            let endpointType = eventType;
            if (catalogAvailable === false) {
                catalogStatus = "catalog-unavailable";
                description = "Unknown model while live catalog is unavailable";
            } else if (sameName.length > 0) {
                catalogStatus = "anomaly";
                community = sameName.some((model) => model.community);
                const types = [...new Set(sameName.map((model) => model.type))];
                description = `Unexpected ${eventType} traffic; registered as ${types.sort().join("/")}`;
            } else if (aliased) {
                catalogStatus = "historical";
                description =
                    "Historical ID, now an alias. Recorded traffic is kept separate from current model health.";
                community = aliased.community;
                type = aliased.type;
                endpointType = aliased.endpointType;
            }
            return {
                name: row.model || "(unknown)",
                community,
                type,
                endpointType,
                provider: row.provider,
                description,
                catalogStatus,
                stats: row,
            };
        });
    return [...current, ...extra];
}

export function modelKey(model) {
    return `${model.type}-${model.name}`;
}

// Preferences follow today's catalog; statistical identities do not. Keep
// unknown favorites so a temporary catalog failure never deletes a selection.
export function migrateFavorites(favorites, models) {
    const current = models.filter((model) => model.catalogStatus === "visible");
    const keys = new Set(current.map(modelKey));
    const aliases = new Map();
    for (const model of current) {
        for (const alias of model.aliases) {
            const key = `${model.type}-${alias}`;
            const target = modelKey(model);
            aliases.set(
                key,
                aliases.has(key) && aliases.get(key) !== target ? null : target,
            );
        }
    }
    return [
        ...new Set(
            favorites
                .filter((key) => typeof key === "string")
                .map((key) => (keys.has(key) ? key : aliases.get(key) || key)),
        ),
    ];
}

export const DEGRADED_5XX_PERCENT = 5;
export const OFF_5XX_PERCENT = 20;

export function computeHealthStatus(stats) {
    const requests = (stats?.status_2xx || 0) + (stats?.errors_5xx || 0);
    // No completed non-client traffic is neither healthy nor an outage.
    if (!requests) return "waiting";
    const percent5xx = ((stats.errors_5xx || 0) / requests) * 100;
    if (percent5xx >= OFF_5XX_PERCENT) return "off";
    if (percent5xx >= DEGRADED_5XX_PERCENT) return "degraded";
    return "on";
}

// model_route_health returns two grains in one response. Rollup rows are a
// model's score across every route it was served through; route rows are the
// individual primary and fallbacks that add up to it.
export const rollupRows = (routeStats) =>
    (routeStats || []).filter(
        (row) => row.is_rollup && row.model !== "undefined",
    );

// Attaches the per-route rows to each model, whose own stats are already the
// matching rollup row. Column names match across both grains, so
// computeHealthStatus and the table formatters work unchanged on either.
//
// Kept separate from mergeModelHealth so the identity and catalog-anomaly rules
// stay in one place and this only adds the drill-down.
export function attachRouteHealth(models, routeStats) {
    const rows = (routeStats || []).filter(
        (row) => !row.is_rollup && row.model !== "undefined",
    );
    if (rows.length === 0) return models;
    return models.map((model) => {
        const eventType = `generate.${model.endpointType || model.type}`;
        const routes = rows.filter(
            (row) => row.model === model.name && row.event_type === eventType,
        );
        if (routes.length === 0) return model;
        // Primary first (own calls, not a fallback target), then busiest
        // fallback first — the order a reader would want to scan them in.
        const sorted = [...routes].sort((a, b) => {
            const aPrimary = !a.fallback_used;
            const bPrimary = !b.fallback_used;
            if (aPrimary !== bPrimary) return aPrimary ? -1 : 1;
            return (b.total_requests || 0) - (a.total_requests || 0);
        });
        const primaryRoute =
            sorted.find((route) => !route.fallback_used) ?? null;
        return { ...model, routes: sorted, primaryRoute };
    });
}

/** Requests a fallback saved after the model's own route had already failed. */
export function rescuedCount(model) {
    return (model.routes || []).reduce(
        (total, route) => total + (route.fallback_rescues || 0),
        0,
    );
}

function severityRank(health) {
    if (health === "off") return 2;
    if (health === "degraded") return 1;
    return 0;
}

// Whether the model's own upstream tells a different story than the
// caller-visible headline: a dead primary propped up by a fallback ("off"
// looking "on"/"degraded" up top), or a primary that is merely struggling
// while a fallback is quietly absorbing the difference ("rescued").
// Returns null when there's nothing to flag, or no primary route was
// observed in this window at all (never called, so nothing to compare).
export function primaryRouteStatus(model) {
    const primary = model.primaryRoute;
    if (!primary) return null;
    const primaryHealth = computeHealthStatus(primary);
    if (primaryHealth === "waiting") return null;
    const headlineHealth = computeHealthStatus(model.stats);
    // Only worth flagging when the headline disagrees. A model that is simply
    // down already says so up top; repeating it per-route is pure noise.
    if (severityRank(primaryHealth) <= severityRank(headlineHealth))
        return null;
    if (primaryHealth === "off") return "primary-off";
    const rescued = (model.routes || []).some(
        (route) => route.fallback_used && (route.fallback_rescues || 0) > 0,
    );
    return rescued ? "rescued" : null;
}
