import { z } from "zod";
import { fetchJson } from "../fetch.js";

export const steamspyTools = [
    [
        "steamspy_stats",
        "Ownership and playtime stats for a Steam game from SteamSpy (community-estimated data): review score, owner range, average and median playtime, and current players. Takes a numeric Steam app id, e.g. 440 for Team Fortress 2. Steam's own app lookup covers store details; this answers how many people own and play it.",
        {
            appid: z.number().int().min(1).describe("Steam app id, e.g. 440"),
        },
        async ({ appid }) => {
            if (!Number.isInteger(appid) || appid < 1)
                throw new Error(
                    "appid must be a positive integer, for example 440.",
                );
            const data = await fetchJson(
                `https://steamspy.com/api.php?request=appdetails&appid=${appid}`,
            );
            if (!data || typeof data.name !== "string" || !data.name)
                throw new Error(`No SteamSpy data found for app ${appid}.`);
            return {
                appid: data.appid ?? appid,
                name: data.name,
                developer: data.developer || null,
                publisher: data.publisher || null,
                scoreRank: data.score_rank === "" ? null : data.score_rank,
                positive: data.positive ?? 0,
                negative: data.negative ?? 0,
                userscore: data.userscore ?? 0,
                owners: data.owners || null,
                averageForeverMinutes: data.average_forever ?? 0,
                average2WeeksMinutes: data.average_2weeks ?? 0,
                medianForeverMinutes: data.median_forever ?? 0,
                median2WeeksMinutes: data.median_2weeks ?? 0,
                currentPlayers: data.ccu ?? 0,
                genre: data.genre || null,
                url: `https://store.steampowered.com/app/${appid}`,
            };
        },
    ],
];
