export type LifeRung = {
    id: string;
    radius: number;
    color: string;
    ink: string;
};

export type LifePresetId = "bio" | "inventions" | "future" | "infinite";
export type LifePromptMode = "grounded" | "infinite-craft";

export type LifePreset = {
    id: LifePresetId;
    label: string;
    axis: string;
    evolutionPrompt: string;
    promptMode?: LifePromptMode;
    stylePrompt: string;
    seeds: Specimen[];
    rungs: LifeRung[];
};

export type LifeStylePresetId = "blueprint" | "risograph" | "ink-wash";

export type LifeStylePreset = {
    id: LifeStylePresetId;
    label: string;
    description: string;
    prompt: string;
};

export type LineageNode = {
    name: string;
    description: string;
    parents?: [LineageNode, LineageNode];
};

export type Specimen = {
    name: string;
    description: string;
    imagePrompt: string;
    imageUrl?: string;
    lineage?: LineageNode;
};

export type GamePiece = Specimen & {
    id: string;
    tier: number;
    radius: number;
    color: string;
    ink: string;
    x: number;
    y: number;
    angle: number;
    pending: boolean;
    generated: boolean;
    lineage: LineageNode;
    parents?: [string, string];
};

export type TierPhysics = {
    density: number;
    restitution: number;
    friction: number;
};

export const SUIKA_RADII = [
    16.5, 24, 30.5, 34.5, 44.5, 57, 64.5, 78, 88.5, 110, 129.5,
] as const;

const SUIKA_TIER_PHYSICS: TierPhysics[] = [
    { density: 0.82, restitution: 0.08, friction: 0.32 },
    { density: 0.86, restitution: 0.075, friction: 0.34 },
    { density: 0.9, restitution: 0.07, friction: 0.36 },
    { density: 0.94, restitution: 0.065, friction: 0.38 },
    { density: 0.98, restitution: 0.06, friction: 0.4 },
    { density: 1.02, restitution: 0.055, friction: 0.42 },
    { density: 1.06, restitution: 0.05, friction: 0.44 },
    { density: 1.1, restitution: 0.045, friction: 0.46 },
    { density: 1.14, restitution: 0.04, friction: 0.48 },
    { density: 1.18, restitution: 0.035, friction: 0.5 },
    { density: 1.22, restitution: 0.03, friction: 0.52 },
];

const LADDER_COLORS = [
    ["#89d17f", "#1d4a21"],
    ["#5ec7b2", "#164c44"],
    ["#61a6d8", "#173a58"],
    ["#d59755", "#5d3613"],
    ["#7bb24c", "#2c4515"],
    ["#b88a43", "#51380f"],
    ["#d1b14e", "#594512"],
    ["#c7668d", "#641c38"],
    ["#9d72d0", "#422264"],
    ["#4f7ed4", "#172c66"],
    ["#d66c9c", "#681f45"],
] as const;

export const BIO_SEEDS: Specimen[] = [
    {
        name: "Water",
        description: "A liquid medium where life can move and react.",
        imagePrompt: "a clear water droplet",
    },
    {
        name: "Sunlight",
        description: "Energy that helps green life grow.",
        imagePrompt: "a narrow beam of sunlight",
    },
    {
        name: "Mineral",
        description: "Nutrients and hard matter for living structures.",
        imagePrompt: "a small mineral crystal",
    },
    {
        name: "Air",
        description: "Gases for breathing, wind, and plant growth.",
        imagePrompt: "a clear air bubble",
    },
    {
        name: "Cell",
        description: "A tiny living unit that can grow and divide.",
        imagePrompt: "a simple living cell",
    },
    {
        name: "Spore",
        description: "A hardy start for fungi, mosses, and ferns.",
        imagePrompt: "a round biological spore",
    },
    {
        name: "Seed",
        description: "A protected plant start ready to root and grow.",
        imagePrompt: "a small plant seed",
    },
    {
        name: "Egg",
        description: "A protected animal start ready to develop.",
        imagePrompt: "a small animal egg",
    },
];

