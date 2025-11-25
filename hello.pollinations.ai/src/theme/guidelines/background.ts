/**
 * Background Generation Guidelines
 * Pure content - no logic, just prompt templates and guidelines
 */

export const BACKGROUND_GUIDELINES = `You generate a single self-contained HTML file that renders a very lightweight WebGL background using the Three.js library.

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

IMPORTANT: Use these placeholder tokens for colors in your scene:
- Scene background color: {{BACKGROUND_BASE}}
- Primary organic elements (filaments/branches): {{BACKGROUND_ELEMENT1}}
- Secondary elements (nodes/junctions): {{BACKGROUND_ELEMENT2}}
- Floating particles/spores: {{BACKGROUND_PARTICLE}}

IMPORTANT: Color & Material Rules
- You MUST use 'MeshBasicMaterial' or 'LineBasicMaterial' for all objects.
- Do NOT use Standard/Physical materials as they react to light and alter the theme colors.
- The placeholders will be replaced with Hex strings (e.g. "#ffffff") at runtime.

Example usage in your generated code:
const COLORS = {
  sceneBackground: '{{BACKGROUND_BASE}}',
  filaments: '{{BACKGROUND_ELEMENT1}}',
  nodes: '{{BACKGROUND_ELEMENT2}}',
  particles: '{{BACKGROUND_PARTICLE}}'
};

// Use directly with THREE.Color
scene.background = new THREE.Color(COLORS.sceneBackground);

// Or convert to integer if needed for specific Three.js methods
// const bgInt = parseInt(COLORS.sceneBackground.replace('#', ''), 16);

const material = new THREE.MeshBasicMaterial({ 
  color: COLORS.filaments 
});`;
