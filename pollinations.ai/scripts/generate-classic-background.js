/**
 * Generate Classic Theme Background
 * One-time script to generate WebGL background for the classic preset
 */

async function generateText(prompt, seed, model) {
    const url = `https://text.pollinations.ai/${encodeURIComponent(prompt)}?seed=${seed}&model=${model}`;
    const response = await fetch(url);
    return await response.text();
}

const BACKGROUND_GUIDELINES = `You generate a single self-contained HTML file that renders a very lightweight WebGL background using the Three.js library.

Purpose
- This runs behind a website UI as a calm, ambient background.
- It is NOT a game or interactive app.

Global visual theme
- Organic symbiosis, pollination, mycelium networks, organism interaction, biosphere, biology, and science.
- You also receive a text prompt {THEME_PROMPT} that describes the specific mood (e.g. "luminous underground mycelium network", "swarming pollinators in a sunrise meadow").

Hard rules
- Output exactly one complete HTML document: <!DOCTYPE html> … </html>, nothing else.
- Use Three.js as an ES module from a CDN (e.g. https://esm.sh/three) to avoid deprecation warnings.
- MUST use <script type="module"> and import * as THREE from '...'.
- Keep it minimal:
  - One fullscreen canvas + a small inline script.
  - No frameworks, no UI controls, no menus, no HUD, no score, no missions.
  - No audio, no networking, no external assets beyond Three.js (and optionally a Google Font).

Visual & motion guidelines
- Scene must feel organic and alive, inspired by {THEME_PROMPT} and the biology theme:
  - Examples: branching mycelium filaments, drifting spores, softly glowing particles, cell-like orbs, flowing networks.
- Motion is slow and subtle:
  - No fast camera cuts, no explosions, no aggressive flickering.
  - Gentle camera drift or slight mouse-based parallax is OK.
- Use a mostly dark palette by default to keep future foreground text readable.
- Avoid pure white flashes or very bright full-screen flicker.

Technical constraints
- Use requestAnimationFrame for the render loop.
- Keep geometry and object counts low to stay performant on laptops and phones.
- Avoid heavy post-processing, physics engines, or complex custom shaders.
- Material blending: If using MultiplyBlending, AdditiveBlending, or SubtractiveBlending, you MUST set material.premultipliedAlpha = true to avoid console errors.
- Respect prefers-reduced-motion:
  - If it is enabled, render a mostly static scene (no or minimal animation).

Structure
- <body> contains only:
  - the background canvas/container for Three.js
  - an optional tiny overlay label like "pollinations.ai background" (no buttons or controls).
- Use a few small, clear functions (e.g. initScene, initRenderer, createOrganicElements, animate).
- Comment only when it clarifies something non-obvious.

Return ONLY the final HTML document, with no explanations or markdown.

IMPORTANT: Use these exact colors in your scene:
- Background color: {BACKGROUND_COLOR}
- Primary colors for particles/elements: {PRIMARY_COLORS}
- Use these colors to maintain visual consistency with the website theme.`;

const CLASSIC_COLORS = {
    backgroundColor: "#C7D4D6", // surface.base (grayLight)
    primaryColors: ["#FF69B4", "#ECF874", "#74F8EC"], // pink, yellow, cyan
};

async function main() {
    console.log("🎨 Generating Classic Theme Background...\n");
    console.log('Theme Prompt: "classic"');
    console.log("Background Color:", CLASSIC_COLORS.backgroundColor);
    console.log("Primary Colors:", CLASSIC_COLORS.primaryColors.join(", "));
    console.log("\nGenerating... (this may take 10-30 seconds)\n");

    try {
        const fullPrompt = BACKGROUND_GUIDELINES.replace(
            "{THEME_PROMPT}",
            "classic",
        )
            .replace("{BACKGROUND_COLOR}", CLASSIC_COLORS.backgroundColor)
            .replace(
                "{PRIMARY_COLORS}",
                CLASSIC_COLORS.primaryColors.join(", "),
            );

        const html = await generateText(fullPrompt, 42, "openai");

        // Clean up markdown code blocks if present
        let cleanHtml = html.trim();
        cleanHtml = cleanHtml.replace(/^```html?\n?/i, "");
        cleanHtml = cleanHtml.replace(/\n?```$/, "");

        console.log("✅ Background generated successfully!");
        console.log("\nGenerated HTML length:", cleanHtml.length, "characters");
        console.log(
            "\nCopy the output below and add it to src/content/presets/classic.ts",
        );
        console.log("as: export const ClassicBackgroundHtml = `...`;");
        console.log("\n" + "=".repeat(80));
        console.log(cleanHtml);
        console.log("=".repeat(80));
    } catch (error) {
        console.error("❌ Error generating background:", error);
        process.exit(1);
    }
}

main();
