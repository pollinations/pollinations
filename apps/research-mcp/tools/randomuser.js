import { z } from "zod";

const API_BASE = "https://randomuser.me/api/";

function formatProfile(profile) {
    const name = [profile.name?.title, profile.name?.first, profile.name?.last]
        .filter(Boolean)
        .join(" ");
    return {
        name: name || null,
        gender: profile.gender ?? null,
        country: profile.location?.country ?? null,
        city: profile.location?.city ?? null,
        email: profile.email ?? null,
        phone: profile.phone ?? null,
        date_of_birth:
            typeof profile.dob?.date === "string"
                ? profile.dob.date.slice(0, 10)
                : null,
        nationality: profile.nat ?? null,
        picture: profile.picture?.large ?? null,
    };
}

export const randomuserTools = [
    [
        "randomuser_profile",
        "Generate random (fabricated, not real) user profiles from RandomUser.me — name, location, contact details and picture. Every field is made up; never treat a profile as a real person.",
        {
            limit: z
                .number()
                .int()
                .min(1)
                .max(10)
                .default(1)
                .describe(
                    "Maximum number of profiles to return (1-10, default 1)",
                ),
        },
        async ({ limit }, fetchJson) => {
            const count =
                Number.isInteger(limit) && limit >= 1 && limit <= 10
                    ? limit
                    : 1;
            const data = await fetchJson(`${API_BASE}?results=${count}`);
            if (!Array.isArray(data?.results))
                throw new Error(
                    "RandomUser API returned an unexpected response.",
                );
            return {
                total: data.results.length,
                profiles: data.results.map(formatProfile),
            };
        },
    ],
];
