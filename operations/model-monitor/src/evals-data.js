// Reading side of the weekly model evals.
//
// The eval workflow commits its report to the `news` branch, and this module
// turns those files into what the Evals tab renders. Everything here is pure so
// it can be tested without a browser; the fetch lives at the bottom.

export const EVALS_BRANCH = "news";
export const EVALS_DIR = "operations/model-evals";
export const EVALS_REPO = "pollinations/pollinations";

export function evalsFileUrl(file) {
    return `https://raw.githubusercontent.com/${EVALS_REPO}/${EVALS_BRANCH}/${EVALS_DIR}/${file}`;
}

export function evalFileUrls() {
    return {
        latest: evalsFileUrl("latest.json"),
        history: evalsFileUrl("history.json"),
    };
}

function asRecord(value) {
    return value && typeof value === "object" ? value : null;
}

function asArray(value) {
    return Array.isArray(value) ? value : [];
}

function asNumber(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asString(value) {
    return typeof value === "string" ? value : "";
}

// A ranking row is kept only if it can be read: an unreadable row would show as
// a model with no score, which reads as a result rather than a broken file.
function normalizeRow(row) {
    const record = asRecord(row);
    if (!record) return null;
    const name = asString(record.name);
    const score = asNumber(record.score);
    if (!name || score === null) return null;
    const interval = asArray(record.interval);
    return {
        name,
        title: asString(record.title) || name,
        scope: record.scope === "community" ? "community" : "official",
        specialized: record.specialized === true,
        rank: asNumber(record.rank),
        score,
        correct: asNumber(record.correct) ?? 0,
        asked: asNumber(record.asked) ?? 0,
        planned: asNumber(record.planned) ?? asNumber(record.asked) ?? 0,
        scoreLower: asNumber(interval[0]) ?? score,
        scoreUpper: asNumber(interval[1]) ?? score,
        marginOfError: asNumber(record.marginOfError) ?? 0,
        formatted: asNumber(record.formatted) ?? 0,
        status: asString(record.status) || "scored",
        failures:
            (asNumber(record.failures) ?? 0) +
            (asNumber(record.timeouts) ?? 0) +
            (asNumber(record.rateLimited) ?? 0),
        costPollen: asNumber(record.costPollen) ?? 0,
        costKnown: record.costKnown !== false,
        avgLatencyMs: asNumber(record.avgLatencyMs) ?? 0,
    };
}

function normalizePair(pair) {
    const record = asRecord(pair);
    if (!record) return null;
    const official = asString(record.official);
    const community = asString(record.community);
    if (!official || !community) return null;
    return {
        official,
        community,
        match: asString(record.match) || "exact",
        officialScore: asNumber(record.officialScore) ?? 0,
        officialAsked: asNumber(record.officialAsked) ?? 0,
        communityScore: asNumber(record.communityScore) ?? 0,
        communityAsked: asNumber(record.communityAsked) ?? 0,
        gap: asNumber(record.gap) ?? 0,
        marginOfError: asNumber(record.marginOfError) ?? 0,
        exceedsMargin: record.exceedsMargin === true,
    };
}

function normalizeNotRun(row) {
    const record = asRecord(row);
    if (!record) return null;
    const name = asString(record.name);
    if (!name) return null;
    return { name, reason: asString(record.reason) || "not run" };
}

export function parseEvalReport(payload) {
    const record = asRecord(payload);
    if (!record) return null;
    const run = asRecord(record.run);
    const evalInfo = asRecord(record.eval);
    if (!run) return null;
    const ranking = asArray(record.ranking).map(normalizeRow).filter(Boolean);
    if (ranking.length === 0) return null;
    const askedQuestions = asNumber(run.askedQuestions) ?? 0;
    const correctTotal = ranking.reduce((total, row) => total + row.correct, 0);
    return {
        evalId: asString(evalInfo?.id) || asString(run.evalId) || "aiw",
        evalTitle: asString(evalInfo?.title) || "Model evals",
        evalVersion: asNumber(evalInfo?.version) ?? 1,
        evalSource: asString(evalInfo?.source),
        families: asArray(evalInfo?.families).map(asString).filter(Boolean),
        generatedAt: asString(run.generatedAt),
        startedAt: asString(run.startedAt),
        durationSec: asNumber(run.durationSec) ?? 0,
        seed: asNumber(run.seed) ?? 0,
        questionsPerFamily: asNumber(run.questionsPerFamily) ?? 0,
        questionsPerModel: asNumber(run.questionsPerModel) ?? 0,
        modelCount: asNumber(run.modelCount) ?? ranking.length,
        scoredModels: asNumber(run.scoredModels) ?? ranking.length,
        askedQuestions,
        correctTotal,
        costPollen: asNumber(run.costPollen) ?? 0,
        budgetPollen: asNumber(run.budgetPollen) ?? 0,
        costUnknownModels: asArray(record.costUnknownModels)
            .map(asString)
            .filter(Boolean),
        balanceBefore: asNumber(run.balanceBefore),
        balanceAfter: asNumber(run.balanceAfter),
        ranking,
        pairs: asArray(record.pairs).map(normalizePair).filter(Boolean),
        notRun: asArray(record.notRun).map(normalizeNotRun).filter(Boolean),
    };
}

export function parseEvalHistory(payload) {
    const record = asRecord(payload);
    if (!record) return null;
    const runs = asArray(record.runs)
        .map((entry) => {
            const row = asRecord(entry);
            if (!row) return null;
            const id = asString(row.id) || asString(row.startedAt);
            if (!id) return null;
            const ranking = asArray(row.ranking)
                .map(normalizeRow)
                .filter(Boolean);
            if (ranking.length === 0) return null;
            return {
                id,
                startedAt: asString(row.startedAt) || id,
                evalId: asString(row.evalId) || "aiw",
                costPollen: asNumber(row.costPollen) ?? 0,
                modelCount: asNumber(row.scoredModels) ?? ranking.length,
                askedQuestions: asNumber(row.askedQuestions) ?? 0,
                ranking,
            };
        })
        .filter(Boolean);
    return { updatedAt: asString(record.updatedAt), runs };
}

export function latestRunTop(history) {
    if (!history || history.runs.length === 0) return null;
    const leader = history.runs[0].ranking[0] ?? null;
    return leader ? { run: history.runs[0], leader } : null;
}

/**
 * Leaderboard order with each paired community clone placed directly under the
 * official model it copies. Unpaired rows keep their own order, so the table
 * still reads as one ranking.
 */
export function rankingWithPairs(report) {
    if (!report) return [];
    const byName = new Map(report.ranking.map((row) => [row.name, row]));
    const pairedCommunity = new Map(
        report.pairs.map((pair) => [pair.community, pair]),
    );
    const rows = [];
    const placed = new Set();
    for (const row of report.ranking) {
        if (pairedCommunity.has(row.name) && byName.has(row.name)) continue;
        rows.push({ row, indent: 0, pair: null });
        placed.add(row.name);
        const pair = report.pairs.find(
            (candidate) => candidate.official === row.name,
        );
        const community = pair ? byName.get(pair.community) : null;
        if (community && !placed.has(community.name)) {
            rows.push({ row: community, indent: 1, pair });
            placed.add(community.name);
        }
    }
    // A clone that was scored while its official counterpart was not still
    // belongs in the table.
    for (const pair of report.pairs) {
        const community = byName.get(pair.community);
        if (!community || placed.has(community.name)) continue;
        rows.push({ row: community, indent: 1, pair });
        placed.add(community.name);
    }
    return rows;
}

export function pairSeverity(pair) {
    if (!pair) return "neutral";
    if (!pair.exceedsMargin) return "neutral";
    return pair.gap < 0 ? "danger" : "success";
}

export function formatScore(score) {
    if (typeof score !== "number" || !Number.isFinite(score)) return "-";
    return `${(score * 100).toFixed(1)}%`;
}

export function formatMargin(margin) {
    if (typeof margin !== "number" || !Number.isFinite(margin)) return "";
    return `±${(margin * 100).toFixed(1)}%`;
}

export function formatGap(pair) {
    if (!pair) return "-";
    return formatSignedPercent(pair.gap);
}

export function formatSignedPercent(value) {
    if (typeof value !== "number" || !Number.isFinite(value)) return "-";
    const rounded = (value * 100).toFixed(1);
    return `${value > 0 ? "+" : ""}${rounded}%`;
}

export function formatCost(costPollen, costKnown = true) {
    if (!costKnown) return "unknown";
    if (typeof costPollen !== "number" || !Number.isFinite(costPollen))
        return "-";
    if (costPollen === 0) return "0";
    if (costPollen < 0.001) return costPollen.toFixed(6);
    return costPollen.toFixed(4);
}

export function formatWhen(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return `${date.toISOString().slice(0, 10)} ${date
        .toISOString()
        .slice(11, 16)} UTC`;
}

export function formatBalanceRun(report) {
    if (!report) return "-";
    const before = report.balanceBefore;
    const after = report.balanceAfter;
    if (before === null || after === null) return "-";
    return `${before.toFixed(3)} → ${after.toFixed(3)} pollen`;
}

function firstLine(message) {
    return typeof message === "string" ? message.split("\n")[0] : "";
}

/**
 * Reads the published report from the news branch. Missing files are reported as
 * an empty state rather than as an error, because the tab is expected to be
 * empty until the first weekly run lands.
 */
export async function fetchEvalsData(fetchImpl = fetch) {
    const urls = evalFileUrls();
    const [latestResult, historyResult] = await Promise.allSettled([
        fetchImpl(urls.latest, { cache: "no-store" }),
        fetchImpl(urls.history, { cache: "no-store" }),
    ]);
    let report = null;
    let history = null;
    let published = false;

    if (latestResult.status === "fulfilled" && latestResult.value.ok) {
        try {
            report = parseEvalReport(await latestResult.value.json());
            published = Boolean(report);
        } catch (error) {
            return {
                report: null,
                history: null,
                published: false,
                error: `Could not read the published report: ${firstLine(error?.message)}`,
            };
        }
    } else if (
        latestResult.status === "fulfilled" &&
        latestResult.value.status !== 404
    ) {
        return {
            report: null,
            history: null,
            published: false,
            error: `Could not read the published report (HTTP ${latestResult.value.status})`,
        };
    }

    if (historyResult.status === "fulfilled" && historyResult.value.ok) {
        try {
            history = parseEvalHistory(await historyResult.value.json());
        } catch {
            history = null;
        }
    }

    return { report, history, error: null, published };
}
