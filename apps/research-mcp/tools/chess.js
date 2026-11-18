import { z } from "zod";
import { fetchJson } from "../fetch.js";

function toIso(epoch) {
    return Number.isFinite(epoch) ? new Date(epoch * 1000).toISOString() : null;
}

export const chessTools = [
    [
        "chess_player",
        "Look up a Chess.com player profile by username. Returns the player's name, title, follower count, country code, location, join and last-online dates, account status, streamer flag and profile URLs. No key needed.",
        {
            username: z.string().trim().min(1).max(50),
        },
        async ({ username }) => {
            const name = String(username ?? "")
                .trim()
                .toLowerCase();
            if (!/^[a-z0-9][a-z0-9_.-]*$/.test(name))
                throw new Error(
                    `Invalid Chess.com username "${username}": use letters, digits, hyphens, underscores and dots only.`,
                );
            let data;
            try {
                data = await fetchJson(
                    `https://api.chess.com/pub/player/${encodeURIComponent(name)}`,
                );
            } catch (error) {
                throw new Error(
                    `No Chess.com player found for "${name}": ${error.message}`,
                );
            }
            if (!data || typeof data !== "object" || !data.username)
                throw new Error(`No Chess.com player found for "${name}".`);
            return {
                username: data.username,
                name: data.name ?? null,
                title: data.title ?? null,
                followers: data.followers ?? null,
                country:
                    typeof data.country === "string"
                        ? data.country.split("/").filter(Boolean).pop()
                        : null,
                location: data.location ?? null,
                joined: toIso(data.joined),
                last_online: toIso(data.last_online),
                status: data.status ?? null,
                is_streamer: data.is_streamer ?? null,
                avatar: data.avatar ?? null,
                twitch_url: data.twitch_url ?? null,
                url: data.url ?? null,
            };
        },
    ],
];
