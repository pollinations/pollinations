#!/usr/bin/env node
import fs from "node:fs";

const GEN = "https://gen.pollinations.ai";
const TINYBIRD = "https://api.europe-west2.gcp.tinybird.co";
const WINDOW_DAYS = 7;
const MIN_ELIGIBLE_REQUESTS = 20;
const MIN_SUCCESS_RATE = 0.7;
const MIN_CURRENT_SUCCESS_RATE = 0.8;
const OUTPUT_PATH =
    process.env.SEVEN_DAY_HEALTH_PATH ??
    "/home/ubuntu/monitor/seven-day-health.json";

const token = process.env.TB_TOKEN;
if (!token) {
    console.error("TB_TOKEN is required");
    process.exit(1);
}

const sql = `
SELECT
    resolved_model_requested AS model,
    countIf(is_final) AS total_final,
    countIf(is_final AND response_status >= 200 AND response_status < 300) AS successes,
    countIf(is_final AND response_status >= 500) AS failures_5xx,
    countIf(
        is_final
        AND event_type = 'generate.image'
        AND response_status >= 400 AND response_status < 500
        AND startsWith(error_message, 'Image provider error:')
    ) AS provider_4xx,
    countIf(
        is_final AND fallback_used
        AND response_status >= 200 AND response_status < 300
    ) AS fallback_saved,
    countIf(
        start_time >= now() - INTERVAL 24 HOUR
        AND is_final
        AND response_status >= 200 AND response_status < 300
    ) AS successes_24h,
    countIf(
        start_time >= now() - INTERVAL 24 HOUR
        AND is_final
        AND response_status >= 500
    ) AS failures_5xx_24h,
    countIf(
        start_time >= now() - INTERVAL 24 HOUR
        AND is_final
        AND event_type = 'generate.image'
        AND response_status >= 400 AND response_status < 500
        AND startsWith(error_message, 'Image provider error:')
    ) AS provider_4xx_24h,
    countIf(
        start_time >= now() - INTERVAL 24 HOUR
        AND is_final AND fallback_used
        AND response_status >= 200 AND response_status < 300
    ) AS fallback_saved_24h,
    countIf(
        start_time >= now() - INTERVAL 48 HOUR
        AND is_final
        AND response_status >= 200 AND response_status < 300
    ) AS successes_48h,
    countIf(
        start_time >= now() - INTERVAL 48 HOUR
        AND is_final
        AND response_status >= 500
    ) AS failures_5xx_48h,
    countIf(
        start_time >= now() - INTERVAL 48 HOUR
        AND is_final
        AND event_type = 'generate.image'
        AND response_status >= 400 AND response_status < 500
        AND startsWith(error_message, 'Image provider error:')
    ) AS provider_4xx_48h,
    countIf(
        start_time >= now() - INTERVAL 48 HOUR
        AND is_final AND fallback_used
        AND response_status >= 200 AND response_status < 300
    ) AS fallback_saved_48h
FROM generation_event_v2
WHERE environment = 'production'
  AND start_time >= now() - INTERVAL ${WINDOW_DAYS} DAY
GROUP BY model
ORDER BY model
FORMAT JSON`;

const sqlUrl = new URL("/v0/sql", TINYBIRD);
sqlUrl.searchParams.set("token", token);
sqlUrl.searchParams.set("q", sql);

const [catalogResponse, healthResponse] = await Promise.all([
    fetch(`${GEN}/models`),
    fetch(sqlUrl),
]);
if (!catalogResponse.ok) {
    throw new Error(`model catalog returned ${catalogResponse.status}`);
}
if (!healthResponse.ok) {
    throw new Error(
        `Tinybird returned ${healthResponse.status}: ${(
            await healthResponse.text()
        ).slice(0, 300)}`,
    );
}

const catalogPayload = await catalogResponse.json();
const catalog = Array.isArray(catalogPayload)
    ? catalogPayload
    : (catalogPayload.data ?? []);
const activeCommunityModels = new Map(
    catalog
        .filter(
            (model) =>
                model.community &&
                (model.category === "text" || model.category === "image"),
        )
        .map((model) => [model.name, model]),
);

const healthPayload = await healthResponse.json();

function healthWindow(row, suffix, hours) {
    const successes = Number(row[`successes_${suffix}`]);
    const failures5xx = Number(row[`failures_5xx_${suffix}`]);
    const provider4xx = Number(row[`provider_4xx_${suffix}`]);
    const eligibleRequests = successes + failures5xx + provider4xx;
    const successRate =
        eligibleRequests > 0 ? successes / eligibleRequests : null;
    return {
        hours,
        eligibleRequests,
        successes,
        failures5xx,
        provider4xx,
        fallbackSaved: Number(row[`fallback_saved_${suffix}`]),
        successRate,
        successPercent:
            successRate === null
                ? null
                : Number((successRate * 100).toFixed(2)),
    };
}

const models = healthPayload.data
    .filter((row) => activeCommunityModels.has(row.model))
    .map((row) => {
        const model = activeCommunityModels.get(row.model);
        const successes = Number(row.successes);
        const failures5xx = Number(row.failures_5xx);
        const provider4xx = Number(row.provider_4xx);
        const eligibleRequests = successes + failures5xx + provider4xx;
        const successRate =
            eligibleRequests > 0 ? successes / eligibleRequests : null;
        const health24h = healthWindow(row, "24h", 24);
        const health48h = healthWindow(row, "48h", 48);
        const currentHealth =
            health24h.eligibleRequests >= MIN_ELIGIBLE_REQUESTS
                ? health24h
                : health48h.eligibleRequests >= MIN_ELIGIBLE_REQUESTS
                  ? health48h
                  : null;
        return {
            model: row.model,
            category: model.category,
            totalFinalRequests: Number(row.total_final),
            eligibleRequests,
            successes,
            failures5xx,
            provider4xx,
            fallbackSaved: Number(row.fallback_saved),
            successRate,
            successPercent:
                successRate === null
                    ? null
                    : Number((successRate * 100).toFixed(2)),
            currentHealth,
        };
    })
    .sort((a, b) => (a.successRate ?? 1) - (b.successRate ?? 1));

const sevenDayCandidates = models.filter(
    (model) =>
        model.eligibleRequests >= MIN_ELIGIBLE_REQUESTS &&
        model.successRate < MIN_SUCCESS_RATE,
);
const candidates = sevenDayCandidates.filter(
    (model) =>
        model.currentHealth !== null &&
        model.currentHealth.successRate < MIN_CURRENT_SUCCESS_RATE,
);
const freshnessProtected = sevenDayCandidates.filter(
    (model) =>
        model.currentHealth !== null &&
        model.currentHealth.successRate >= MIN_CURRENT_SUCCESS_RATE,
);
const needsProbe = sevenDayCandidates.filter(
    (model) => model.currentHealth === null,
);
const output = {
    generatedAt: new Date().toISOString(),
    windowDays: WINDOW_DAYS,
    minimumEligibleRequests: MIN_ELIGIBLE_REQUESTS,
    minimumSuccessPercent: MIN_SUCCESS_RATE * 100,
    minimumCurrentSuccessPercent: MIN_CURRENT_SUCCESS_RATE * 100,
    activeCommunityModelCount: activeCommunityModels.size,
    candidates,
    freshnessProtected,
    needsProbe,
};

fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify(output));
