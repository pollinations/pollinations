// UK Parliament members search. No key; the Members API is public.
import { z } from "zod";
import { fetchJson } from "../fetch.js";

const API_ROOT = "https://members-api.parliament.uk/api";

function houseName(house) {
    if (house === 1) return "Commons";
    if (house === 2) return "Lords";
    return null;
}

function toMember(item) {
    const value = item?.value;
    if (!value || typeof value.id !== "number")
        throw new Error("UK Parliament did not return a member.");
    const membership = value.latestHouseMembership ?? {};
    return {
        id: value.id,
        name: value.nameDisplayAs ?? null,
        party: value.latestParty?.name ?? null,
        constituency: membership.membershipFrom ?? null,
        house: houseName(membership.house),
    };
}

export const ukParliamentTools = [
    [
        "uk_mp",
        "Search UK Parliament members by name. Returns each member's name, party, constituency and house (Commons or Lords). UK members only — there is no name lookup for other parliaments.",
        {
            name: z
                .string()
                .trim()
                .min(1)
                .max(100)
                .describe(
                    "Member name or part of a name, for example Starmer.",
                ),
            limit: z
                .number()
                .int()
                .min(1)
                .max(25)
                .default(5)
                .describe("Maximum members to return, default 5."),
        },
        async ({ name, limit = 5 }) => {
            if (!name?.trim())
                throw new Error("Provide a member name to search for.");
            if (!Number.isInteger(limit) || limit < 1 || limit > 25)
                throw new Error("limit must be between 1 and 25.");
            const url = `${API_ROOT}/Members/Search?Name=${encodeURIComponent(name.trim())}&skip=0&take=${limit}`;
            const data = await fetchJson(url);
            if (!data || !Array.isArray(data.items))
                throw new Error("UK Parliament did not return members.");
            return {
                name: name.trim(),
                total: data.totalResults ?? data.items.length,
                members: data.items.map(toMember),
            };
        },
    ],
];
