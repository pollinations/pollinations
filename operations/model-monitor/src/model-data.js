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
            const type = row.event_type?.replace("generate.", "") || "unknown";
            const sameName = models.filter((model) => model.name === row.model);
            let catalogStatus = "unregistered";
            let description = "Unregistered model";
            let community = row.provider === "community";
            if (catalogAvailable === false) {
                catalogStatus = "catalog-unavailable";
                description = "Unknown model while live catalog is unavailable";
            } else if (sameName.length > 0) {
                catalogStatus = "anomaly";
                community = sameName.some((model) => model.community);
                const types = [...new Set(sameName.map((model) => model.type))];
                description = `Unexpected ${type} traffic; registered as ${types.sort().join("/")}`;
            } else if (
                models.some(
                    (model) =>
                        model.aliases.includes(row.model) &&
                        matchesEndpoint(model, row),
                )
            ) {
                catalogStatus = "historical";
                description =
                    "Historical ID, now an alias. Recorded traffic is kept separate from current model health.";
            }
            return {
                name: row.model || "(unknown)",
                community,
                type,
                endpointType: type,
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
