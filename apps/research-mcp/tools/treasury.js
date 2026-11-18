// US federal debt via the Treasury Fiscal Data API (debt to the penny).
// No key. Figures lag the present by about two business days, and there
// is no record for weekends or holidays, so the default call returns the
// latest published record rather than today's date.
import { z } from "zod";

const API_ROOT =
    "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/debt_to_penny";

function isCalendarDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day
    );
}

function toDebt(record) {
    const total = Number(record?.tot_pub_debt_out_amt);
    if (!record?.record_date || !Number.isFinite(total))
        throw new Error("Treasury API returned a debt record without a total.");
    return {
        record_date: record.record_date,
        total_debt_usd: total,
        debt_held_by_public_usd: Number(record.debt_held_public_amt) || null,
        intragovernmental_holdings_usd:
            Number(record.intragov_hold_amt) || null,
        fiscal_year: record.record_fiscal_year ?? null,
    };
}

export const treasuryTools = [
    [
        "us_debt",
        "Total US federal debt outstanding from the Treasury's debt-to-the-penny figures, with the split between debt held by the public and intragovernmental holdings. No date returns the latest published record; an optional date returns that day's record. Figures lag the present by about two business days and there is no record for weekends or holidays. Amounts are US dollars. No key.",
        {
            date: z
                .string()
                .regex(/^\d{4}-\d{2}-\d{2}$/)
                .optional()
                .describe(
                    "Record date as YYYY-MM-DD, for example 2026-11-13. Omit for the latest published record.",
                ),
        },
        async ({ date }, fetchJson) => {
            // The API answers HTTP 200 with an empty list for unknown or
            // not-yet-published dates, and its default order is oldest
            // first, so the latest record needs an explicit descending sort.
            let url;
            if (date === undefined) {
                url = `${API_ROOT}?sort=-record_date&page[size]=1`;
            } else {
                if (!isCalendarDate(date))
                    throw new Error(
                        "date must be a real calendar date, YYYY-MM-DD.",
                    );
                url = `${API_ROOT}?filter=record_date:eq:${date}&page[size]=1`;
            }
            const data = await fetchJson(url);
            const records = Array.isArray(data?.data) ? data.data : [];
            if (records.length === 0)
                throw new Error(
                    date === undefined
                        ? "Treasury API returned no debt records."
                        : `No US debt record for ${date}. Figures lag the present by about two business days, and weekends and holidays have no record.`,
                );
            return toDebt(records[0]);
        },
    ],
];
