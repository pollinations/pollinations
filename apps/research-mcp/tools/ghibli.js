import { z } from "zod";

const API_ROOT = "https://ghibliapi.vercel.app/films";
const DESCRIPTION_CAP = 500;

function truncate(text) {
    if (typeof text !== "string") return null;
    if (text.length <= DESCRIPTION_CAP) return text;
    return `${text.slice(0, DESCRIPTION_CAP)}…`;
}

function formatListFilm(film) {
    return {
        id: film.id ?? null,
        title: film.title ?? null,
        original_title: film.original_title ?? null,
        original_title_romanised: film.original_title_romanised ?? null,
        director: film.director ?? null,
        producer: film.producer ?? null,
        release_date: film.release_date ?? null,
        running_time: film.running_time ?? null,
        rt_score: film.rt_score ?? null,
    };
}

function formatFilm(film) {
    const description = truncate(film.description);
    return {
        ...formatListFilm(film),
        description,
        descriptionTruncated:
            typeof film.description === "string" &&
            film.description.length > DESCRIPTION_CAP,
    };
}

export const ghibliTools = [
    [
        "ghibli_film",
        "Look up Studio Ghibli films on the Ghibli API. With no id, returns the full list of 22 films (title, director, year, running time, Rotten Tomatoes score). With an id, returns that film's full details including a description capped at 500 characters.",
        {
            id: z
                .string()
                .min(1)
                .max(100)
                .optional()
                .describe(
                    "Film id (a UUID, e.g. '2baf70d1-42bb-4437-b551-e5fed5a87abe' for Castle in the Sky). Omit to list all films.",
                ),
        },
        async ({ id }, fetchJson) => {
            const trimmed = id?.trim();
            if (id !== undefined && !trimmed)
                throw new Error("Film id must not be blank");
            if (!trimmed) {
                const data = await fetchJson(API_ROOT);
                if (!Array.isArray(data))
                    throw new Error("Invalid Ghibli API response");
                return {
                    total: data.length,
                    films: data.map(formatListFilm),
                };
            }
            const data = await fetchJson(
                `${API_ROOT}/${encodeURIComponent(trimmed)}`,
            );
            if (!data || typeof data !== "object" || !data.id)
                throw new Error("Invalid Ghibli API response");
            return { film: formatFilm(data) };
        },
    ],
];
