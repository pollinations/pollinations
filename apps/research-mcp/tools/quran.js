import { z } from "zod";

// AlQuran Cloud is keyless. One request per call: the editions endpoint
// returns the Arabic (Uthmani) text and the requested translation together.
// Note the trap: an unknown edition identifier does NOT error upstream —
// it silently falls back to the Arabic default, so the tool checks the
// returned edition identifier and throws instead of returning Arabic
// twice under a translation label.
const API = "https://api.alquran.cloud/v1";
const REFERENCE = /^(\d{1,3}):(\d{1,3})$/;
const EDITION = /^[a-z]{2}\.[a-z0-9-]+$/;

export const quranTools = [
    [
        "quran_ayah",
        'A single Quran verse by reference (for example "2:255"): the Arabic text plus an English translation (Sahih International by default). Returns the surah name and number, ayah number, juz and page, and both texts. One verse per call — it does not fetch whole surahs or search.',
        {
            reference: z
                .string()
                .trim()
                .max(8)
                .describe(
                    'Verse reference as "surah:ayah", for example "2:255".',
                ),
            edition: z
                .string()
                .trim()
                .max(30)
                .default("en.sahih")
                .describe(
                    'Translation edition, for example "en.sahih" (default) or "en.pickthall".',
                ),
        },
        async ({ reference, edition = "en.sahih" }, fetchJson) => {
            const cleanRef = String(reference ?? "").trim();
            const match = REFERENCE.exec(cleanRef);
            if (!match)
                throw new Error('Use a reference like "2:255" (surah:ayah).');
            const surah = Number(match[1]);
            const ayah = Number(match[2]);
            if (surah < 1 || surah > 114)
                throw new Error("Surah must be a number from 1 to 114.");
            if (ayah < 1) throw new Error("Ayah must be a number from 1 up.");
            const cleanEdition = String(edition ?? "en.sahih")
                .trim()
                .toLowerCase();
            if (!EDITION.test(cleanEdition))
                throw new Error(
                    'Use a translation edition like "en.sahih" or "en.pickthall".',
                );
            const data = await fetchJson(
                `${API}/ayah/${surah}:${ayah}/editions/quran-uthmani,${cleanEdition}`,
            );
            const entries = data?.data;
            if (!Array.isArray(entries) || entries.length !== 2)
                throw new Error(
                    `Unexpected Quran response for ${surah}:${ayah}.`,
                );
            const [arabic, translation] = entries;
            if (
                arabic?.edition?.identifier !== "quran-uthmani" ||
                typeof arabic?.text !== "string"
            )
                throw new Error(
                    `Unexpected Quran response for ${surah}:${ayah}.`,
                );
            if (translation?.edition?.identifier !== cleanEdition)
                throw new Error(
                    `Unknown Quran translation edition "${cleanEdition}".`,
                );
            const info = arabic.surah ?? {};
            return {
                reference: `${surah}:${ayah}`,
                surah: {
                    number: info.number ?? surah,
                    name: info.name ?? null,
                    englishName: info.englishName ?? null,
                    englishNameTranslation: info.englishNameTranslation ?? null,
                    numberOfAyahs: info.numberOfAyahs ?? null,
                    revelationType: info.revelationType ?? null,
                },
                ayah: arabic.numberInSurah ?? ayah,
                number: arabic.number ?? null,
                juz: arabic.juz ?? null,
                page: arabic.page ?? null,
                arabicText: arabic.text.trim(),
                translation: String(translation.text ?? "").trim(),
                translationEdition: {
                    identifier: translation.edition.identifier,
                    englishName: translation.edition.englishName ?? null,
                },
            };
        },
    ],
];
