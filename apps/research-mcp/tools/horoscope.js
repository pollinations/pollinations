import { z } from "zod";

const HOROSCOPE_API =
    "https://horoscope-app-api.vercel.app/api/v1/get-horoscope/daily";

// The twelve zodiac signs, verified live against the API's own error
// message. Anything else answers 400, so reject it here before fetching.
const SIGNS = [
    "aries",
    "taurus",
    "gemini",
    "cancer",
    "leo",
    "virgo",
    "libra",
    "scorpio",
    "sagittarius",
    "capricorn",
    "aquarius",
    "pisces",
];

// The API accepts these three day values, but live probes showed it
// returns the identical horoscope for all of them — the day is passed
// through and the tool says so in its description.
const DAYS = ["today", "tomorrow", "yesterday"];

export const horoscopeTools = [
    [
        "horoscope",
        "Get a daily horoscope for a zodiac sign from the Horoscope App API, no key needed. The API currently returns the same horoscope for today, tomorrow and yesterday — the day parameter is passed through but changes nothing.",
        {
            sign: z
                .string()
                .trim()
                .min(1)
                .max(20)
                .describe("Zodiac sign, for example aries, leo or pisces."),
            day: z
                .enum(["today", "tomorrow", "yesterday"])
                .default("today")
                .describe(
                    "Which day's horoscope; the API currently returns the same text for all three.",
                ),
        },
        async ({ sign, day }, fetchJson) => {
            const normalizedSign =
                typeof sign === "string" ? sign.trim().toLowerCase() : "";
            if (!SIGNS.includes(normalizedSign))
                throw new Error(
                    `Unknown zodiac sign "${sign}". Signs: ${SIGNS.join(", ")}.`,
                );
            const normalizedDay =
                typeof day === "string" ? day.trim().toLowerCase() : "today";
            if (!DAYS.includes(normalizedDay))
                throw new Error(
                    `Unknown day "${day}". Days: today, tomorrow, yesterday.`,
                );
            const response = await fetchJson(
                `${HOROSCOPE_API}?sign=${normalizedSign}&day=${normalizedDay}`,
            );
            const data = response?.data;
            if (typeof data?.horoscope !== "string" || !data.horoscope)
                throw new Error(
                    "Horoscope API returned a horoscope without text",
                );
            return {
                sign: data.sign ?? normalizedSign,
                day: normalizedDay,
                date: data.date ?? null,
                period: data.period ?? null,
                horoscope: data.horoscope,
            };
        },
    ],
];