export const INVENTION_SEEDS: Specimen[] = [
    {
        name: "Stone",
        description: "A hard mass for edges, weight, and grinding.",
        imagePrompt: "a small worked stone blank",
    },
    {
        name: "Wood",
        description: "A light structural material for frames and levers.",
        imagePrompt: "a straight wooden stick",
    },
    {
        name: "Clay",
        description: "A moldable earth material for vessels and molds.",
        imagePrompt: "a small lump of clay",
    },
    {
        name: "Cord",
        description: "A flexible line for binding and tension.",
        imagePrompt: "a short coiled cord",
    },
    {
        name: "Metal",
        description: "A strong conductive material for parts and edges.",
        imagePrompt: "a small metal ingot",
    },
    {
        name: "Glass",
        description: "A clear hard material for lenses and containers.",
        imagePrompt: "a small clear glass shard",
    },
    {
        name: "Flame",
        description: "Controlled heat for shaping and power.",
        imagePrompt: "a small controlled flame",
    },
    {
        name: "Mark",
        description: "A deliberate sign for measuring and recording.",
        imagePrompt: "a single engraved notch",
    },
];

export const FUTURE_SEEDS: Specimen[] = [
    {
        name: "Energy",
        description: "Power that can move, compute, or transform.",
        imagePrompt: "a small glowing charge",
    },
    {
        name: "Signal",
        description: "A moving message that can be sent or received.",
        imagePrompt: "a simple radio wave signal",
    },
    {
        name: "Logic",
        description: "A simple rule for decisions and control.",
        imagePrompt: "a simple branching logic gate with no text",
    },
    {
        name: "Memory",
        description: "A trace that can store information.",
        imagePrompt: "a tiny memory crystal",
    },
    {
        name: "Light",
        description: "A beam for seeing, sensing, and communication.",
        imagePrompt: "a narrow focused light beam",
    },
    {
        name: "Molecule",
        description: "A tiny structure for materials and medicine.",
        imagePrompt: "a simple molecular cluster",
    },
    {
        name: "Cell",
        description: "A living unit that can sense, grow, and repair.",
        imagePrompt: "a simple living cell",
    },
    {
        name: "Magnet",
        description: "A force source for motion and electric systems.",
        imagePrompt: "a small horseshoe magnet",
    },
];

export const INFINITE_CRAFT_SEEDS: Specimen[] = [
    {
        name: "Fire",
        description: "Heat and flame that can burn, change, or power things.",
        imagePrompt: "a small bright flame",
    },
    {
        name: "Water",
        description: "A flowing liquid that can mix, cool, and shape things.",
        imagePrompt: "a clear water droplet",
    },
    {
        name: "Wind",
        description: "Moving air that can carry, erode, or stir things.",
        imagePrompt: "a simple curling gust of wind",
    },
    {
        name: "Earth",
        description: "Ground, soil, and stone that can hold and build things.",
        imagePrompt: "a small mound of earth and stone",
    },
];

function createRungs(): LifeRung[] {
    return SUIKA_RADII.map((radius, index) => ({
        id: `layer-${index + 1}`,
        radius,
        color: LADDER_COLORS[index]?.[0] ?? LADDER_COLORS[0][0],
        ink: LADDER_COLORS[index]?.[1] ?? LADDER_COLORS[0][1],
    }));
}

