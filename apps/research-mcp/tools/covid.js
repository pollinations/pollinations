import { z } from "zod";

const COVID_API = "https://disease.sh/v3/covid-19/countries";

// disease.sh accepts a country name, an ISO2 code or an ISO3 code —
// "USA", "US", "United States" and "usa" all returned the same record
// live, so the tool passes the trimmed value through unchanged.
export const covidTools = [
    [
        "covid_stats",
        "Get cumulative COVID-19 statistics for one country from disease.sh, no key needed. Accepts a country name, ISO2 code or ISO3 code. Counts are cumulative totals; the source reports zero daily deltas in the current data, so no per-day figures are returned.",
        {
            country: z
                .string()
                .trim()
                .min(1)
                .max(100)
                .describe(
                    "Country name, ISO2 code or ISO3 code, for example USA, US, United States or Germany.",
                ),
        },
        async ({ country }, fetchJson) => {
            const normalizedCountry =
                typeof country === "string" ? country.trim() : "";
            if (!normalizedCountry)
                throw new Error(
                    "A country name or code is required, for example USA.",
                );
            let response;
            try {
                response = await fetchJson(
                    `${COVID_API}/${encodeURIComponent(normalizedCountry)}?strict=true`,
                );
            } catch (error) {
                if (String(error?.message).includes("HTTP 404"))
                    throw new Error(
                        `No COVID data found for country "${normalizedCountry}".`,
                    );
                throw error;
            }
            if (
                typeof response?.cases !== "number" ||
                typeof response?.country !== "string"
            )
                throw new Error(
                    "disease.sh returned COVID data without case counts",
                );
            return {
                country: response.country,
                cases: response.cases,
                deaths: response.deaths ?? null,
                recovered: response.recovered ?? null,
                active: response.active ?? null,
                critical: response.critical ?? null,
                casesPerOneMillion: response.casesPerOneMillion ?? null,
                deathsPerOneMillion: response.deathsPerOneMillion ?? null,
                tests: response.tests ?? null,
                population: response.population ?? null,
                updated:
                    typeof response.updated === "number"
                        ? new Date(response.updated).toISOString()
                        : null,
            };
        },
    ],
];
