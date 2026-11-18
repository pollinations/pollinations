import { z } from "zod";
import { fetchJson } from "../fetch.js";

const API_ROOT = "https://api.disneyapi.dev";
// The caller's Pollinations key authenticates the proxy. The Disney API is
// public, so the key is never forwarded upstream.

const LIST_LIMIT = 10;

function capped(list) {
    const values = Array.isArray(list) ? list : [];
    return { items: values.slice(0, LIST_LIMIT), count: values.length };
}

function characterSummary(character) {
    const films = capped(character.films);
    const shortFilms = capped(character.shortFilms);
    const tvShows = capped(character.tvShows);
    const videoGames = capped(character.videoGames);
    const parkAttractions = capped(character.parkAttractions);
    return {
        id: character._id ?? null,
        name: character.name ?? null,
        films: films.items,
        film_count: films.count,
        short_films: shortFilms.items,
        short_film_count: shortFilms.count,
        tv_shows: tvShows.items,
        tv_show_count: tvShows.count,
        video_games: videoGames.items,
        video_game_count: videoGames.count,
        park_attractions: parkAttractions.items,
        park_attraction_count: parkAttractions.count,
        image_url: character.imageUrl ?? null,
        url: character.url ?? null,
    };
}

export const disneyTools = [
    [
        "disney_character",
        "Look up a Disney character by name or by character id: films, short films, TV shows, video games and park attractions. Covers Disney characters only — a single-franchise reference, not a general character database. The API is community-run, with no SLA.",
        {
            name: z
                .string()
                .min(1)
                .max(100)
                .optional()
                .describe(
                    "Character name to search for, for example Mickey Mouse. Provide either name or id, not both.",
                ),
            id: z
                .number()
                .int()
                .positive()
                .optional()
                .describe(
                    "Character id, for example 4703 for Mickey Mouse. Provide either name or id, not both.",
                ),
            limit: z
                .number()
                .int()
                .min(1)
                .max(10)
                .default(5)
                .describe(
                    "Maximum number of matches to return for a name search.",
                ),
        },
        async ({ name, id, limit = 5 }) => {
            if (name !== undefined && id !== undefined) {
                throw new Error("Provide only one of name or id, not both.");
            }
            if (id !== undefined) {
                const data = await fetchJson(`${API_ROOT}/characters/${id}`);
                if (!data?.data || Array.isArray(data.data)) {
                    throw new Error(`No Disney character found for id ${id}.`);
                }
                return { character: characterSummary(data.data) };
            }
            if (name !== undefined) {
                const trimmed = name.trim();
                if (!trimmed) {
                    throw new Error("Provide a non-empty character name.");
                }
                const url = new URL(`${API_ROOT}/character`);
                url.searchParams.set("name", trimmed);
                const data = await fetchJson(url);
                return {
                    name: trimmed,
                    total: data.info?.count ?? 0,
                    characters: (data.data ?? [])
                        .slice(0, limit)
                        .map(characterSummary),
                };
            }
            throw new Error("Provide a character name or id.");
        },
    ],
];
