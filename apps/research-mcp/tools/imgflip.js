import { z } from "zod";
import { fetchJson } from "../fetch.js";

const API_URL = "https://api.imgflip.com/get_memes";

export const imgflipTools = [
    [
        "imgflip_meme",
        "Find popular memes from Imgflip's top-100 list by name substring, or return the top memes when no name is given. Returns each meme's name, image URL and text-box count. Novelty — the list is the 100 most popular memes, there is no way to create a captioned meme, and the whole list is fetched and filtered on each call.",
        {
            name: z
                .string()
                .min(1)
                .max(200)
                .optional()
                .describe(
                    'Case-insensitive substring to match against meme names, e.g. "drake". Omit to get the top memes.',
                ),
            limit: z
                .number()
                .int()
                .min(1)
                .max(10)
                .default(5)
                .describe("Number of memes to return, 1 to 10."),
        },
        async ({ name, limit }) => {
            // Zod only applies via the MCP server; the handler carries its own
            // default and range check (the Terraform lesson).
            const n =
                Number.isInteger(limit) && limit >= 1 && limit <= 10
                    ? limit
                    : 5;
            const query = typeof name === "string" ? name.trim() : null;
            if (name !== undefined && !query)
                throw new Error("Meme name must not be blank.");
            const data = await fetchJson(API_URL, "Imgflip memes");
            if (!data?.success || !Array.isArray(data?.data?.memes))
                throw new Error("Imgflip returned an unexpected shape.");
            const needle = query?.toLowerCase() ?? null;
            const matches = needle
                ? data.data.memes.filter((meme) =>
                      typeof meme.name === "string"
                          ? meme.name.toLowerCase().includes(needle)
                          : false,
                  )
                : data.data.memes;
            return {
                query: query ?? null,
                total: matches.length,
                memes: matches.slice(0, n).map((meme) => ({
                    name: meme.name ?? null,
                    url: meme.url ?? null,
                    box_count: meme.box_count ?? null,
                })),
            };
        },
    ],
];
