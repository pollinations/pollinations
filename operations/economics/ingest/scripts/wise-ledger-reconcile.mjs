import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const TINYBIRD_API = "https://api.europe-west2.gcp.tinybird.co";

const NEW_MERCHANT_RULES = new Map([
    ["api credit", { vendor: "perplexity", category: "cloud" }],
    ["openrouter", { vendor: "openrouter", category: "cloud" }],
    ["openai chatgpt", { vendor: "openai", category: "saas" }],
    ["lambda", { vendor: "lambda", category: "cloud" }],
    [
        "google workspace mycel",
        { vendor: "google-workspace", category: "saas" },
    ],
]);

function requiredEnvironment(name) {
    const value = process.env[name];
    if (!value) throw new Error(`Missing ${name}`);
    return value;
}

async function fetchJson(url, options = {}) {
    const response = await fetch(url, options);
    if (!response.ok) {
        throw new Error(`${new URL(url).pathname}: HTTP ${response.status}`);
    }
    return response.json();
}

export function stripHtml(value) {
    let text = "";
    let insideTag = false;
    for (const character of String(value ?? "")) {
        if (character === "<") {
            insideTag = true;
            continue;
        }
        if (character === ">") {
            insideTag = false;
            continue;
        }
        if (!insideTag) text += character;
    }
    return text;
}

export function normalizedMerchant(value) {
    return stripHtml(value).trim().toLowerCase().replace(/\s+/g, " ");
}

export function parseDisplayAmount(value) {
    const raw = String(value ?? "");
    const parts = stripHtml(raw).trim().split(/\s+/);
    if (parts.length < 2) return null;
    const currency = parts.at(-1);
    const amount = Number(parts.slice(0, -1).join("").replace(/[+,]/g, ""));
    if (!Number.isFinite(amount)) return null;
    const positive = raw.includes("positive") || /^\s*\+/.test(stripHtml(raw));
    return { amount: (positive ? 1 : -1) * Math.abs(amount), currency };
}

export function wiseEntryId(activity) {
    const type = activity?.resource?.type;
    const id = activity?.resource?.id;
    return type && id ? `${type}-${id}` : null;
}

export function coveredWiseEntryIds(transactions) {
    const covered = new Set(transactions.map((row) => row.entry_id));
    for (const row of transactions) {
        const split = String(row.entry_id).match(
            /^((?:TRANSFER|CARD_TRANSACTION|DIRECT_DEBIT_TRANSACTION)-\d+)-(?:\d+|EUR|USD|GBP|CAD)$/,
        );
        if (split) covered.add(split[1]);
    }
    return covered;
}

export function parseWiseStatementCsv(contents) {
    const records = [];
    let record = [];
    let field = "";
    let quoted = false;
    for (let index = 0; index < contents.length; index += 1) {
        const character = contents[index];
        if (character === '"') {
            if (quoted && contents[index + 1] === '"') {
                field += '"';
                index += 1;
            } else {
                quoted = !quoted;
            }
        } else if (character === "," && !quoted) {
            record.push(field);
            field = "";
        } else if ((character === "\n" || character === "\r") && !quoted) {
            if (character === "\r" && contents[index + 1] === "\n") index += 1;
            record.push(field);
            if (record.some((value) => value !== "")) records.push(record);
            record = [];
            field = "";
        } else {
            field += character;
        }
    }
    if (field || record.length) {
        record.push(field);
        records.push(record);
    }
    const [headers, ...rows] = records;
    if (!headers?.includes("TransferWise ID")) {
        throw new Error("Wise statement CSV is missing TransferWise ID");
    }
    return rows.map((row) =>
        Object.fromEntries(
            headers.map((header, index) => [header, row[index] ?? ""]),
        ),
    );
}

function isoStatementDate(value) {
    const match = String(value).match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if (!match) throw new Error(`Invalid Wise statement date: ${value}`);
    return `${match[3]}-${match[2]}-${match[1]}`;
}

function normalizedStatementId(value) {
    const id = String(value ?? "").trim();
    if (id.startsWith("CARD-")) {
        return `CARD_TRANSACTION-${id.slice("CARD-".length)}`;
    }
    if (id.startsWith("DIRECT_DEBIT-")) {
        return `DIRECT_DEBIT_TRANSACTION-${id.slice("DIRECT_DEBIT-".length)}`;
    }
    return id;
}

function statementActivityId(row, activities) {
    const rawId = String(row["TransferWise ID"] ?? "").trim();
    if (!rawId.startsWith("BALANCE_CASHBACK-")) {
        return normalizedStatementId(rawId);
    }
    const amount = Number(row.Amount);
    const currency = String(row.Currency).trim();
    const date = isoStatementDate(row.Date);
    const candidates = activities.filter((activity) => {
        if (activity?.resource?.type !== "BALANCE_CASHBACK") return false;
        const settled = defaultSettledAmount(activity);
        return (
            settled?.currency === currency &&
            Math.abs(settled.amount - amount) <= 0.0000001 &&
            [activity.createdOn, activity.updatedOn].some(
                (timestamp) => String(timestamp ?? "").slice(0, 10) === date,
            )
        );
    });
    return candidates.length === 1 ? wiseEntryId(candidates[0]) : null;
}

