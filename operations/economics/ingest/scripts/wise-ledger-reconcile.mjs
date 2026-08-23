import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
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
            amountFields: new Set(),
        };
        profile.classifications.add(
            `${transaction.vendor}\u0000${transaction.category}`,
        );
        const matchesTransaction = (candidate) =>
            candidate?.currency === transaction.currency &&
            Math.abs(candidate.amount - Number(transaction.amount)) <= 0.02;
        if (matchesTransaction(defaultSettledAmount(activity))) {
            profile.amountFields.add("default");
        } else {
            for (const field of ["primary", "secondary"]) {
                const candidate = candidateAmount(activity, field);
                if (matchesTransaction(candidate)) {
                    profile.amountFields.add(field);
                }
            }
        }
        history.set(merchant, profile);
    }
    return history;
}

function learnedValue(values) {
    return values?.size === 1 ? [...values][0] : null;
}

export function transactionProposal(activity, history, recordedAt, evidence) {
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
    const learnedAmountField = learnedValue(profile?.amountFields);
    const settled = learnedAmountField
        ? learnedAmountField === "default"
            ? defaultSettledAmount(activity)
            : candidateAmount(activity, learnedAmountField)
        : defaultSettledAmount(activity);

    const issues = [];
    if (!entryId) issues.push("missing Wise resource ID");
    if (!classification) issues.push("unmapped merchant");
    if (profile?.classifications.size > 1) {
        issues.push("ambiguous historical classification");
    }
    if (profile?.amountFields.size > 1) {
        issues.push("ambiguous historical amount field");
    }
    if (!settled) issues.push("missing settled amount");
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
            entry_id: entryId,
            source: "wise",
            date: String(activity.createdOn).slice(0, 10),
            vendor: classification.vendor,
            category: classification.category,
            amount: settled.amount,
            currency: settled.currency,
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

function currentBalanceRows(balances, date, recordedAt, evidence) {
    return balances.map((balance) => ({
        entry_id: `wise-current-balance-${String(balance.currency).toLowerCase()}`,
        kind: "current_balance",
        date,
        vendor: "wise",
        category: "cash",
        amount: Number(balance.cashAmount?.value ?? balance.amount?.value ?? 0),
        currency: balance.currency || balance.amount?.currency,
        source: "wise",
        evidence,
        recorded_at: recordedAt,
    }));
}

async function main() {
    const { values } = parseArgs({
        options: {
            from: { type: "string" },
            until: { type: "string" },
            archive: { type: "string" },
            transactions: { type: "string" },
            runway: { type: "string" },
        },
    });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(values.from ?? "")) {
        throw new Error("--from must use YYYY-MM-DD");
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(values.until ?? "")) {
        throw new Error("--until must use YYYY-MM-DD and is exclusive");
    }
    if (!values.archive || !values.transactions || !values.runway) {
        throw new Error("--archive, --transactions, and --runway are required");
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
    const snapshotDate = new Date().toISOString().slice(0, 10);
    const archivePath = resolve(values.archive);
    const evidence = `Wise API archive: ${archivePath}`;

    const [period, historyActivities, balances, transactions] =
        await Promise.all([
            fetchActivities({ profileId, token, since, until }),
            fetchActivities({
                profileId,
                token,
                since: "2026-01-01T00:00:00.000Z",
                until: since,
            }),
            fetchJson(
                `https://api.wise.com/v4/profiles/${profileId}/balances?types=STANDARD`,
                { headers: { Authorization: `Bearer ${token}` } },
            ),
            tinybirdRows("op_transactions_api", tinybirdToken),
        ]);

    const existingIds = coveredWiseEntryIds(transactions);
    const history = buildMerchantHistory(
        historyActivities.activities,
        transactions,
    );
    const proposals = [];
    const review = [];
    for (const activity of period.activities) {
        if (activity.status !== "COMPLETED" || activity.type === "CARD_CHECK") {
            continue;
        }
        if (existingIds.has(wiseEntryId(activity))) continue;
        const proposal = transactionProposal(
            activity,
            history,
            recordedAt,
            evidence,
        );
        if (proposal.row) proposals.push(proposal.row);
        if (proposal.review) review.push(proposal.review);
    }
    const archive = {
        collected_at: new Date().toISOString(),
        interval: { since, until },
        pages: period.pages,
        activities: period.activities,
        balances,
    };
    await writeFile(archivePath, `${JSON.stringify(archive, null, 2)}\n`);
    if (review.length) {
        console.error(JSON.stringify({ review }, null, 2));
        throw new Error(
            `Wise activities require manual classification; raw archive saved to ${archivePath}`,
        );
    }

    const balanceRows = currentBalanceRows(
        balances,
        snapshotDate,
        recordedAt,
        evidence,
    );
    await Promise.all([
        writeFile(resolve(values.transactions), ndjson(proposals)),
        writeFile(resolve(values.runway), ndjson(balanceRows)),
    ]);
    console.log(
        JSON.stringify({
            activity_pages: period.pages,
            completed_transactions: proposals.length,
            current_balance_currencies: balanceRows
                .map((row) => row.currency)
                .sort(),
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
