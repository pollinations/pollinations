import { z } from "zod";

const API_ROOT = "https://api.aladhan.com/v1";

// The nine timings the tool returns. Aladhan also sends Firstthird and
// Lastthird; those are dropped — they are night-division markers, not prayers.
const TIMING_KEYS = [
    "Fajr",
    "Sunrise",
    "Dhuhr",
    "Asr",
    "Sunset",
    "Maghrib",
    "Isha",
    "Imsak",
    "Midnight",
];

export const aladhanTools = [
    [
        "prayer_times",
        "Prayer times for a city today from Aladhan, with the Gregorian and Hijri dates. Takes an explicit calculation method (0-23, default 3 Muslim World League, the global default) — pick the method that fits the location instead of a regional one. Returns the nine timings Fajr, Sunrise, Dhuhr, Asr, Sunset, Maghrib, Isha, Imsak and Midnight. No key needed.",
        {
            city: z
                .string()
                .min(1)
                .max(100)
                .describe("City name, e.g. 'London'"),
            country: z
                .string()
                .min(1)
                .max(100)
                .describe("Country name, e.g. 'United Kingdom'"),
            method: z
                .number()
                .int()
                .min(0)
                .max(23)
                .default(3)
                .describe(
                    "Aladhan calculation method id 0-23, default 3 (Muslim World League, the global default). Other common ids: 2 ISNA (North America), 4 Makkah (Saudi Arabia), 5 Egypt, 20 KEMENAG (Indonesia).",
                ),
        },
        async ({ city, country, method }, fetchJson) => {
            const place = String(city ?? "").trim();
            const land = String(country ?? "").trim();
            if (!place || !land) {
                throw new Error("city and country are both required.");
            }
            const calc =
                Number.isInteger(method) && method >= 0 && method <= 23
                    ? method
                    : 3;
            const url = new URL(`${API_ROOT}/timingsByCity`);
            url.search = new URLSearchParams({
                city: place,
                country: land,
                method: String(calc),
            }).toString();
            // The timings endpoint 302-redirects on a plain fetch; the shared
            // fetch layer follows redirects (fetch.js sets redirect: "follow").
            const data = await fetchJson(url);
            if (data?.code !== 200 || !data?.data?.timings) {
                throw new Error(
                    `Aladhan returned an unexpected response${data?.status ? `: ${data.status}` : "."}`,
                );
            }
            const timings = data.data.timings;
            const projected = {};
            for (const key of TIMING_KEYS) {
                projected[key.toLowerCase()] = timings[key] ?? null;
            }
            const gregorian = data.data.date?.gregorian;
            const hijri = data.data.date?.hijri;
            return {
                city: place,
                country: land,
                method: calc,
                method_name: data.data.meta?.method?.name ?? null,
                timings: projected,
                date: gregorian
                    ? {
                          gregorian: gregorian.date ?? null,
                          weekday: gregorian.weekday?.en ?? null,
                      }
                    : null,
                hijri_date: hijri
                    ? {
                          date: hijri.date ?? null,
                          month: hijri.month?.en ?? null,
                          year: hijri.year ?? null,
                      }
                    : null,
            };
        },
    ],
];
