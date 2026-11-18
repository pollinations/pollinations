import { z } from "zod";

const API_ROOT = "https://api.fdic.gov/banks/institutions";
const FIELDS = "NAME,CERT,ACTIVE,STNAME";

function formatBank(item) {
    const data = item?.data ?? {};
    return {
        name: data.NAME ?? null,
        cert: data.CERT ?? null,
        active: data.ACTIVE === 1 ? true : data.ACTIVE === 0 ? false : null,
        state: data.STNAME ?? null,
    };
}

export const fdicTools = [
    [
        "fdic_bank",
        "Search FDIC-insured US banks by name prefix, returning name, FDIC certificate number, active status and state. Matches are prefixes on the first word of the name — 'Wells Fargo' searches 'Wells*' because the FDIC filter cannot do multi-word prefixes — and 'chase' finds Chase banks, but not a bank whose name merely contains chase.",
        {
            name: z
                .string()
                .min(1)
                .max(200)
                .describe("Bank name prefix (e.g. 'JPMorgan')"),
            limit: z
                .number()
                .int()
                .min(1)
                .max(10)
                .default(5)
                .describe(
                    "Maximum number of results to return (1-10, default 5)",
                ),
        },
        async ({ name, limit }, fetchJson) => {
            const term = name.trim();
            if (!term) throw new Error("Bank name must not be empty.");
            const n =
                Number.isInteger(limit) && limit >= 1 && limit <= 10
                    ? limit
                    : 5;
            // The trailing * is load-bearing: FDIC filters are exact-match
            // without it, so a bare NAME:CHASE returns nothing. Only the
            // first word is used: a space in the filter value breaks the
            // match (NAME:Wells Fargo* returns nothing, and quoted forms
            // return the whole catalog), so "Wells Fargo" searches Wells*.
            const prefix = term.split(/\s+/)[0];
            const url = `${API_ROOT}?filters=NAME:${encodeURIComponent(prefix)}*&fields=${FIELDS}&limit=${n}`;
            const data = await fetchJson(url);
            if (!Array.isArray(data?.data))
                throw new Error("Unexpected response from the FDIC API.");
            return {
                query: term,
                prefix,
                total: data.meta?.total ?? data.data.length,
                banks: data.data.slice(0, n).map(formatBank),
            };
        },
    ],
];
