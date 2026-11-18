import { z } from "zod";

const ROBLOX_URL = "https://users.roblox.com/v1/users/search";

export const robloxTools = [
    [
        "roblox_user",
        "Search Roblox users by username. The endpoint only accepts limit 10, 25, 50 or 100, so the tool always fetches 10 and slices client-side to the requested limit (1–10, default 5). Returns id, username, display name and whether the account is verified. No key needed; one fetch per call.",
        {
            keyword: z.string().trim().min(1).max(100),
            limit: z.number().int().min(1).max(10).default(5),
        },
        async ({ keyword, limit }, fetchJson) => {
            const query = typeof keyword === "string" ? keyword.trim() : "";
            if (!query) throw new Error("roblox_user needs a keyword");
            const n =
                Number.isInteger(limit) && limit >= 1 && limit <= 10
                    ? limit
                    : 5;
            const url = `${ROBLOX_URL}?keyword=${encodeURIComponent(query)}&limit=10`;
            const response = await fetchJson(url);
            if (!response || !Array.isArray(response.data))
                throw new Error("Roblox returned an unexpected response");
            const users = [];
            for (const item of response.data) {
                if (
                    typeof item?.id !== "number" ||
                    typeof item?.name !== "string" ||
                    !item.name
                )
                    throw new Error(
                        "Roblox returned a user without an id or name",
                    );
                users.push({
                    id: item.id,
                    name: item.name,
                    displayName:
                        typeof item.displayName === "string"
                            ? item.displayName
                            : null,
                    verified: item.hasVerifiedBadge === true,
                });
            }
            return {
                keyword: query,
                limit: n,
                total: users.length,
                users: users.slice(0, n),
            };
        },
    ],
];
