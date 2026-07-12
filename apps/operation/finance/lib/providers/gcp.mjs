import { spawn } from "node:child_process";
import { mkdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * GCP provider — fetches MTD spend from the BigQuery billing export table.
 *
 * GCP, unlike AWS/Azure, has NO cost-and-usage CLI surface. The `gcloud billing`
 * commands only expose account structure (accounts, projects, links), not
 * dollar amounts. The only programmatic source for cost data is the
 * BigQuery billing export — see
 * .claude/skills/provider-billing/providers/gcp.md for setup.
 *
 * Our billing account `0180E5-574541-B8F8FD` has currencyCode: EUR (verified
 * 2026-04-12 via `cloudbilling.googleapis.com/v1/billingAccounts/...`). All
 * `cost` values in the BigQuery export table are already in EUR for this
 * account. We store them in `mtd_*_usd` fields to keep field names consistent
 * with other providers, but the values are EUR — the layout layer will NOT
 * apply the USD→EUR FX conversion to GCP rows, because there's nothing to
 * convert.
 *
 * Field model (matches other payg providers):
 *   - mtd_total_usd    = SUM(cost)                           (list price, gross)
 *   - mtd_credit_usd   = -SUM(credits.amount)                (credits are stored
 *                         as negative numbers — flip sign so this is a positive
 *                         "money not paid" number, consistent with Alibaba)
 *   - mtd_cash_usd     = SUM(cost) + SUM(credits.amount)     (net, post-credit)
 *   - records          = row count in the aggregated result
 *
 * Sets pool.mtd_stale = true if the BigQuery export table has no data for the
 * current month — a common silent failure mode when billing export breaks or
 * gets re-linked. The wrapper still returns a valid shape (zeros), the layout
 * can choose to display the stale flag however it wants.
 *
 * Does NOT set current_balance_usd — GCP has no credit pool concept.
 */

const PROJECT = "stellar-verve-465920-b7";
const BILLING_ACCOUNT = "0180E5_574541_B8F8FD";
const TABLE = `${PROJECT}.billing_export.gcp_billing_export_resource_v1_${BILLING_ACCOUNT}`;
const SA_KEY = new URL("../../secrets/gcp-sa-key.json", import.meta.url)
    .pathname;
const CLOUDSDK_CONFIG_DIR = join(tmpdir(), "pollinations-finance-gcloud");

let serviceAccountReadyPromise = null;

function buildCliEnv() {
    const env = { ...process.env };
    try {
        if (statSync(SA_KEY).isFile()) {
            env.CLOUDSDK_CONFIG = CLOUDSDK_CONFIG_DIR;
            env.GOOGLE_APPLICATION_CREDENTIALS = SA_KEY;
        }
    } catch {}
    return env;
}

function runCli(command, args, env) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            stdio: ["ignore", "pipe", "pipe"],
            env,
        });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (d) => {
            stdout += d;
        });
        child.stderr.on("data", (d) => {
            stderr += d;
        });
        child.on("error", reject);
        child.on("close", (code) => {
            if (code !== 0) {
                reject(
                    new Error(
                        `${command} ${args[0] ?? ""} failed (${code}): ${stderr}`,
                    ),
                );
                return;
            }
            resolve(stdout);
        });
    });
}

async function ensureServiceAccountAuth(env) {
    if (!env.GOOGLE_APPLICATION_CREDENTIALS) return;
    if (!serviceAccountReadyPromise) {
        mkdirSync(env.CLOUDSDK_CONFIG, { recursive: true });
        // `bq` still expects an active gcloud account in headless runs, even
        // when GOOGLE_APPLICATION_CREDENTIALS points at a valid key file.
        serviceAccountReadyPromise = runCli(
            "gcloud",
            [
                "auth",
                "activate-service-account",
                `--key-file=${SA_KEY}`,
                `--project=${PROJECT}`,
            ],
            env,
        ).catch((error) => {
            serviceAccountReadyPromise = null;
            throw error;
        });
    }
    await serviceAccountReadyPromise;
}

async function bqQuery(sql) {
    const args = [
        "query",
        "--use_legacy_sql=false",
        "--format=json",
        "--quiet",
        `--project_id=${PROJECT}`,
        sql,
    ];
    const env = buildCliEnv();

    await ensureServiceAccountAuth(env);
    const stdout = await runCli("bq", args, env);

    try {
        return JSON.parse(stdout || "[]");
    } catch (e) {
        throw new Error(`bq returned invalid JSON: ${e.message}`);
    }
}

/**
 * @param {string} currentMonth  "YYYY-MM"
 * @param {object} pool           vendors.json._pools.GCP (mutated)
 */
export async function fetchMtd(currentMonth, pool) {
    const startPartition = `${currentMonth}-01`;

    // Two queries in one round trip: the MTD aggregate and the table
    // freshness signal (max usage date). We need freshness because BigQuery
    // billing export silently stops writing when billing-account linkage
    // changes; we want to detect that and flag mtd_stale=true.
    const sql = `
WITH mtd AS (
  SELECT
    ROUND(SUM(cost), 2) AS list_cost,
    ROUND(SUM(IFNULL((SELECT SUM(c.amount) FROM UNNEST(credits) c), 0)), 2) AS credits_applied,
    ROUND(SUM(cost) + SUM(IFNULL((SELECT SUM(c.amount) FROM UNNEST(credits) c), 0)), 2) AS net_cost,
    COUNT(*) AS record_count
  FROM \`${TABLE}\`
  WHERE DATE(usage_start_time) >= '${startPartition}'
),
latest AS (
  SELECT MAX(DATE(usage_start_time)) AS max_usage_date
  FROM \`${TABLE}\`
)
SELECT
  mtd.list_cost,
  mtd.credits_applied,
  mtd.net_cost,
  mtd.record_count,
  latest.max_usage_date
FROM mtd, latest
`.trim();

    const rows = await bqQuery(sql);
    const row = rows?.[0] ?? {};

    const listCost = Number(row.list_cost ?? 0) || 0;
    const creditsApplied = Number(row.credits_applied ?? 0) || 0;
    const netCost = Number(row.net_cost ?? 0) || 0;
    const recordCount = Number(row.record_count ?? 0) || 0;
    const maxUsageDate = row.max_usage_date ?? null;

    // Credits in the BigQuery table are stored as NEGATIVE numbers. We want
    // mtd_credit_usd to be a positive "amount absorbed by credits" figure,
    // consistent with how Alibaba stores it, so flip the sign.
    const mtdCredit = -creditsApplied;
    const mtdCash = netCost;
    const mtdTotal = listCost;

    // Freshness check: is the latest usage date in the table from the
    // current month? If not, the export pipeline is broken / stale.
    const stale = !maxUsageDate || !maxUsageDate.startsWith(currentMonth);

    pool.mtd_total_usd = Number(mtdTotal.toFixed(2));
    pool.mtd_credit_usd = Number(mtdCredit.toFixed(2));
    pool.mtd_cash_usd = Number(mtdCash.toFixed(2));
    pool.mtd_stale = stale;
    pool.mtd_data_as_of = maxUsageDate;
    // Our billing account's currency is EUR — these values are NOT USD
    // despite the field name. The layout must not apply USD→EUR FX.
    pool.native_currency = "EUR";
    pool.as_of = new Date().toISOString().slice(0, 10);

    return {
        mtd_total_usd: pool.mtd_total_usd,
        mtd_credit_usd: pool.mtd_credit_usd,
        mtd_cash_usd: pool.mtd_cash_usd,
        records: recordCount,
        as_of: pool.as_of,
        live_balance: true,
        stale,
        data_as_of: maxUsageDate,
    };
}
