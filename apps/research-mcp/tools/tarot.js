import { z } from "zod";
import { fetchJson } from "../fetch.js";

const API_URL = "https://tarotapi.dev/api/v1/cards/random";
const MAX_MEANING = 500;

function cap(text) {
    if (typeof text !== "string") return null;
    return text.length > MAX_MEANING
        ? `${text.slice(0, MAX_MEANING)}...`
        : text;
}

export const tarotTools = [
    [
        "tarot_card",
        "Draw random tarot cards and return each card's name, suit, type and upright/reversed meanings. Novelty — the cards are drawn at random, not chosen by a question, and the meanings are the traditional short readings from tarotapi.dev.",
        {
            limit: z
                .number()
                .int()
                .min(1)
                .max(10)
                .default(1)
                .describe("Number of cards to draw, 1 to 10."),
        },
        async ({ limit }) => {
            // Zod only applies via the MCP server; the handler carries its own
            // default and range check (the Terraform lesson).
            const n =
                Number.isInteger(limit) && limit >= 1 && limit <= 10
                    ? limit
                    : 1;
            const url = new URL(API_URL);
            url.search = new URLSearchParams({ n: String(n) }).toString();
            const data = await fetchJson(url, "Tarot cards");
            if (!Array.isArray(data?.cards))
                throw new Error("Tarot API returned an unexpected shape.");
            return {
                count: data.cards.length,
                cards: data.cards.map((card) => ({
                    name: card.name ?? null,
                    value: card.value ?? null,
                    type: card.type ?? null,
                    suit: card.suit ?? null,
                    meaning_up: cap(card.meaning_up),
                    meaning_rev: cap(card.meaning_rev),
                })),
            };
        },
    ],
];
