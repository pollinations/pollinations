/**
 * Wise transactions provider — fetches bank transactions from the Wise
 * Activities API, replacing the CSV import pipeline entirely.
 *
 * The Activities endpoint (`/v1/profiles/{pid}/activities`) returns all
 * completed transactions (card payments, transfers, direct debits, cashback)
 * with `since`/`until` date filtering. No SCA required.
 *
 * Each activity has:
 *   - title: counterparty name (HTML with <strong> tags)
 *   - primaryAmount: "1,234.56 EUR" or "100 USD" (display string)
 *   - secondaryAmount: EUR equivalent for non-EUR transactions
 *   - createdOn: ISO timestamp
 *   - status: COMPLETED / CANCELLED / REQUIRES_ATTENTION
 *   - type: TRANSFER / CARD_PAYMENT / DIRECT_DEBIT_TRANSACTION / BALANCE_CASHBACK / CARD_CHECK
 *
 * Returns rows in the same shape as parse-csv.mjs so the downstream
 * normalize → aggregate → forecast → layout pipeline works unchanged.
 */

/**
 * Fetch all completed activities for a date range.
 *
 * @param {string} since  — ISO date "YYYY-MM-DDT00:00:00.000Z"
 * @param {string} until  — ISO date (exclusive)
 * @returns {Promise<object[]>} raw Wise activity objects (status=COMPLETED only)
 */
async function fetchActivities(since, until) {
    const token = process.env.WISE_API_TOKEN;
    const pid = process.env.WISE_BUSINESS_PROFILE_ID;
    if (!token || !pid) {
        throw new Error(
            "WISE_API_TOKEN and WISE_BUSINESS_PROFILE_ID must be set in secrets/.env",
        );
    }

    const url = `https://api.wise.com/v1/profiles/${pid}/activities?size=100&since=${since}&until=${until}`;
    const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
        throw new Error(
            `Wise Activities API HTTP ${res.status}: ${await res.text()}`,
        );
    }
    const data = await res.json();
    const activities = data.activities ?? [];

    // Filter to completed only; skip CANCELLED, REQUIRES_ATTENTION, CARD_CHECK
    return activities.filter(
        (a) => a.status === "COMPLETED" && a.type !== "CARD_CHECK",
    );
}

/**
 * Parse a Wise display amount string like "1,234.56 EUR" or "+ 3,765.67 EUR"
 * into { value: number, currency: string }.
 */
function parseAmount(raw) {
    // Strip HTML tags (e.g. <positive>+ 35.62 EUR</positive>)
    const clean = raw.replace(/<[^>]+>/g, "").trim();
    const parts = clean.split(/\s+/);
    if (parts.length < 2) return { value: 0, currency: "EUR" };

    const currency = parts[parts.length - 1];
    // Join everything before currency, strip non-numeric except . and -
    const numStr = parts.slice(0, -1).join("").replace(/[+,]/g, "");
    return { value: Number(numStr) || 0, currency };
}

/**
 * Convert a Wise activity into a row compatible with parse-csv output.
 *
 * @param {object} activity — raw Wise activity object
 * @returns {{ counterparty: string, date: string, amount_eur: number }}
 */
function activityToRow(activity) {
    const counterparty = (activity.title ?? "").replace(/<[^>]+>/g, "").trim();
    const date = (activity.createdOn ?? "").slice(0, 10);

    const isPositive = (activity.primaryAmount ?? "").includes("positive");

    // Determine EUR amount:
    // - If primaryAmount is EUR → use it directly
    // - If primaryAmount is non-EUR → use secondaryAmount (EUR equivalent)
    const primary = parseAmount(activity.primaryAmount ?? "");
    const secondary = parseAmount(activity.secondaryAmount ?? "");

    let amountEur;
    if (primary.currency === "EUR") {
        amountEur = primary.value;
    } else if (secondary.value !== 0) {
        amountEur = secondary.value;
    } else {
        // Fallback: use primary even if not EUR (shouldn't happen for completed)
        amountEur = primary.value;
    }

    // Outgoing transactions are negative, incoming (positive tag) are positive
    if (!isPositive && amountEur > 0) {
        amountEur = -amountEur;
    }

    return { counterparty, date, amount_eur: Number(amountEur.toFixed(2)) };
}

/**
 * Fetch transactions for a given month from the Wise API.
 *
 * @param {string} month — "YYYY-MM"
 * @returns {Promise<Array<{ counterparty: string, date: string, amount_eur: number }>>}
 */
export async function fetchMonth(month) {
    const [year, mon] = month.split("-").map(Number);
    const since = `${month}-01T00:00:00.000Z`;

    // Calculate the first day of the next month
    const nextMonth =
        mon === 12
            ? `${year + 1}-01`
            : `${year}-${String(mon + 1).padStart(2, "0")}`;
    const until = `${nextMonth}-01T00:00:00.000Z`;

    const activities = await fetchActivities(since, until);
    return activities.map(activityToRow);
}

/**
 * Fetch transactions for a range of months.
 *
 * @param {string} startMonth — "YYYY-MM" (inclusive)
 * @param {string} endMonth   — "YYYY-MM" (inclusive)
 * @returns {Promise<Array<{ counterparty: string, date: string, amount_eur: number }>>}
 */
export async function fetchMonths(startMonth, endMonth) {
    const rows = [];
    let [year, mon] = startMonth.split("-").map(Number);
    const [endYear, endMon] = endMonth.split("-").map(Number);

    while (year < endYear || (year === endYear && mon <= endMon)) {
        const month = `${year}-${String(mon).padStart(2, "0")}`;
        const monthRows = await fetchMonth(month);
        rows.push(...monthRows);
        mon++;
        if (mon > 12) {
            mon = 1;
            year++;
        }
    }
    return rows;
}

/**
 * Fetch transactions for the current month up to today.
 *
 * @returns {Promise<Array<{ counterparty: string, date: string, amount_eur: number }>>}
 */
export async function fetchCurrentMonthToDate() {
    const now = new Date();
    const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    const since = `${month}-01T00:00:00.000Z`;
    // Until tomorrow to include today's transactions
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const until = tomorrow.toISOString().slice(0, 10) + "T00:00:00.000Z";

    const activities = await fetchActivities(since, until);
    return activities.map(activityToRow);
}