export function buildStatementSettlements(rows, activities) {
    const grouped = new Map();
    const unresolved = [];
    for (const row of rows) {
        const rawId = String(row["TransferWise ID"] ?? "").trim();
        if (!rawId || rawId.startsWith("BALANCE-")) continue;
        const fee = rawId.startsWith("FEE-");
        const sourceRow = fee
            ? { ...row, "TransferWise ID": rawId.slice("FEE-".length) }
            : row;
        const entryId = statementActivityId(sourceRow, activities);
        const amount = Number(row.Amount);
        const currency = String(row.Currency ?? "").trim();
        if (!entryId || !Number.isFinite(amount) || !currency) {
            unresolved.push(rawId);
            continue;
        }
        const date = isoStatementDate(row.Date);
        const key = `${entryId}\u0000${currency}`;
        const existing = grouped.get(key) ?? {
            entryId,
            date,
            amount: 0,
            currency,
        };
        if (existing.date !== date) {
            throw new Error(`${entryId} has statement rows on multiple dates`);
        }
        existing.amount += amount;
        grouped.set(key, existing);
    }

    const byEntryId = new Map();
    for (const settlement of grouped.values()) {
        if (Math.abs(settlement.amount) <= 0.000000001) continue;
        const rowsForId = byEntryId.get(settlement.entryId) ?? [];
        rowsForId.push(settlement);
        byEntryId.set(settlement.entryId, rowsForId);
    }
    for (const settlements of byEntryId.values()) {
        settlements.sort((left, right) =>
            left.currency.localeCompare(right.currency),
        );
        if (settlements.length > 1) {
            for (const settlement of settlements) {
                settlement.outputEntryId = `${settlement.entryId}-${settlement.currency}`;
            }
        } else {
            settlements[0].outputEntryId = settlements[0].entryId;
        }
    }
    return { byEntryId, unresolved };
}

async function readStatements(directory) {
    const paths = (await readdir(directory))
        .filter((name) => name.toLowerCase().endsWith(".csv"))
        .sort()
        .map((name) => join(directory, name));
    if (paths.length === 0)
        throw new Error("Statement directory has no CSV files");
    const rows = [];
    for (const path of paths)
        rows.push(...parseWiseStatementCsv(await readFile(path, "utf8")));
    return { paths, rows };
}

function candidateAmount(activity, field) {
    return parseDisplayAmount(
        field === "primary" ? activity.primaryAmount : activity.secondaryAmount,
    );
}

export function defaultSettledAmount(activity) {
    const primary = candidateAmount(activity, "primary");
    const secondary = candidateAmount(activity, "secondary");
    if (!primary) return null;
    if (primary.currency === "EUR") return primary;
    return secondary && Math.abs(secondary.amount) > 0 ? secondary : primary;
}

export function buildMerchantHistory(activities, transactions) {
    const transactionById = new Map(
        transactions.map((row) => [row.entry_id, row]),
    );
    const history = new Map();
    for (const activity of activities) {
        if (activity.status !== "COMPLETED" || activity.type === "CARD_CHECK") {
            continue;
        }
        const transaction = transactionById.get(wiseEntryId(activity));
        if (!transaction) continue;
        const merchant = normalizedMerchant(activity.title);
        const profile = history.get(merchant) ?? {
            classifications: new Set(),
        };
        profile.classifications.add(
            `${transaction.vendor}\u0000${transaction.category}`,
        );
        history.set(merchant, profile);
    }
    return history;
}

function learnedValue(values) {
    return values?.size === 1 ? [...values][0] : null;
}

export function transactionProposal(
    activity,
    history,
    recordedAt,
    evidence,
    settlement,
) {
    const entryId = wiseEntryId(activity);
    const merchant = normalizedMerchant(activity.title);
    const profile = history.get(merchant);
    const learnedClassification = learnedValue(profile?.classifications);
    const explicitClassification = NEW_MERCHANT_RULES.get(merchant);
    const classification = learnedClassification
        ? (() => {
              const [vendor, category] = learnedClassification.split("\u0000");
              return { vendor, category };
          })()
        : explicitClassification;
    const issues = [];
    if (!entryId) issues.push("missing Wise resource ID");
    if (!classification) issues.push("unmapped merchant");
    if (profile?.classifications.size > 1) {
        issues.push("ambiguous historical classification");
    }
    if (!settlement) issues.push("missing balance-statement settlement");
    if (issues.length) {
        return {
            review: {
                date: String(activity.createdOn ?? "").slice(0, 10),
                merchant: stripHtml(activity.title).trim(),
                issues,
            },
        };
    }

    return {
        row: {
            entry_id: settlement.outputEntryId,
            kind: "transaction",
            source: "wise",
            date: settlement.date,
            vendor: classification.vendor,
            category: classification.category,
            amount: settlement.amount,
            currency: settlement.currency,
            description: stripHtml(activity.title).trim(),
            evidence,
            recorded_at: recordedAt,
        },
    };
}

