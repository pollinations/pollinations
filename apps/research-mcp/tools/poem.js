import { z } from "zod";

const title = z.string().trim().min(1).max(200);

export const poemTools = [
    [
        "poem",
        "Look up a poem by its exact title on PoetryDB. Returns the title, author, line count and full lines. The title is matched case-insensitively, but there is no search — use the exact title.",
        {
            title,
        },
        async ({ title }, fetchJson) => {
            if (!title?.trim()) throw new Error("A poem title is required.");
            const data = await fetchJson(
                `https://poetrydb.org/title/${encodeURIComponent(title.trim())}`,
            );
            if (!Array.isArray(data)) {
                if (data?.status === 404)
                    throw new Error(`Poem not found: ${title.trim()}`);
                throw new Error("Unexpected PoetryDB response.");
            }
            const poem = data[0];
            if (!poem) throw new Error(`Poem not found: ${title.trim()}`);
            return {
                title: poem.title,
                author: poem.author,
                linecount: poem.linecount ?? poem.lines.length,
                lines: poem.lines,
            };
        },
    ],
];
