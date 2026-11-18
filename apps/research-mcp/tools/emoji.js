import { z } from "zod";
import { fetchJson } from "../fetch.js";

// EmojiHub is a keyless public API. /api/random returns one random emoji
// (~150 B); /api/all returns the whole catalog (1,791 records, ~255 KB,
// inside the shared layer's 512 KiB cap) and is only fetched when the caller
// asks for a name, so a name lookup is one fetch per call.
const API = "https://emojihub.yurace.pro/api";

const project = (emoji) => ({
    name: emoji.name ?? null,
    category: emoji.category ?? null,
    group: emoji.group ?? null,
    unicode: Array.isArray(emoji.unicode) ? emoji.unicode : [],
    html_code: Array.isArray(emoji.htmlCode) ? emoji.htmlCode : [],
});

export const emojiTools = [
    [
        "emoji_lookup",
        "Look up emoji by name, or get random emoji. Give a name substring such as 'grinning face' to search the 1,791-emoji catalog; omit it for random emoji. Returns each emoji's name, category, group, unicode codepoints and HTML entities. The random endpoint returns a different emoji on every call, so repeated draws can repeat.",
        {
            name: z
                .string()
                .trim()
                .min(1)
                .max(200)
                .optional()
                .describe(
                    "Emoji name substring, for example 'grinning face'. Omit for random emoji.",
                ),
            limit: z.number().int().min(1).max(10).default(1),
        },
        async ({ name, limit }) => {
            const n =
                Number.isInteger(limit) && limit >= 1 && limit <= 10
                    ? limit
                    : 1;
            const q = typeof name === "string" ? name.trim() : undefined;
            if (name !== undefined && !q)
                throw new Error("Give an emoji name, or omit it.");
            if (q) {
                const all = await fetchJson(`${API}/all`);
                if (!Array.isArray(all))
                    throw new Error(
                        "EmojiHub returned an unexpected response.",
                    );
                const matches = all.filter((emoji) =>
                    (emoji.name ?? "").toLowerCase().includes(q.toLowerCase()),
                );
                return {
                    query: q,
                    total: matches.length,
                    emojis: matches.slice(0, n).map(project),
                };
            }
            const emojis = await Promise.all(
                Array.from({ length: n }, () => fetchJson(`${API}/random`)),
            );
            return {
                query: null,
                total: emojis.length,
                emojis: emojis.map(project),
            };
        },
    ],
];
