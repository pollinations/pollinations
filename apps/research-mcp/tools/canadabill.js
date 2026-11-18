// Canadian Parliament bill lookup via Open Parliament. One fetch per call;
// the bill is addressed directly by session and number — the bare bills list
// is not sorted by recency, so there is no "recent bills" mode here.
import { z } from "zod";

const API_ROOT = "https://api.openparliament.ca/bills";

function normalizeSession(session) {
    const trimmed = String(session).trim();
    if (!/^\d{1,2}-\d$/.test(trimmed))
        throw new Error(
            "Provide a session like 45-1 (parliament-session, for example 45-1 for the 45th Parliament, 1st session).",
        );
    return trimmed;
}

function normalizeNumber(number) {
    const trimmed = String(number).trim().toUpperCase();
    if (!/^[CS]-\d{1,4}$/.test(trimmed))
        throw new Error(
            "Provide a bill number like C-1 for a House bill or S-1 for a Senate bill.",
        );
    return trimmed;
}

function pickName(name) {
    if (typeof name === "string") return name || null;
    return name?.en ?? null;
}

export const canadaBillTools = [
    [
        "canada_bill",
        "Look up a bill in the Canadian Parliament by session and number (for example session 44-1, bill C-18): introduced date, English and French names, status, and the Open Parliament page. Session and number only — there is no search and no list of recent bills.",
        {
            session: z
                .string()
                .min(1)
                .max(5)
                .regex(/^\d{1,2}-\d$/)
                .describe(
                    "The Parliament session, parliament-session (45-1 for the 45th Parliament, 1st session).",
                ),
            number: z
                .string()
                .min(1)
                .max(6)
                .regex(/^[CS]-\d{1,4}$/i)
                .describe(
                    "The bill number, C-1 for a House bill or S-1 for a Senate bill.",
                ),
        },
        async ({ session, number }, fetchJson) => {
            const cleanSession = normalizeSession(session);
            const cleanNumber = normalizeNumber(number);
            const url = `${API_ROOT}/${cleanSession}/${cleanNumber}/?format=json`;
            let data;
            try {
                data = await fetchJson(url);
            } catch (error) {
                if (error?.message?.includes("HTTP 404"))
                    throw new Error(
                        `No Canadian Parliament bill found for session ${cleanSession} number ${cleanNumber}. Check the session and number.`,
                    );
                throw error;
            }
            if (typeof data !== "object" || data === null)
                throw new Error(
                    `Open Parliament returned an unexpected record for bill ${cleanSession}/${cleanNumber}.`,
                );
            return {
                session: data.session ?? cleanSession,
                number: data.number ?? cleanNumber,
                introduced: data.introduced ?? null,
                name_en: pickName(data.name),
                name_fr:
                    typeof data.name === "object" && data.name !== null
                        ? (data.name.fr ?? null)
                        : null,
                status: data.status?.en ?? null,
                url: `https://openparliament.ca/bills/${cleanSession}/${cleanNumber}/`,
            };
        },
    ],
];
