import { z } from "zod";

const API_ROOT =
    "https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries";
const SELECT_FIELDS =
    "disasterNumber,declarationTitle,incidentType,state,declarationDate,incidentBeginDate";

// FEMA's v2 API answers metadata.count 0 even when records are returned,
// so total is the number of records in the response, not a catalog count.
function datePart(value) {
    return typeof value === "string" ? value.slice(0, 10) : null;
}

function formatDisaster(item) {
    return {
        disaster_number: item.disasterNumber ?? null,
        state: item.state ?? null,
        declaration_title: item.declarationTitle ?? null,
        incident_type: item.incidentType ?? null,
        declaration_date: datePart(item.declarationDate),
        incident_begin_date: datePart(item.incidentBeginDate),
    };
}

export const femaTools = [
    [
        "fema_disaster",
        "List FEMA disaster declarations for a US state, optionally filtered by incident type (e.g. Fire, Hurricane). Returns disaster number, title, type and dates. No free-text search — this answers which disasters were declared in a state, not a keyword search.",
        {
            state: z
                .string()
                .min(2)
                .max(2)
                .describe(
                    "2-letter US state code, e.g. 'CA' (required — unfiltered is the whole disaster history)",
                ),
            incidentType: z
                .string()
                .min(1)
                .max(100)
                .optional()
                .describe(
                    "Optional incident type filter, e.g. 'Fire' or 'Hurricane'",
                ),
            limit: z
                .number()
                .int()
                .min(1)
                .max(10)
                .default(5)
                .describe(
                    "Maximum number of declarations to return (1-10, default 5)",
                ),
        },
        async ({ state, incidentType, limit }, fetchJson) => {
            const code = String(state ?? "")
                .trim()
                .toUpperCase();
            if (!/^[A-Z]{2}$/.test(code)) {
                throw new Error(
                    "state must be a 2-letter US state code, e.g. 'CA'.",
                );
            }
            const count =
                Number.isInteger(limit) && limit >= 1 && limit <= 10
                    ? limit
                    : 5;
            const type = incidentType?.trim();
            let filter = `state eq '${code}'`;
            if (type) {
                // OData escapes a single quote by doubling it.
                filter += ` and incidentType eq '${type.replace(/'/g, "''")}'`;
            }
            const url = `${API_ROOT}?$filter=${encodeURIComponent(filter)}&$top=${count}&$select=${SELECT_FIELDS}`;
            const data = await fetchJson(url);
            const items = data?.DisasterDeclarationsSummaries;
            if (!Array.isArray(items)) {
                throw new Error("FEMA returned an unexpected response shape.");
            }
            return {
                state: code,
                incident_type: type || null,
                total: items.length,
                disasters: items.map(formatDisaster),
            };
        },
    ],
];
