import { z } from "zod";
import { fetchJson } from "../fetch.js";

const API_ROOT =
    "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/avg_interest_rates";

// The API's default sort is ascending (oldest first), so sort=-record_date
// is load-bearing: without it the tool would return the oldest rates on file.
function formatRate(item) {
    return {
        record_date: item.record_date ?? null,
        security_type_desc: item.security_type_desc ?? null,
        security_desc: item.security_desc ?? null,
        avg_interest_rate_amt: item.avg_interest_rate_amt ?? null,
        record_fiscal_year: item.record_fiscal_year ?? null,
        record_fiscal_quarter: item.record_fiscal_quarter ?? null,
    };
}

export const treasuryRatesTools = [
    [
        "treasury_rates",
        "Latest average interest rates on U.S. Treasury securities (bills, notes, bonds) from the Fiscal Data API. Figures lag the current date by about two weeks.",
        {
            limit: z
                .number()
                .int()
                .min(1)
                .max(10)
                .default(5)
                .describe(
                    "Maximum number of rate records to return (1-10, default 5)",
                ),
        },
        async ({ limit }, fetchJsonImpl = fetchJson) => {
            const n =
                Number.isInteger(limit) && limit >= 1 && limit <= 10
                    ? limit
                    : 5;
            const url = `${API_ROOT}?sort=-record_date&page[size]=${n}`;
            const data = await fetchJsonImpl(url);
            const items = data?.data;
            if (!Array.isArray(items))
                throw new Error(
                    "Fiscal Data returned an unexpected response for average interest rates.",
                );
            return {
                total: data?.meta?.["total-count"] ?? items.length,
                rates: items.slice(0, n).map(formatRate),
            };
        },
    ],
];