export const LIFE_PRESETS: LifePreset[] = [
    {
        id: "bio",
        label: "Bio",
        axis: "grow natural life and organic forms from simple seed materials",
        evolutionPrompt:
            "Create one natural biological result as a single emergent step from the two parents. Use real organisms, life stages, colonies, habitats, or ecosystems. Plain common nouns only.",
        stylePrompt:
            "natural-history specimen token, clear organic silhouette, biological field-guide clarity",
        seeds: BIO_SEEDS,
        rungs: createRungs(),
    },
    {
        id: "inventions",
        label: "Inventions",
        axis: "combine basic materials into useful human-made objects",
        evolutionPrompt:
            "Create one plausible human-made object as a single emergent step from the two parents. Build from material, structure, heat, tension, measurement, or signal. Plain common nouns only.",
        stylePrompt:
            "clean patent drawing token, simple engineered silhouette, visible material logic",
        seeds: INVENTION_SEEDS,
        rungs: createRungs(),
    },
    {
        id: "future",
        label: "Future",
        axis: "move each merge one step toward future technology",
        evolutionPrompt:
            "Create one plausible future artifact as a single emergent step from the two parents. Advance one capability: sense, store, compute, transmit, power, actuate, repair, grow, or shield. Concrete common nouns only.",
        stylePrompt:
            "minimal future-lab token, precise luminous edges, clean readable technology icon",
        seeds: FUTURE_SEEDS,
        rungs: createRungs(),
    },
    {
        id: "infinite",
        label: "Infinite Craft",
        axis: "combine anything from fire, water, wind, and earth",
        promptMode: "infinite-craft",
        evolutionPrompt:
            "Create one surprising Infinite Craft-style result from the two parents. The order does not matter. The result can be a thing, material, place, person, creature, event, concept, technology, food, culture, or natural phenomenon.",
        stylePrompt:
            "clean playful alchemy token, bold readable symbol, simple iconic silhouette",
        seeds: INFINITE_CRAFT_SEEDS,
        rungs: createRungs(),
    },
];

export const DEFAULT_PRESET = LIFE_PRESETS[0];
export const LIFE_RUNGS = DEFAULT_PRESET.rungs;

export const LIFE_STYLE_PRESETS: LifeStylePreset[] = [
    {
        id: "blueprint",
        label: "Blueprint",
        description: "White contour on a tier-tinted technical ground.",
        prompt: "blueprint cyanotype game token, white continuous-line illustration, fine technical grid, single tier-colored circular ground, crisp small icon, no text",
    },
    {
        id: "risograph",
        label: "Risograph",
        description: "Two-color overprint with warm grain and soft offsets.",
        prompt: "two-color risograph game token, warm coral and deep teal overprint, slight misregistration, grainy texture, bold flat shapes, circular icon, no text",
    },
    {
        id: "ink-wash",
        label: "Ink Wash",
        description: "Minimal sumi-e brushwork on warm tinted paper.",
        prompt: "minimal sumi-e ink wash game token, one expressive brushstroke, monochrome ink on warm tier-tinted paper, soft wash texture, circular icon, no text",
    },
];

export const DEFAULT_STYLE_PRESET = LIFE_STYLE_PRESETS[0];

const SVG_ENTITIES: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
};

export function createId(prefix = "piece") {
    if (globalThis.crypto?.randomUUID) {
        return `${prefix}-${globalThis.crypto.randomUUID()}`;
    }
    return `${prefix}-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2)}`;
}

export function sample<T>(items: readonly T[]): T {
    return items[Math.floor(Math.random() * items.length)] ?? items[0];
}

export function tierPhysics(tier: number) {
    const index = Math.min(Math.max(0, tier), SUIKA_TIER_PHYSICS.length - 1);
    return SUIKA_TIER_PHYSICS[index] ?? SUIKA_TIER_PHYSICS[0];
}

