import { z } from "zod";

const API_ROOT = "https://api.scryfall.com/cards";

function formatCard(card) {
    const faces = Array.isArray(card.card_faces) ? card.card_faces : [];
    const oracleText =
        card.oracle_text ??
        (faces
            .map((f) => f.oracle_text)
            .filter(Boolean)
            .join("\n//\n") ||
            null);
    const legalities = card.legalities || {};
    return {
        name: card.name ?? null,
        mana_cost: card.mana_cost ?? null,
        cmc: card.cmc ?? null,
        type_line: card.type_line ?? null,
        oracle_text: oracleText,
        power: card.power ?? faces[0]?.power ?? null,
        toughness: card.toughness ?? faces[0]?.toughness ?? null,
        colors: card.colors ?? [],
        rarity: card.rarity ?? null,
        set: card.set ?? null,
        set_name: card.set_name ?? null,
        artist: card.artist ?? null,
        prices: {
            usd: card.prices?.usd ?? null,
            usd_foil: card.prices?.usd_foil ?? null,
            eur: card.prices?.eur ?? null,
        },
        legal_in: Object.entries(legalities)
            .filter(([, v]) => v === "legal")
            .map(([k]) => k),
        image: card.image_uris?.normal ?? null,
        scryfall_uri: card.scryfall_uri ?? null,
    };
}

export const scryfallTools = [
    [
        "scryfall_card",
        "Look up a Magic: The Gathering card by name (fuzzy matched) on Scryfall and return its mana cost, type, oracle text, power/toughness, prices and format legalities. No search tool: Scryfall returns 175 full card objects per search page, past this server's 512 KiB fetch cap for broad queries.",
        {
            name: z
                .string()
                .min(1)
                .max(200)
                .describe("Card name, fuzzy matched (e.g. 'lightning bolt')"),
        },
        async ({ name }, fetchJson) => {
            const url = `${API_ROOT}/named?fuzzy=${encodeURIComponent(name.trim())}`;
            const data = await fetchJson(url);
            if (data?.object !== "card")
                throw new Error("Invalid Scryfall response");
            return { card: formatCard(data) };
        },
    ],
];
