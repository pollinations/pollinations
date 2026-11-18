import { z } from "zod";

const API_ROOT = "https://api.mojang.com/users/profiles/minecraft";
const USERNAME_PATTERN = /^[A-Za-z0-9_]{1,16}$/;
const UUID_PATTERN = /^[0-9a-f]{32}$/i;

// Mojang returns the UUID without dashes; the dashed form is the standard
// UUID representation, so the tool returns that.
function dashUuid(id) {
    return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
}

export const mojangTools = [
    [
        "minecraft_player",
        "Look up a Minecraft Java player by username on Mojang's public API: canonical username and UUID. One fetch per call; an unknown username is a clean error, not an empty result. Mojang sometimes rate-limits the shared IP (HTTP 429), which surfaces as a 'rate limited, retry later' error.",
        {
            username: z
                .string()
                .min(1)
                .max(16)
                .describe(
                    "Minecraft Java username (e.g. 'Notch'). Case-insensitive — the canonical name is returned.",
                ),
        },
        async ({ username }, fetchJson) => {
            const clean = String(username ?? "").trim();
            if (!USERNAME_PATTERN.test(clean))
                throw new Error(
                    "A Minecraft username is 1-16 letters, digits or underscores.",
                );
            let data;
            try {
                data = await fetchJson(
                    `${API_ROOT}/${encodeURIComponent(clean)}`,
                );
            } catch (error) {
                if (String(error?.message ?? "").includes("HTTP 404"))
                    throw new Error(
                        `No Minecraft player found with username ${clean}.`,
                    );
                throw error;
            }
            if (
                typeof data?.id !== "string" ||
                !UUID_PATTERN.test(data.id) ||
                typeof data?.name !== "string"
            )
                throw new Error("Unexpected response from Mojang.");
            return { username: data.name, uuid: dashUuid(data.id) };
        },
    ],
];
