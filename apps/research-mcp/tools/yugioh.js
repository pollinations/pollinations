import { z } from "zod";

const API_ROOT = "https://db.ygoprodeck.com/api/v7/cardinfo.php";

function formatCard(card) {
    const prices = card.card_prices?.[0] ?? {};
    const image = Array.isArray(card.card_images) ? card.card_images[0] : null;
    return {
        id: card.id ?? null,
        name: card.name ?? null,
        type: card.type ?? null,
        race: card.race ?? null,
        attribute: card.attribute ?? null,
        level: card.level ?? null,
        atk: card.atk ?? null,
        def: card.def ?? null,
        desc: card.desc ?? null,
        archetype: card.archetype ?? null,
        prices: {
            cardmarket: prices.cardmarket_price ?? null,
            tcgplayer: prices.tcgplayer_price ?? null,
            ebay: prices.ebay_price ?? null,
            amazon: prices.amazon_price ?? null,
            coolstuffinc: prices.coolstuffinc_price ?? null,
        },
        image_url: image?.image_url ?? null,
        ygoprodeck_url: card.ygoprodeck_url ?? null,
    };
}

export const yugiohTools = [
    [
        "yugioh_card",
        "Look up a Yu-Gi-Oh! card by name (fuzzy matched) on YGOPRODeck and return its type, race, attribute, level, ATK/DEF, card text, archetype, prices and image URL. Returns the best-matching card only — a broad name can match hundreds of cards, so the rest are counted, not returned.",
        {
            name: z
                .string()
                .min(1)
                .max(200)
                .describe("Card name, fuzzy matched (e.g. 'dark magician')"),
        },
        async ({ name }, fetchJson) => {
            const url = `${API_ROOT}?fname=${encodeURIComponent(name.trim())}&num=1&offset=0`;
            const data = await fetchJson(url);
            const card = data?.data?.[0];
            if (!card) throw new Error("Invalid YGOPRODeck response");
            return {
                card: formatCard(card),
                total_matches: data.meta?.total_rows ?? 1,
            };
        },
    ],
];
