import { z } from "zod";

const API_ROOT = "https://api.ror.org/organizations";
const ROR_ID_PATTERN = /^[0-9a-z]{9}$/;

function displayName(item) {
    const names = Array.isArray(item.names) ? item.names : [];
    const display = names.find((n) => (n.types || []).includes("ror_display"));
    const label = names.find((n) => (n.types || []).includes("label"));
    return display?.value || label?.value || names[0]?.value || null;
}

function formatOrganization(item) {
    const location = item.locations?.[0]?.geonames_details || null;
    return {
        id: item.id ?? null,
        name: displayName(item),
        types: item.types ?? [],
        status: item.status ?? null,
        country: location?.country_name || null,
        country_code: location?.country_code || null,
        city: location?.name || null,
        established: item.established ?? null,
        links: (item.links || []).map((link) => ({
            type: link.type,
            value: link.value,
        })),
        url: item.id ?? null,
    };
}

function normalizeRorId(id) {
    const trimmed = id.trim();
    const bare = trimmed.replace(/^https?:\/\/(?:www\.)?ror\.org\//i, "");
    if (!ROR_ID_PATTERN.test(bare)) {
        throw new Error(
            `Use a ROR ID like "052gg0110" (9 lowercase letters/digits) or a ror.org URL, not "${trimmed}".`,
        );
    }
    return bare;
}

export const rorTools = [
    [
        "ror_search",
        "Search the Research Organization Registry (ROR) for universities, research institutes, funders and companies by name. Returns each match's ROR ID, name, types, country and links.",
        {
            query: z
                .string()
                .min(1)
                .max(500)
                .describe(
                    "Organization name to search for (e.g. 'University of Oxford')",
                ),
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
        async ({ query, limit = 5 }, fetchJson) => {
            const url = `${API_ROOT}?query=${encodeURIComponent(query.trim())}`;
            const data = await fetchJson(url);
            const items = data?.items || [];
            return {
                totalResults: data?.number_of_results ?? items.length,
                query: query.trim(),
                organizations: items.slice(0, limit).map(formatOrganization),
            };
        },
    ],
    [
        "ror_organization",
        "Retrieve a research organization's registry record by ROR ID (e.g. '052gg0110' for the University of Oxford), including its name, types, country, city and links.",
        {
            id: z
                .string()
                .min(1)
                .max(200)
                .describe(
                    "ROR ID (e.g. '052gg0110') or a ror.org URL (e.g. 'https://ror.org/052gg0110')",
                ),
        },
        async ({ id }, fetchJson) => {
            const bare = normalizeRorId(id);
            const data = await fetchJson(`${API_ROOT}/${bare}`);
            return {
                organization: formatOrganization(data),
            };
        },
    ],
];
