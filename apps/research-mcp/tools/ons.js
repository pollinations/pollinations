import { z } from "zod";
import { fetchJson } from "../fetch.js";

const API_ROOT = "https://api.beta.ons.gov.uk/v1/datasets";

function str(value) {
    return typeof value === "string" && value.length > 0 ? value : null;
}

function cap(text, limit = 500) {
    if (!text) return { text: null, truncated: false };
    if (text.length <= limit) return { text, truncated: false };
    return { text: text.slice(0, limit), truncated: true };
}

export const onsTools = [
    [
        "ons_datasets",
        "List datasets from the UK Office for National Statistics catalogue: title, description, keywords, last-updated date, release frequency and a contact for each dataset. No search — the catalogue list has no query parameter (a q= value is ignored upstream), so this returns the first N datasets in catalogue order; the total is the whole catalogue size. For a different stats office use the World Bank tools or eurostat_population.",
        {
            limit: z
                .int()
                .min(1)
                .max(10)
                .default(5)
                .describe(
                    "How many datasets to return, 1 to 10. Defaults to 5.",
                ),
        },
        async ({ limit = 5 } = {}) => {
            const n =
                Number.isInteger(limit) && limit >= 1 && limit <= 10
                    ? limit
                    : 5;
            const data = await fetchJson(`${API_ROOT}?limit=${n}&offset=0`);
            const items = data?.items;
            if (!Array.isArray(items))
                throw new Error("ONS returned an unexpected response.");
            return {
                total:
                    typeof data?.total_count === "number"
                        ? data.total_count
                        : items.length,
                datasets: items.map((item) => {
                    const { text, truncated } = cap(str(item?.description));
                    return {
                        id: str(item?.id),
                        title: str(item?.title),
                        description: text,
                        description_truncated: truncated,
                        keywords: Array.isArray(item?.keywords)
                            ? item.keywords.filter(
                                  (keyword) =>
                                      typeof keyword === "string" &&
                                      keyword.length > 0,
                              )
                            : [],
                        last_updated: str(item?.last_updated),
                        release_frequency: str(item?.release_frequency),
                        national_statistic:
                            typeof item?.national_statistic === "boolean"
                                ? item.national_statistic
                                : null,
                        state: str(item?.state),
                        next_release: str(item?.next_release),
                        contacts: Array.isArray(item?.contacts)
                            ? item.contacts.map((contact) => ({
                                  name: str(contact?.name),
                                  email: str(contact?.email),
                                  telephone: str(contact?.telephone),
                              }))
                            : [],
                        url: str(item?.links?.self?.href),
                    };
                }),
            };
        },
    ],
];