async function fetchActivities({ profileId, token, since, until }) {
    const activities = [];
    let cursor = "";
    let pages = 0;
    do {
        const url = new URL(
            `https://api.wise.com/v1/profiles/${profileId}/activities`,
        );
        url.searchParams.set("since", since);
        url.searchParams.set("until", until);
        url.searchParams.set("size", "100");
        if (cursor) url.searchParams.set("nextCursor", cursor);
        const body = await fetchJson(url, {
            headers: { Authorization: `Bearer ${token}` },
        });
        activities.push(...(body.activities ?? []));
        cursor = body.cursor || body.nextCursor || "";
        pages += 1;
        if (pages >= 100 && cursor) {
            throw new Error("Wise pagination exceeded 100 pages");
        }
    } while (cursor);
    return { activities, pages };
}

async function tinybirdRows(pipe, token) {
    const body = await fetchJson(`${TINYBIRD_API}/v0/pipes/${pipe}.json`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!Array.isArray(body.data)) throw new Error(`${pipe}: no data array`);
    return body.data;
}

function ndjson(rows) {
    return `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`;
}

async function main() {
    const { values } = parseArgs({
        options: {
            from: { type: "string" },
            until: { type: "string" },
            archive: { type: "string" },
            "statement-dir": { type: "string" },
            transactions: { type: "string" },
        },
    });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(values.from ?? "")) {
        throw new Error("--from must use YYYY-MM-DD");
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(values.until ?? "")) {
        throw new Error("--until must use YYYY-MM-DD and is exclusive");
    }
    if (!values.archive || !values.transactions || !values["statement-dir"]) {
        throw new Error(
            "--archive, --statement-dir, and --transactions are required",
        );
    }
    if (values.from >= values.until)
        throw new Error("--from must precede --until");

    const token = requiredEnvironment("WISE_API_TOKEN");
    const profileId = requiredEnvironment("WISE_BUSINESS_PROFILE_ID");
    const tinybirdToken = requiredEnvironment("TINYBIRD_ECONOMICS_READ_TOKEN");
    const since = `${values.from}T00:00:00.000Z`;
    const until = `${values.until}T00:00:00.000Z`;
    const recordedAt = new Date()
        .toISOString()
        .replace("T", " ")
        .replace("Z", "");
    const archivePath = resolve(values.archive);
    const statements = await readStatements(resolve(values["statement-dir"]));
    const evidence = `Wise statement CSV: ${statements.paths.join(", ")}`;

    const [period, historyActivities, transactions] = await Promise.all([
        fetchActivities({ profileId, token, since, until }),
        fetchActivities({
            profileId,
            token,
            since: "2026-01-01T00:00:00.000Z",
            until: since,
        }),
        tinybirdRows("op_transactions_api", tinybirdToken),
    ]);

    const existingIds = coveredWiseEntryIds(transactions);
    const settlementFacts = buildStatementSettlements(
        statements.rows,
        period.activities,
    );
    const history = buildMerchantHistory(
        historyActivities.activities,
        transactions,
    );
    const proposals = [];
    const review = [];
    const consumedSettlementIds = new Set();
    for (const activity of period.activities) {
        if (activity.status !== "COMPLETED" || activity.type === "CARD_CHECK") {
            continue;
        }
        const entryId = wiseEntryId(activity);
        if (existingIds.has(entryId)) continue;
        const settlements = settlementFacts.byEntryId.get(entryId) ?? [];
        consumedSettlementIds.add(entryId);
        if (settlements.length === 0) {
            const proposal = transactionProposal(
                activity,
                history,
                recordedAt,
                evidence,
                undefined,
            );
            if (proposal.review) review.push(proposal.review);
            continue;
        }
        for (const settlement of settlements) {
            const proposal = transactionProposal(
                activity,
                history,
                recordedAt,
                evidence,
                settlement,
            );
            if (proposal.row) proposals.push(proposal.row);
            if (proposal.review) review.push(proposal.review);
        }
    }
    for (const [entryId, settlements] of settlementFacts.byEntryId) {
        if (existingIds.has(entryId) || consumedSettlementIds.has(entryId)) {
            continue;
        }
        review.push({
            date: settlements[0]?.date ?? "",
            merchant: entryId,
            issues: ["statement movement has no matching Wise activity"],
        });
    }
    for (const entryId of settlementFacts.unresolved) {
        review.push({
            date: "",
            merchant: entryId,
            issues: ["statement movement could not be resolved"],
        });
    }
    const archive = {
        collected_at: new Date().toISOString(),
        interval: { since, until },
        pages: period.pages,
        statement_files: statements.paths,
        activities: period.activities,
    };
    await writeFile(archivePath, `${JSON.stringify(archive, null, 2)}\n`);
    if (review.length) {
        console.error(JSON.stringify({ review }, null, 2));
        throw new Error(
            `Wise activities require manual classification; raw archive saved to ${archivePath}`,
        );
    }

    await writeFile(resolve(values.transactions), ndjson(proposals));
    console.log(
        JSON.stringify({
            activity_pages: period.pages,
            completed_transactions: proposals.length,
            review_items: 0,
        }),
    );
}

if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(process.argv[1]).href
) {
    await main();
}
