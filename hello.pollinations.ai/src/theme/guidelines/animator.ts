/**
 * Background Generation Guidelines
 * Pure content - no logic, just prompt templates and guidelines
 */

export const BACKGROUND_GUIDELINES = `You generate a single self-contained HTML file that renders a very lightweight WebGL background using the Three.js library.

Purpose
- This runs behind a website UI as a calm, ambient background.
- It is NOT a game or interactive app.

Global visual theme: THE LIVING WEB
- The interconnected web of existence: mycelium networks connecting forests underground, 
  pollen drifting between flowers, neural pathways firing in consciousness, 
  blood vessels nourishing organs, coral polyps building reefs.
- Everything is interconnected. Every node is both receiver and transmitter.
- Beauty at every scale: from microscopic cell division to galactic filaments.
- You receive a text prompt {THEME_PROMPT} that describes the specific mood.

Hard rules
- Output exactly one complete HTML document: <!DOCTYPE html> … </html>, nothing else.
- Use Three.js as an ES module from a CDN (e.g. https://esm.sh/three) to avoid deprecation warnings.
- MUST use <script type="module"> and import * as THREE from '...'.
- Keep it minimal:
  - One fullscreen canvas + a small inline script.
  - No frameworks, no UI controls, no menus, no HUD, no score, no missions.
  - No audio, no networking, no external assets beyond Three.js (and optionally a Google Font).

Visual & motion guidelines
- The scene should feel alive—breathing, pulsing, growing—but never aggressive.
- Primary patterns: branching networks (mycelium, neurons, blood vessels, river deltas, lightning)
- Secondary elements: nodes/junctions where connections meet (synapses, intersections, blooms)
- Tertiary: floating particles (spores, pollen, plankton, dust motes in sunlight)
- Think: the quiet wonder of watching cells divide under a microscope, 
  fireflies synchronizing in a forest, bioluminescent waves on a night beach.
- Motion is slow and subtle:
  - No fast camera cuts, no explosions, no aggressive flickering.
  - Gentle camera drift or slight mouse-based parallax is OK.
- Use a mostly dark palette by default to keep future foreground text readable.
- Avoid pure white flashes or very bright full-screen flicker.

Technical constraints
- Use requestAnimationFrame for the render loop.
- Keep geometry and object counts low to stay performant on laptops and phones.
- Avoid heavy post-processing, physics engines, or complex custom shaders.
- Transparent Materials:
  - Set 'transparent: true' and 'depthWrite: false' to prevent z-fighting artifacts.
  - Do NOT set 'premultipliedAlpha: true' unless you are certain the renderer requires it (usually it causes errors).
- Animation Loop Safety:
  - Handle the case where 'time' is undefined in the first frame (e.g., if (!time) time = performance.now()).
  - Use origin-relative movement (e.g., position.copy(origin).add(offset)) instead of cumulative addition (position.add(offset)) to prevent floating point drift and NaN errors.
- Geometry Safety:
  - If updating geometry with 'setFromPoints', ensure the initial buffer size matches the maximum number of points you will ever set.
- Renderer Initialization:
  - Always call 'initRenderer()' before using the renderer instance.
- Respect prefers-reduced-motion: If it is enabled, render a mostly static scene (no or minimal animation).

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
- Do NOT set 'emissive' property on Basic materials (it does not exist and causes crashes).
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
