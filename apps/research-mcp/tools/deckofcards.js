import { z } from "zod";
import { fetchJson } from "../fetch.js";

// Deck of Cards API: stateless per call — a fresh deck is created when no
// deck_id is given, and the id round-trips so an agent can keep drawing
// from the same deck. The API answers HTTP 200 with success:false when a
// deck is exhausted (or the draw is bigger than what is left), so the tool
// checks that itself instead of returning a partial draw.

const deckIdPattern = /^[a-z0-9]+$/;

const card = (c) => ({
    code: c.code,
    value: c.value,
    suit: c.suit,
    image: c.image,
});

export const deckOfCardsTools = [
    [
        "deck_draw",
        "Draw cards from a shuffled deck of cards using the Deck of Cards API. Give count (1–5, default 1) and optionally a deck_id to keep drawing from the same deck; omit deck_id for a fresh shuffled deck, and the returned deck_id can be passed back on the next call. Returns the drawn cards with value, suit, code and image URL, plus deck_id and remaining count. No key needed.",
        {
            count: z.number().int().min(1).max(5).default(1),
            deck_id: z.string().trim().regex(deckIdPattern).optional(),
        },
        async ({ count = 1, deck_id }) => {
            // zod defaults/validation only apply via the MCP server, so the
            // handler carries its own defaults and range check.
            if (!Number.isInteger(count) || count < 1 || count > 5)
                throw new Error("count must be an integer between 1 and 5");
            if (deck_id !== undefined && !deckIdPattern.test(deck_id))
                throw new Error(
                    "deck_id must be a lowercase alphanumeric deck id",
                );
            let deckId = deck_id;
            if (deckId === undefined) {
                const created = await fetchJson(
                    "https://deckofcardsapi.com/api/deck/new/shuffle/?deck_count=1",
                );
                if (!created?.success || typeof created.deck_id !== "string")
                    throw new Error("Could not create a shuffled deck");
                deckId = created.deck_id;
            }
            const url = new URL(
                `https://deckofcardsapi.com/api/deck/${deckId}/draw/`,
            );
            url.search = new URLSearchParams({ count: String(count) });
            const data = await fetchJson(url);
            if (!data?.success)
                throw new Error(data?.error ?? "Deck of Cards draw failed");
            if (!Array.isArray(data.cards))
                throw new Error("Invalid Deck of Cards draw response");
            return {
                deck_id: data.deck_id,
                remaining: data.remaining,
                cards: data.cards.map(card),
            };
        },
    ],
];
