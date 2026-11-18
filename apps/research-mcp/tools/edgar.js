// SEC EDGAR company submissions lookup. One fetch per call; the CIK must be
// given directly — name/ticker resolution would need the 13 MB tickers file,
// which this tool does not fetch. The SEC requires a descriptive User-Agent
// with a contact address; the shared fetch layer sends
// Pollinations-Research/0.1 (hello@pollinations.ai) on every call.
import { z } from "zod";
import { fetchJson } from "../fetch.js";

const API_ROOT = "https://data.sec.gov/submissions";
const MAX_FILINGS = 10;

function normalizeCik(cik) {
    const trimmed = String(cik).trim();
    if (!/^\d{1,10}$/.test(trimmed))
        throw new Error(
            "Provide a CIK: 1 to 10 digits, for example 320193 for Apple. Names and tickers are not accepted.",
        );
    return trimmed.padStart(10, "0");
}

function filingSummary(recent, index) {
    return {
        form: recent.form?.[index] ?? null,
        filing_date: recent.filingDate?.[index] ?? null,
        report_date: recent.reportDate?.[index] ?? null,
        accession_number: recent.accessionNumber?.[index] ?? null,
        primary_document: recent.primaryDocument?.[index] ?? null,
    };
}

export const edgarTools = [
    [
        "edgar_company",
        "Look up a US public company in the SEC EDGAR submissions file by CIK (Central Index Key, 1 to 10 digits, for example 320193 for Apple): company name, tickers, exchanges, and its most recent filings. CIK only — no name or ticker search, and the submissions file is about 164 KB per call, so only the latest filings are returned.",
        {
            cik: z
                .string()
                .min(1)
                .max(10)
                .regex(/^\d+$/)
                .describe(
                    "The company's CIK, 1 to 10 digits (320193 for Apple). It is zero-padded to 10 digits; names and tickers are not accepted.",
                ),
            limit: z
                .number()
                .int()
                .min(1)
                .max(MAX_FILINGS)
                .default(5)
                .describe("Maximum number of recent filings to return."),
        },
        async ({ cik, limit }) => {
            const padded = normalizeCik(cik);
            const max = limit ?? 5;
            if (!Number.isInteger(max) || max < 1 || max > MAX_FILINGS)
                throw new Error(
                    `limit must be an integer between 1 and ${MAX_FILINGS}.`,
                );
            let data;
            try {
                data = await fetchJson(`${API_ROOT}/CIK${padded}.json`);
            } catch (error) {
                if (/HTTP 404/.test(error.message))
                    throw new Error(
                        `No SEC EDGAR company found for CIK ${padded}. Check the CIK — names and tickers are not accepted.`,
                    );
                throw error;
            }
            if (typeof data?.name !== "string" || !data.name)
                throw new Error(
                    `SEC EDGAR returned a record for CIK ${padded} without a company name.`,
                );
            const recent = data.filings?.recent ?? {};
            const count = Array.isArray(recent.form) ? recent.form.length : 0;
            const filings = [];
            for (let i = 0; i < Math.min(max, count); i++)
                filings.push(filingSummary(recent, i));
            return {
                cik: padded,
                name: data.name,
                tickers: data.tickers ?? [],
                exchanges: data.exchanges ?? [],
                sic: data.sic ?? null,
                sic_description: data.sicDescription ?? null,
                state_of_incorporation: data.stateOfIncorporation ?? null,
                ein: data.ein ?? null,
                website: data.website ?? null,
                total_recent_filings: count,
                recent_filings: filings,
            };
        },
    ],
];
