import { z } from "zod";

const API_ROOT =
    "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/mts/mts_table_5";

// MTS table 5 is a line-item table (111,749 rows); the headline figures live
// on two summary lines identified by their stable line codes:
// 5694 "Total Surplus (+) or Deficit (-)" and 5691 "Total Outlays".
// The classification_desc eq filter cannot address the deficit line: the "+"
// in its name breaks the filter match, so the line code is used instead.
// The v2 path 404s for MTS — this table only exists under v1.
const DEFICIT_LINE = "5694";
const OUTLAYS_LINE = "5691";

// Amounts arrive as strings; missing ones arrive as the literal string
// "null" and must stay missing, never become zero.
function amount(value) {
    if (value === null || value === undefined || value === "null") return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
}

function projectDeficit(row) {
    return {
        record_date: row.record_date ?? null,
        deficit: amount(row.current_month_net_outly_amt),
        deficit_fiscal_ytd: amount(row.current_fytd_net_outly_amt),
        fiscal_year: row.record_fiscal_year ?? null,
    };
}

function projectOutlays(row) {
    return {
        gross_outlays: amount(row.current_month_gross_outly_amt),
        applicable_receipts: amount(row.current_month_app_rcpt_amt),
        net_outlays: amount(row.current_month_net_outly_amt),
        gross_outlays_fiscal_ytd: amount(row.current_fytd_gross_outly_amt),
        applicable_receipts_fiscal_ytd: amount(row.current_fytd_app_rcpt_amt),
        net_outlays_fiscal_ytd: amount(row.current_fytd_net_outly_amt),
    };
}

const EMPTY_OUTLAYS = {
    gross_outlays: null,
    applicable_receipts: null,
    net_outlays: null,
    gross_outlays_fiscal_ytd: null,
    applicable_receipts_fiscal_ytd: null,
    net_outlays_fiscal_ytd: null,
};

export const treasuryTools = [
    [
        "treasury_deficit",
        "Monthly U.S. federal budget deficit from the Treasury's Monthly Treasury Statement (MTS table 5): the latest months' surplus/deficit with gross outlays and applicable receipts. A negative deficit is a deficit; a positive value is a surplus. Applicable receipts are offsetting collections on the outlays side, not total federal receipts.",
        {
            limit: z
                .number()
                .int()
                .min(1)
                .max(10)
                .default(5)
                .describe(
                    "Maximum number of months to return, most recent first (1-10, default 5)",
                ),
        },
        async ({ limit }, fetchJson) => {
            const months =
                Number.isInteger(limit) && limit >= 1 && limit <= 10
                    ? limit
                    : 5;
            const base = `${API_ROOT}?sort=-record_date&page[size]=${months}`;
            const [deficitData, outlaysData] = await Promise.all([
                fetchJson(`${base}&filter=line_code_nbr:eq:${DEFICIT_LINE}`),
                fetchJson(`${base}&filter=line_code_nbr:eq:${OUTLAYS_LINE}`),
            ]);
            const deficitRows = Array.isArray(deficitData?.data)
                ? deficitData.data
                : null;
            const outlaysRows = Array.isArray(outlaysData?.data)
                ? outlaysData.data
                : null;
            if (!deficitRows)
                throw new Error("Treasury MTS response was not a record list.");
            const outlaysByDate = new Map(
                (outlaysRows || []).map((row) => [
                    row.record_date,
                    projectOutlays(row),
                ]),
            );
            const monthsList = deficitRows.slice(0, months).map((row) => ({
                ...projectDeficit(row),
                ...(outlaysByDate.get(row.record_date) || EMPTY_OUTLAYS),
            }));
            return {
                months: monthsList,
                total: monthsList.length,
                history_months: deficitData.meta?.["total-count"] ?? null,
            };
        },
    ],
];