export function escapeSvgText(value: string) {
    return value.replace(/[&<>"']/g, (match) => SVG_ENTITIES[match] ?? match);
}

export function lineageLeaf(specimen: Specimen): LineageNode {
    return {
        name: specimen.name,
        description: specimen.description,
    };
}

export function mergeLineage(
    specimen: Specimen,
    parents: [GamePiece, GamePiece],
): LineageNode {
    return {
        name: specimen.name,
        description: specimen.description,
        parents: [parents[0].lineage, parents[1].lineage],
    };
}

export function placeholderImageUrl(
    rung: LifeRung,
    name: string,
    style: LifeStylePreset = DEFAULT_STYLE_PRESET,
) {
    const safeName = escapeSvgText(name);
    const title = `<title>${safeName}</title>`;
    const blueprint = `<rect width="256" height="256" rx="128" fill="${rung.color}"/><g stroke="#f6fbff" stroke-width="1" opacity=".24"><path d="M32 64h192M32 112h192M32 160h192M64 32v192M112 32v192M160 32v192M208 32v192"/><circle cx="128" cy="128" r="96" fill="none"/></g><path d="M54 154c23-55 72-82 135-49 21 20 17 50-11 69-39 27-91 20-124-20Z" fill="none" stroke="#f6fbff" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/><path d="M93 97c18 22 25 49 20 83M154 86c-10 32-6 63 12 91" fill="none" stroke="#f6fbff" stroke-width="6" stroke-linecap="round" opacity=".72"/>`;
    const risograph = `<defs><filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="table" tableValues="0 .18"/></feComponentTransfer></filter></defs><rect width="256" height="256" rx="128" fill="${rung.color}"/><circle cx="127" cy="130" r="108" fill="#fff1cb" opacity=".3"/><path d="M50 158c31-62 84-86 153-52-22 48-64 78-116 78-14 0-27-5-37-26Z" fill="#ef6f5e" opacity=".82"/><path d="M59 143c31-56 83-73 139-39-17 44-51 73-99 79-27 3-43-13-40-40Z" fill="#006d77" opacity=".78" transform="translate(7 -5)"/><path d="M76 133c39 13 78 8 116-16M98 96c10 34 6 62-12 88M156 97c-9 31-4 55 16 74" fill="none" stroke="#173a58" stroke-width="7" stroke-linecap="round" opacity=".62"/><rect width="256" height="256" filter="url(#grain)" opacity=".65"/>`;
    const inkWash = `<defs><filter id="soft"><feGaussianBlur stdDeviation="2.2"/></filter></defs><rect width="256" height="256" rx="128" fill="#f5ead7"/><circle cx="128" cy="128" r="116" fill="${rung.color}" opacity=".34"/><path d="M48 153c27-57 84-94 159-50-21 60-97 93-159 50Z" fill="${rung.ink}" opacity=".18" filter="url(#soft)"/><path d="M52 154c30-56 84-86 150-52-18 46-54 74-101 78" fill="none" stroke="${rung.ink}" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/><path d="M94 99c20 28 22 57 0 86M154 95c-10 23-6 45 12 69" fill="none" stroke="${rung.ink}" stroke-width="8" stroke-linecap="round" opacity=".72"/><circle cx="76" cy="76" r="22" fill="${rung.ink}" opacity=".08"/><circle cx="181" cy="181" r="34" fill="${rung.ink}" opacity=".06"/>`;
    const body =
        style.id === "risograph"
            ? risograph
            : style.id === "ink-wash"
              ? inkWash
              : blueprint;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">${title}${body}</svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function createSeedSpecimen(
    rungs: LifeRung[] = LIFE_RUNGS,
    style: LifeStylePreset = DEFAULT_STYLE_PRESET,
    seeds: Specimen[] = DEFAULT_PRESET.seeds,
): Specimen {
    const rung = rungs[0] ?? LIFE_RUNGS[0];
    const seed = sample(seeds);
    return {
        ...seed,
        imageUrl: placeholderImageUrl(rung, seed.name, style),
    };
}

export function createLoadingSpecimen(
    rung: LifeRung,
    name: string,
    description: string,
    style: LifeStylePreset = DEFAULT_STYLE_PRESET,
): Specimen {
    return {
        name,
        description,
        imagePrompt: `${style.prompt}, ${name}, centered circular game token, no text`,
        imageUrl: placeholderImageUrl(rung, name, style),
    };
}

export function createGamePiece(
    tier: number,
    options: {
        id?: string;
        specimen: Specimen;
        parents?: [string, string];
        pending?: boolean;
        generated?: boolean;
        x?: number;
        y?: number;
        angle?: number;
        style?: LifeStylePreset;
    },
    rungs: LifeRung[] = LIFE_RUNGS,
): GamePiece {
    const rung = rungs[tier] ?? rungs[0] ?? LIFE_RUNGS[0];
    const lineage = options.specimen.lineage ?? lineageLeaf(options.specimen);
    return {
        ...options.specimen,
        id: options.id ?? createId(rung.id),
        lineage,
        tier,
        radius: rung.radius,
        color: rung.color,
        ink: rung.ink,
        x: options.x ?? 0,
        y: options.y ?? 0,
        angle: options.angle ?? 0,
        pending: options.pending ?? false,
        generated: options.generated ?? false,
        parents: options.parents,
    };
}
