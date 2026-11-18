import { z } from "zod";
import { fetchJson } from "../fetch.js";

function normalizeHex(input) {
    const cleaned = String(input ?? "")
        .trim()
        .replace(/^#/, "");
    if (!/^[0-9a-fA-F]{3}$/.test(cleaned) && !/^[0-9a-fA-F]{6}$/.test(cleaned))
        throw new Error(
            "hex must be a 3- or 6-digit hex color, like 0047AB or #0047AB.",
        );
    const expanded =
        cleaned.length === 3
            ? [...cleaned].map((c) => c + c).join("")
            : cleaned;
    return expanded.toUpperCase();
}

export const colorNameTools = [
    [
        "color_name",
        "Name a hex color using The Color API: give it a hex code and it returns the closest named color (0047AB is Cobalt), whether it is an exact named match, the closest named hex and the distance to it, plus the rgb and hsl values and a contrast color. This is the naming tool — color_convert answers hex-to-rgb conversion, and check_contrast and rank_palette answer contrast and palette questions.",
        {
            hex: z.string().trim().min(1).max(7),
        },
        async ({ hex }) => {
            const clean = normalizeHex(hex);
            const data = await fetchJson(
                `https://www.thecolorapi.com/id?hex=${clean}`,
            );
            if (!data?.name?.value || typeof data?.rgb?.r !== "number")
                throw new Error(`No color found for hex ${clean}.`);
            return {
                hex: data.hex?.value ?? `#${clean}`,
                name: data.name.value,
                exact_match: data.name.exact_match_name === true,
                closest_named_hex: data.name.closest_named_hex ?? null,
                distance: data.name.distance ?? null,
                rgb: data.rgb.value,
                hsl: data.hsl?.value,
                contrast: data.contrast?.value ?? null,
            };
        },
    ],
];
