import type { FigureData } from "./figure";

export type Rung = {
    id: string;
    radius: number;
    color: string;
    ink: string;
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
    /** Dramatic Italian intro line, spoken aloud on discovery. */
    catchphrase?: string;
    /** Cutout sprite + convex hull; circle physics when absent. */
    figure?: FigureData;
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

// Tricolore-leaning ladder: greens → creams → reds as tiers climb.
const LADDER_COLORS = [
    ["#7fbf6c", "#1d4a21"],
    ["#5ba85a", "#163d1c"],
    ["#9ecf8a", "#2c4515"],
    ["#e8dfc7", "#5d4a13"],
    ["#f0e6cf", "#5d3613"],
    ["#f3d9a8", "#594512"],
    ["#e8b07a", "#5d3613"],
    ["#dd8a66", "#641c1c"],
    ["#d66c5c", "#681f1f"],
    ["#c94f44", "#5e1414"],
    ["#b8312e", "#4f0e0e"],
] as const;

// Base ingredients, not finished characters: famous brainrot creatures are
// themselves hybrids (shark + sneakers, crocodile + bomber, ballerina +
// cappuccino), so character discovery happens through play.
export const BRAINROT_SEEDS: Specimen[] = [
    {
        name: "Squalo",
        description: "A great white shark dreaming of dry land.",
        imagePrompt: "a great white shark, full body side view",
    },
    {
        name: "Sneakers",
        description: "A pair of blue sneakers with nobody inside them.",
        imagePrompt: "a pair of blue sneakers, side view",
    },
    {
        name: "Cappuccino",
        description: "A foamy cappuccino that refuses to be decaf.",
        imagePrompt: "a cappuccino cup with thick milk foam",
    },
    {
        name: "Coccodrillo",
        description: "A crocodile with suspiciously big plans.",
        imagePrompt: "a green crocodile, full body side view",
    },
    {
        name: "Aereo",
        description: "A propeller airplane looking for a new body.",
        imagePrompt: "a vintage twin-propeller airplane, side view",
    },
    {
        name: "Banana",
        description: "A ripe banana of unusual confidence.",
        imagePrompt: "a single ripe yellow banana",
    },
    {
        name: "Scimmia",
        description: "A chimpanzee ready to fuse with anything.",
        imagePrompt: "a chimpanzee standing upright, full body",
    },
    {
        name: "Ballerina",
        description: "A ballerina spinning toward her destiny.",
        imagePrompt: "a ballerina in a tutu mid-pirouette, full body",
    },
];

export const RUNGS: Rung[] = SUIKA_RADII.map((radius, index) => ({
    id: `layer-${index + 1}`,
    radius,
    color: LADDER_COLORS[index]?.[0] ?? LADDER_COLORS[0][0],
    ink: LADDER_COLORS[index]?.[1] ?? LADDER_COLORS[0][1],
}));

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

/**
 * Uniform scale from figure sprite space to board space so the hull's area
 * equals the tier circle's area — shapes change how pieces rest and stack,
 * never how much board space a tier is worth.
 */
export function figureScale(radius: number, figure: FigureData) {
    return radius * Math.sqrt(Math.PI / figure.area);
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

export function createSeedSpecimen(): Specimen {
    return { ...sample(BRAINROT_SEEDS) };
}

export function createLoadingSpecimen(
    name: string,
    description: string,
): Specimen {
    return {
        name,
        description,
        imagePrompt: name,
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
    },
): GamePiece {
    const rung = RUNGS[tier] ?? RUNGS[0];
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
