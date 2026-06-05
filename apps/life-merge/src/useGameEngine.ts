import {
    Bodies,
    Body,
    Composite,
    Engine,
    Events,
    type IEventCollision,
    Runner,
} from "matter-js";
import {
    type PointerEvent as ReactPointerEvent,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { generateImageSpecimen, generateSpecimen } from "./generation";
import {
    createGamePiece,
    createLoadingSpecimen,
    createSeedSpecimen,
    DEFAULT_PRESET,
    DEFAULT_STYLE_PRESET,
    type GamePiece,
    LIFE_PRESETS,
    LIFE_STYLE_PRESETS,
    type LifePreset,
    type LifePresetId,
    type LifeStylePreset,
    type LifeStylePresetId,
    type LineageNode,
    mergeLineage,
    type Specimen,
    sample,
    tierPhysics,
} from "./life";
import { useQueryParam } from "./useQueryParam";

// Board geometry is owned here (the engine logic and the board <div> both read
// it). App.tsx imports the JSX-facing constants from this module so the import
// graph stays one-directional (App.tsx -> useGameEngine).
const BOARD_LOGICAL_SIZE = { width: 600, height: 900 };
const BOARD_FALLBACK = BOARD_LOGICAL_SIZE;
export const BOARD_ASPECT_RATIO = `${BOARD_LOGICAL_SIZE.width} / ${BOARD_LOGICAL_SIZE.height}`;
export const BOARD_MAX_WIDTH = `${BOARD_LOGICAL_SIZE.width}px`;
export const BOARD_WIDTH_FROM_HEIGHT = `calc(var(--board-max-height) * ${
    BOARD_LOGICAL_SIZE.width / BOARD_LOGICAL_SIZE.height
})`;
export const LOSS_LINE = 100;
export const DROP_Y = 70;
const MAX_PIECES = 50;

const PRESET_IDS = LIFE_PRESETS.map((preset) => preset.id);

// Each world owns its visual style — there is no separate style picker.
// (Kept here rather than on the LifePreset data so the preset registry in
// life.ts stays purely content; this is the engine's presentation policy.)
const PRESET_STYLE: Record<LifePresetId, LifeStylePresetId> = {
    bio: "blueprint",
    inventions: "risograph",
    future: "ink-wash",
};

function styleForPresetId(presetId: LifePresetId): LifeStylePreset {
    const id = PRESET_STYLE[presetId];
    return (
        LIFE_STYLE_PRESETS.find((style) => style.id === id) ??
        DEFAULT_STYLE_PRESET
    );
}

type PieceBody = Body & { plugin: { pieceId: string } };

export type GenerationResult = {
    name: string;
    description: string;
    imageUrl?: string;
};

export type GenerationFocus = {
    id: string;
    parents: [GamePiece, GamePiece];
    targetLabel: string;
    status: "generating" | "cached" | "result";
    result?: GenerationResult;
};

// What the inspector card shows: the focused piece's icon + identity + its
// lineage (the recursive tree is currently hidden in the UI but kept here).
export type SelectedView = {
    name: string;
    description: string;
    imageUrl?: string;
    color: string;
    ink: string;
    lineage: LineageNode;
};

function toSelectedView(
    piece: Pick<
        GamePiece,
        "name" | "description" | "imageUrl" | "color" | "ink" | "lineage"
    >,
): SelectedView {
    return {
        name: piece.name,
        description: piece.description,
        imageUrl: piece.imageUrl,
        color: piece.color,
        ink: piece.ink,
        lineage: piece.lineage,
    };
}

export type PresetEdit = {
    evolutionPrompt: string;
    stylePrompt: string;
    seedsText: string;
};

export type PresetEdits = Record<LifePresetId, PresetEdit>;

function seedLine(specimen: Specimen) {
    return [specimen.name, specimen.description, specimen.imagePrompt].join(
        " | ",
    );
}

function initialPresetEdits(): PresetEdits {
    return Object.fromEntries(
        LIFE_PRESETS.map((preset) => [
            preset.id,
            {
                evolutionPrompt: preset.evolutionPrompt,
                stylePrompt: preset.stylePrompt,
                seedsText: preset.seeds.map(seedLine).join("\n"),
            },
        ]),
    ) as PresetEdits;
}

function parseSeeds(text: string, defaultSeeds: Specimen[]): Specimen[] {
    const seeds = text
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line): Specimen | null => {
            const [name, description, imagePrompt] = line
                .split("|")
                .map((part) => part.trim());
            if (!name || !description) return null;
            return {
                name,
                description,
                imagePrompt: imagePrompt || name,
            } satisfies Specimen;
        })
        .filter((seed): seed is Specimen => Boolean(seed));
    return seeds.length > 0 ? seeds : defaultSeeds;
}

function editPreset(base: LifePreset, edit: PresetEdit): LifePreset {
    return {
        ...base,
        evolutionPrompt: edit.evolutionPrompt.trim() || base.evolutionPrompt,
        stylePrompt: edit.stylePrompt.trim(),
        seeds: parseSeeds(edit.seedsText, base.seeds),
    };
}

function composeStyle(
    style: LifeStylePreset,
    preset: Pick<LifePreset, "stylePrompt">,
): LifeStylePreset {
    return {
        ...style,
        prompt: [style.prompt, preset.stylePrompt].filter(Boolean).join(", "),
    };
}

export type GameEngine = ReturnType<typeof useGameEngine>;

export function useGameEngine({
    apiKey,
    isLoggedIn,
    isHydrated,
}: {
    apiKey: string | null;
    isLoggedIn: boolean;
    isHydrated: boolean;
}) {
    const boardRef = useRef<HTMLDivElement | null>(null);
    const engineRef = useRef<Engine | null>(null);
    const runnerRef = useRef<Runner | null>(null);
    const wallsRef = useRef<Body[]>([]);
    const bodiesRef = useRef<Map<string, Body>>(new Map());
    const piecesRef = useRef<GamePiece[]>([]);
    const mergingIdsRef = useRef<Set<string>>(new Set());
    const objectUrlsRef = useRef<Set<string>>(new Set());
    const apiKeyRef = useRef<string | null>(apiKey);
    const boardSizeRef = useRef(BOARD_FALLBACK);
    const highestTierRef = useRef(0);
    const hasStartedRef = useRef(false);
    // Whether the player has explicitly chosen a world (vs. the default that
    // stands in internally). Gates starting the game.
    const presetChosenRef = useRef(false);
    const presetIdRef = useRef<LifePresetId>(DEFAULT_PRESET.id);
    const presetRef = useRef<LifePreset>(DEFAULT_PRESET);
    const rungsRef = useRef(DEFAULT_PRESET.rungs);
    const styleIdRef = useRef<LifeStylePresetId>(
        PRESET_STYLE[DEFAULT_PRESET.id],
    );
    const styleRef = useRef(
        composeStyle(styleForPresetId(DEFAULT_PRESET.id), DEFAULT_PRESET),
    );
    const generatedPoolRef = useRef<Map<string, Specimen[]>>(new Map());
    const generatedCacheRef = useRef<Map<string, Specimen>>(new Map());
    const nextPieceRef = useRef<GamePiece>(
        createGamePiece(
            0,
            {
                specimen: createSeedSpecimen(
                    DEFAULT_PRESET.rungs,
                    composeStyle(
                        styleForPresetId(DEFAULT_PRESET.id),
                        DEFAULT_PRESET,
                    ),
                    DEFAULT_PRESET.seeds,
                ),
            },
            DEFAULT_PRESET.rungs,
        ),
    );
    const mergePieceRef = useRef<(leftId: string, rightId: string) => void>(
        () => undefined,
    );

    const [boardSize, setBoardSize] = useState(BOARD_FALLBACK);
    const [pieces, setPieces] = useState<GamePiece[]>([]);
    const [nextPiece, setNextPiece] = useState<GamePiece>(nextPieceRef.current);
    const [aimX, setAimX] = useState(BOARD_FALLBACK.width / 2);
    const [score, setScore] = useState(0);
    const [highestTier, setHighestTier] = useState(0);
    const [hasStarted, setHasStarted] = useState(false);
    // The URL is the source of truth: no `?preset=` means nothing chosen yet
    // (start screen). Picking a world writes the param.
    const [presetId, setPresetId] = useQueryParam<LifePresetId>(
        "preset",
        PRESET_IDS,
    );
    // Presets are no longer editable at runtime (the dev editor was removed),
    // so these are effectively constant — just a stable per-preset base.
    const [presetEdits] = useState<PresetEdits>(initialPresetEdits);
    const [generatedPoolSize, setGeneratedPoolSize] = useState(0);
    const [lastEvent, setLastEvent] = useState("Choose a world to begin.");
    const [isCrowded, setIsCrowded] = useState(false);
    const [peakName, setPeakName] = useState("Seeds");
    // The most-recently created/changed piece — its label is revealed briefly
    // so you can read what just landed/merged without hovering.
    const [activeLabelId, setActiveLabelId] = useState<string | null>(null);
    const [generationFocus, setGenerationFocus] =
        useState<GenerationFocus | null>(null);
    // The piece the inspector is focused on: its icon, name, description and
    // lineage. Hovering/tapping a board piece or legend row updates it.
    const [selectedView, setSelectedView] = useState<SelectedView>(() =>
        toSelectedView(nextPieceRef.current),
    );

    // Internally we always resolve to a concrete preset (the default stands in
    // before the player has chosen) so the inert placeholder seed and refs are
    // well-defined; `presetId` itself stays nullable for the UI.
    const resolvedPresetId = presetId ?? DEFAULT_PRESET.id;
    const basePreset = useMemo(
        () =>
            LIFE_PRESETS.find((preset) => preset.id === resolvedPresetId) ??
            DEFAULT_PRESET,
        [resolvedPresetId],
    );
    const activePreset = useMemo(
        () => editPreset(basePreset, presetEdits[resolvedPresetId]),
        [basePreset, presetEdits, resolvedPresetId],
    );
    const activeStyle = useMemo(
        () => styleForPresetId(resolvedPresetId),
        [resolvedPresetId],
    );
    const promptStyle = useMemo(
        () => composeStyle(activeStyle, activePreset),
        [activePreset, activeStyle],
    );
    const rungs = activePreset.rungs;
    const pendingBoardGenerations = pieces.filter(
        (piece) => piece.pending,
    ).length;
    const activeGenerations =
        pendingBoardGenerations + (nextPiece.pending ? 1 : 0);
    const canUseAi = isHydrated && isLoggedIn && Boolean(apiKey);
    const canDrop =
        canUseAi &&
        hasStarted &&
        activeGenerations === 0 &&
        nextPiece.generated &&
        !isCrowded;
    const gameWon = highestTier >= rungs.length - 1;

    useEffect(() => {
        apiKeyRef.current = apiKey;
    }, [apiKey]);

    useEffect(() => {
        highestTierRef.current = highestTier;
    }, [highestTier]);

    useEffect(() => {
        presetChosenRef.current = presetId !== null;
        presetIdRef.current = resolvedPresetId;
        presetRef.current = activePreset;
        rungsRef.current = rungs;
        styleIdRef.current = activeStyle.id;
        styleRef.current = promptStyle;
    }, [
        activePreset,
        presetId,
        resolvedPresetId,
        rungs,
        activeStyle,
        promptStyle,
    ]);

    useEffect(() => {
        if (!activeLabelId) return undefined;
        const timeout = window.setTimeout(() => setActiveLabelId(null), 4000);
        return () => window.clearTimeout(timeout);
    }, [activeLabelId]);

    const setPieceList = (nextPieces: GamePiece[]) => {
        piecesRef.current = nextPieces;
        setPieces(nextPieces);
        setIsCrowded(nextPieces.length >= MAX_PIECES);
    };

    const addWalls = useCallback((width: number, height: number) => {
        const engine = engineRef.current;
        if (!engine) return;
        if (wallsRef.current.length > 0) {
            Composite.remove(engine.world, wallsRef.current);
        }
        const wallOptions = {
            isStatic: true,
            friction: 0.18,
            render: { visible: false },
        };
        const walls = [
            Bodies.rectangle(
                width / 2,
                height + 30,
                width + 80,
                60,
                wallOptions,
            ),
            Bodies.rectangle(-30, height / 2, 60, height + 160, wallOptions),
            Bodies.rectangle(
                width + 30,
                height / 2,
                60,
                height + 160,
                wallOptions,
            ),
        ];
        wallsRef.current = walls;
        Composite.add(engine.world, walls);
    }, []);

    useEffect(() => {
        const engine = Engine.create();
        engine.gravity.y = 1.15;
        engineRef.current = engine;
        addWalls(BOARD_FALLBACK.width, BOARD_FALLBACK.height);

        const runner = Runner.create();
        runnerRef.current = runner;
        Runner.run(runner, engine);

        const onCollision = (event: IEventCollision<Engine>) => {
            for (const pair of event.pairs) {
                const leftId = (pair.bodyA as PieceBody).plugin?.pieceId;
                const rightId = (pair.bodyB as PieceBody).plugin?.pieceId;
                if (!leftId || !rightId || leftId === rightId) continue;
                mergePieceRef.current(leftId, rightId);
            }
        };

        Events.on(engine, "collisionStart", onCollision);

        let animationFrame = 0;
        const syncFrame = () => {
            const nextPieces = piecesRef.current.map((piece) => {
                const body = bodiesRef.current.get(piece.id);
                if (!body) return piece;
                return {
                    ...piece,
                    x: body.position.x,
                    y: body.position.y,
                    angle: body.angle,
                };
            });
            piecesRef.current = nextPieces;
            setPieces(nextPieces);
            setIsCrowded(nextPieces.length >= MAX_PIECES);
            animationFrame = requestAnimationFrame(syncFrame);
        };
        animationFrame = requestAnimationFrame(syncFrame);

        return () => {
            cancelAnimationFrame(animationFrame);
            Events.off(engine, "collisionStart", onCollision);
            Runner.stop(runner);
            Composite.clear(engine.world, false);
            Engine.clear(engine);
            for (const url of objectUrlsRef.current) URL.revokeObjectURL(url);
            objectUrlsRef.current.clear();
            bodiesRef.current.clear();
            piecesRef.current = [];
        };
    }, [addWalls]);

    useEffect(() => {
        const node = boardRef.current;
        if (!node) return;
        const observer = new ResizeObserver(([entry]) => {
            const width = Math.max(320, Math.floor(entry.contentRect.width));
            const height = Math.max(460, Math.floor(entry.contentRect.height));
            const nextSize = { width, height };
            boardSizeRef.current = nextSize;
            setBoardSize(nextSize);
            setAimX((current) => Math.min(Math.max(current, 44), width - 44));
            addWalls(width, height);
        });
        observer.observe(node);
        return () => observer.disconnect();
    }, [addWalls]);

    const addPieceToWorld = (piece: GamePiece, x: number, y: number) => {
        const engine = engineRef.current;
        if (!engine) return;
        const physics = tierPhysics(piece.tier);
        const body = Bodies.circle(x, y, piece.radius, {
            restitution: physics.restitution,
            friction: physics.friction,
            frictionAir: 0.01,
            density: 0.0016 * physics.density,
            label: "life-piece",
        }) as PieceBody;
        body.plugin = { pieceId: piece.id };
        Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.03);
        Body.setVelocity(body, { x: (Math.random() - 0.5) * 0.5, y: 0 });
        bodiesRef.current.set(piece.id, body);
        Composite.add(engine.world, body);
        setPieceList([
            ...piecesRef.current,
            {
                ...piece,
                x,
                y,
                angle: body.angle,
            },
        ]);
    };

    const removePieceFromWorld = (pieceId: string) => {
        const engine = engineRef.current;
        const body = bodiesRef.current.get(pieceId);
        if (engine && body) Composite.remove(engine.world, body);
        bodiesRef.current.delete(pieceId);
    };

    // Focus the inspector on a piece (no label reveal) — used on hover.
    const selectPiece = (
        piece: Pick<
            GamePiece,
            "name" | "description" | "imageUrl" | "color" | "ink" | "lineage"
        >,
    ) => {
        setSelectedView(toSelectedView(piece));
    };

    // Reveal a piece: briefly show its board label AND focus the inspector on
    // it. Used for fresh discoveries and deliberate taps/clicks.
    const showDiscovery = (
        piece: Pick<
            GamePiece,
            | "id"
            | "name"
            | "description"
            | "imageUrl"
            | "color"
            | "ink"
            | "lineage"
        >,
    ) => {
        setActiveLabelId(piece.id);
        setSelectedView(toSelectedView(piece));
    };

    const generatedPoolCount = () =>
        Array.from(generatedPoolRef.current.values()).reduce(
            (total, pool) => total + pool.length,
            0,
        );

    const rememberObjectUrl = (specimen: Specimen) => {
        if (specimen.imageUrl?.startsWith("blob:")) {
            objectUrlsRef.current.add(specimen.imageUrl);
        }
    };

    const applyGeneratedSpecimen = (
        pieceId: string,
        specimen: Specimen,
        targetTier: number,
    ) => {
        if (nextPieceRef.current.id === pieceId) {
            const updated: GamePiece = {
                ...nextPieceRef.current,
                ...specimen,
                lineage: specimen.lineage ?? nextPieceRef.current.lineage,
                pending: false,
                generated: true,
            };
            nextPieceRef.current = updated;
            setNextPiece(updated);
        }

        if (piecesRef.current.some((piece) => piece.id === pieceId)) {
            setPieceList(
                piecesRef.current.map((piece) =>
                    piece.id === pieceId
                        ? {
                              ...piece,
                              ...specimen,
                              lineage: specimen.lineage ?? piece.lineage,
                              pending: false,
                              generated: true,
                          }
                        : piece,
                ),
            );
        }

        if (targetTier > 0 && targetTier >= highestTierRef.current) {
            setPeakName(specimen.name);
        }
    };

    const hydrateSeedPiece = async (piece: GamePiece) => {
        const apiKey = apiKeyRef.current;
        if (!apiKey) {
            setLastEvent("Authorize to generate the first seed.");
            return;
        }

        if (nextPieceRef.current.id === piece.id) {
            const pendingPiece = { ...nextPieceRef.current, pending: true };
            nextPieceRef.current = pendingPiece;
            setNextPiece(pendingPiece);
        }

        const cacheKey = [
            presetIdRef.current,
            styleIdRef.current,
            "seed",
            piece.name.toLowerCase(),
        ].join(":");
        const cached = generatedCacheRef.current.get(cacheKey);
        if (cached) {
            const enriched = {
                ...cached,
                lineage: piece.lineage,
            };
            applyGeneratedSpecimen(piece.id, enriched, piece.tier);
            setLastEvent(`${cached.name} is ready.`);
            showDiscovery({ ...piece, ...enriched });
            return;
        }

        try {
            const generated = await generateImageSpecimen({
                apiKey,
                specimen: {
                    name: piece.name,
                    description: piece.description,
                    imagePrompt: piece.imagePrompt,
                },
                style: styleRef.current,
                targetRung: rungsRef.current[piece.tier],
            });
            rememberObjectUrl(generated);
            generatedCacheRef.current.set(cacheKey, generated);
            const enriched = {
                ...generated,
                lineage: piece.lineage,
            };
            applyGeneratedSpecimen(piece.id, enriched, piece.tier);
            setLastEvent(`${generated.name} is ready.`);
            showDiscovery({ ...piece, ...enriched });
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "Generation failed.";
            if (nextPieceRef.current.id === piece.id) {
                const stoppedPiece = {
                    ...nextPieceRef.current,
                    pending: false,
                    generated: false,
                };
                nextPieceRef.current = stoppedPiece;
                setNextPiece(stoppedPiece);
            }
            setLastEvent(`Generation failed: ${message}`);
        }
    };

    // The first seed is no longer generated eagerly on auth — it waits for
    // the player's first board click (startGame), so preset choice drives it.

    const createNextDrop = (currentHighestTier = highestTierRef.current) => {
        const maxSpawnTier = Math.min(4, Math.max(0, currentHighestTier));
        const availableTiers = [0];
        for (let tier = 1; tier <= maxSpawnTier; tier += 1) {
            const pool =
                generatedPoolRef.current.get(
                    `${presetIdRef.current}:${styleIdRef.current}:${tier}`,
                ) ?? [];
            if (pool.length > 0) availableTiers.push(tier);
        }
        const tier = sample(availableTiers);
        const pool =
            generatedPoolRef.current.get(
                `${presetIdRef.current}:${styleIdRef.current}:${tier}`,
            ) ?? [];
        const specimen =
            tier === 0
                ? createSeedSpecimen(
                      rungsRef.current,
                      styleRef.current,
                      presetRef.current.seeds,
                  )
                : sample(pool);
        const piece = createGamePiece(
            tier,
            {
                specimen,
                generated: tier > 0,
            },
            rungsRef.current,
        );
        nextPieceRef.current = piece;
        setNextPiece(piece);
        if (piecesRef.current.length === 0) {
            selectPiece(piece);
        }
        // Don't generate the seed image until the player has started — the
        // first seed is generated by startGame() so the chosen preset drives
        // it. Mid-game tier-0 refills still hydrate normally.
        if (tier === 0 && hasStartedRef.current) void hydrateSeedPiece(piece);
    };

    const hasPendingGeneration = () =>
        nextPieceRef.current.pending ||
        piecesRef.current.some((piece) => piece.pending);

    // First board click: lock in the chosen preset and generate the first
    // seed from it. The seed appears at the top to aim; the next click drops.
    const startGame = () => {
        if (hasStartedRef.current) return;
        if (!presetChosenRef.current) {
            setLastEvent("Pick a world first.");
            return;
        }
        if (!apiKeyRef.current) {
            setLastEvent("Authorize with Pollinations to start.");
            return;
        }
        hasStartedRef.current = true;
        setHasStarted(true);
        const piece = createGamePiece(
            0,
            {
                specimen: createSeedSpecimen(
                    rungsRef.current,
                    styleRef.current,
                    presetRef.current.seeds,
                ),
            },
            rungsRef.current,
        );
        nextPieceRef.current = piece;
        setNextPiece(piece);
        selectPiece(piece);
        void hydrateSeedPiece(piece);
    };

    const dropNextPiece = (x = aimX) => {
        if (!canUseAi) {
            setLastEvent("Authorize with Pollinations to play.");
            return;
        }
        if (!hasStartedRef.current) {
            startGame();
            return;
        }
        if (hasPendingGeneration()) {
            setLastEvent(
                nextPieceRef.current.pending
                    ? "Making the next piece…"
                    : "Mixing the result…",
            );
            return;
        }
        if (!nextPieceRef.current.generated) {
            setLastEvent("Making the next piece…");
            return;
        }
        if (isCrowded) return;
        const size = boardSizeRef.current;
        const clampedX = Math.min(
            Math.max(x, nextPieceRef.current.radius + 8),
            size.width - nextPieceRef.current.radius - 8,
        );
        addPieceToWorld(nextPieceRef.current, clampedX, DROP_Y);
        setActiveLabelId(nextPieceRef.current.id);
        setLastEvent(`${nextPieceRef.current.name} entered the vessel.`);
        createNextDrop();
    };

    const resetGame = () => {
        for (const piece of piecesRef.current) removePieceFromWorld(piece.id);
        for (const url of objectUrlsRef.current) URL.revokeObjectURL(url);
        objectUrlsRef.current.clear();
        generatedPoolRef.current.clear();
        generatedCacheRef.current.clear();
        setGeneratedPoolSize(0);
        setGenerationFocus(null);
        mergingIdsRef.current.clear();
        setPieceList([]);
        setScore(0);
        setHighestTier(0);
        setPeakName("Seeds");
        highestTierRef.current = 0;
        hasStartedRef.current = false;
        setHasStarted(false);
        // Build a placeholder aim piece but DON'T generate — wait for the
        // chosen world (startWithPreset) so its seed drives the first piece.
        createNextDrop(0);
        setLastEvent("Choose a world to begin.");
    };

    const selectPreset = (nextPresetId: LifePresetId) => {
        if (piecesRef.current.length > 0) return;
        const nextPreset =
            LIFE_PRESETS.find((preset) => preset.id === nextPresetId) ??
            DEFAULT_PRESET;
        const editedPreset = editPreset(nextPreset, presetEdits[nextPreset.id]);
        const nextStyle = styleForPresetId(nextPreset.id);
        presetChosenRef.current = true;
        presetIdRef.current = nextPreset.id;
        presetRef.current = editedPreset;
        rungsRef.current = editedPreset.rungs;
        styleIdRef.current = nextStyle.id;
        styleRef.current = composeStyle(nextStyle, editedPreset);
        setPresetId(nextPreset.id);
        resetGame();
        setLastEvent(`${editedPreset.label} world loaded.`);
    };

    // Start-screen button: pick the world and start in one click. selectPreset
    // updates every ref synchronously (presetRef/styleRef/rungsRef), so the
    // first seed startGame() builds is already driven by the chosen world.
    const startWithPreset = (nextPresetId: LifePresetId) => {
        if (hasStartedRef.current || piecesRef.current.length > 0) return;
        selectPreset(nextPresetId);
        startGame();
    };

    // Briefly reveal the freshly-created object in the generation popover,
    // then dismiss it. Replaces the "generating" state for that piece.
    const revealResult = (
        pieceId: string,
        result: GenerationResult,
        origin: "generated" | "cached",
    ) => {
        setGenerationFocus((current) =>
            current?.id === pieceId
                ? {
                      ...current,
                      status: "result",
                      result: {
                          name: result.name,
                          description: result.description,
                          imageUrl: result.imageUrl,
                      },
                  }
                : current,
        );
        const holdMs = origin === "cached" ? 2200 : 3200;
        window.setTimeout(() => {
            setGenerationFocus((current) =>
                current?.id === pieceId ? null : current,
            );
        }, holdMs);
    };

    const hydrateGeneratedPiece = async (
        pieceId: string,
        targetTier: number,
        parents: [GamePiece, GamePiece],
    ) => {
        const apiKey = apiKeyRef.current;
        if (!apiKey) {
            removePieceFromWorld(pieceId);
            setPieceList(
                piecesRef.current.filter((piece) => piece.id !== pieceId),
            );
            setLastEvent("Authorize with Pollinations to merge objects.");
            return;
        }

        const parentKey = [parents[0].name, parents[1].name]
            .map((name) => name.toLowerCase())
            .sort()
            .join("+");
        const cacheKey = [
            presetIdRef.current,
            styleIdRef.current,
            targetTier,
            parentKey,
        ].join(":");
        const cached = generatedCacheRef.current.get(cacheKey);
        if (cached) {
            const enriched = {
                ...cached,
                lineage: mergeLineage(cached, parents),
            };
            applyGeneratedSpecimen(pieceId, enriched, targetTier);
            setLastEvent(`${cached.name} reused from the local cache.`);
            showDiscovery({ ...parents[0], ...enriched });
            revealResult(pieceId, enriched, "cached");
            return;
        }

        try {
            const generated = await generateSpecimen({
                apiKey,
                targetRung: rungsRef.current[targetTier],
                parentNames: [parents[0].name, parents[1].name],
                evolutionPrompt: presetRef.current.evolutionPrompt,
                style: styleRef.current,
            });
            rememberObjectUrl(generated);
            generatedCacheRef.current.set(cacheKey, generated);
            if (!piecesRef.current.some((piece) => piece.id === pieceId)) {
                if (generated.imageUrl?.startsWith("blob:")) {
                    URL.revokeObjectURL(generated.imageUrl);
                    objectUrlsRef.current.delete(generated.imageUrl);
                }
                return;
            }
            const poolKey = `${presetIdRef.current}:${styleIdRef.current}:${targetTier}`;
            const currentPool = generatedPoolRef.current.get(poolKey) ?? [];
            const enriched = {
                ...generated,
                lineage: mergeLineage(generated, parents),
            };
            generatedPoolRef.current.set(
                poolKey,
                [enriched, ...currentPool].slice(0, 18),
            );
            setGeneratedPoolSize(generatedPoolCount());
            applyGeneratedSpecimen(pieceId, enriched, targetTier);
            setLastEvent(`${generated.name}: ${generated.description}`);
            showDiscovery({ ...parents[0], ...enriched });
            revealResult(pieceId, enriched, "generated");
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "Generation failed.";
            removePieceFromWorld(pieceId);
            setPieceList(
                piecesRef.current.filter((piece) => piece.id !== pieceId),
            );
            setGenerationFocus((current) =>
                current?.id === pieceId ? null : current,
            );
            setLastEvent(`Generation failed: ${message}`);
        }
    };

    const mergePieces = (leftId: string, rightId: string) => {
        const left = piecesRef.current.find((piece) => piece.id === leftId);
        const right = piecesRef.current.find((piece) => piece.id === rightId);
        if (!left || !right) return;
        if (left.tier !== right.tier) return;
        if (left.tier >= rungsRef.current.length - 1) return;
        if (left.pending || right.pending) return;
        if (!apiKeyRef.current) {
            setLastEvent("Authorize with Pollinations to merge objects.");
            return;
        }
        if (
            mergingIdsRef.current.has(leftId) ||
            mergingIdsRef.current.has(rightId)
        ) {
            return;
        }

        mergingIdsRef.current.add(leftId);
        mergingIdsRef.current.add(rightId);
        const leftBody = bodiesRef.current.get(leftId);
        const rightBody = bodiesRef.current.get(rightId);
        const center = {
            x:
                ((leftBody?.position.x ?? left.x) +
                    (rightBody?.position.x ?? right.x)) /
                2,
            y:
                ((leftBody?.position.y ?? left.y) +
                    (rightBody?.position.y ?? right.y)) /
                2,
        };
        removePieceFromWorld(leftId);
        removePieceFromWorld(rightId);
        setPieceList(
            piecesRef.current.filter(
                (piece) => piece.id !== leftId && piece.id !== rightId,
            ),
        );

        const targetTier = left.tier + 1;
        const parents: [string, string] = [left.name, right.name];
        const targetRung = rungsRef.current[targetTier];
        const targetLabel = "New discovery";
        const loadingSpecimen = createLoadingSpecimen(
            targetRung,
            `${left.name} + ${right.name}`,
            `Generating from ${left.name} and ${right.name}.`,
            styleRef.current,
        );
        const specimen = {
            ...loadingSpecimen,
            lineage: mergeLineage(loadingSpecimen, [left, right]),
        };
        const result = createGamePiece(
            targetTier,
            {
                specimen,
                parents,
                pending: true,
                generated: false,
            },
            rungsRef.current,
        );

        addPieceToWorld(result, center.x, center.y);
        setGenerationFocus({
            id: result.id,
            parents: [left, right],
            targetLabel,
            status: "generating",
        });
        setScore((current) => current + (targetTier + 1) * 10);
        if (targetTier > highestTierRef.current) {
            highestTierRef.current = targetTier;
            setHighestTier(targetTier);
            setPeakName(`${left.name} + ${right.name}`);
        }
        setLastEvent(`Generating from ${left.name} and ${right.name}.`);
        selectPiece(result);

        window.setTimeout(() => {
            mergingIdsRef.current.delete(leftId);
            mergingIdsRef.current.delete(rightId);
        }, 250);

        void hydrateGeneratedPiece(result.id, targetTier, [left, right]);
    };

    // Assigned every render so the collision handler always calls the latest
    // closure (with current refs). Do NOT move this into an effect.
    mergePieceRef.current = mergePieces;

    const updateAim = (event: ReactPointerEvent<HTMLDivElement>) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        setAimX(event.clientX - bounds.left);
    };

    const handleBoardPointerDown = (
        event: ReactPointerEvent<HTMLDivElement>,
    ) => {
        if (event.button !== 0) return;
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        const x = event.clientX - bounds.left;
        setAimX(x);
        if (!hasStartedRef.current) {
            startGame();
            return;
        }
        dropNextPiece(x);
    };

    // No dependency array on purpose: re-binds every render so the handlers
    // close over fresh dropNextPiece/resetGame.
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.code === "Space") {
                event.preventDefault();
                dropNextPiece();
            }
            if (event.key.toLowerCase() === "r") {
                resetGame();
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    });

    // Minimal legend: the distinct objects currently on the board (icon → name),
    // collapsed by name and ordered biggest-tier first.
    const legendEntries = useMemo(() => {
        const seen = new Map<string, GamePiece>();
        for (const piece of pieces) {
            if (piece.pending) continue;
            const existing = seen.get(piece.name);
            if (!existing || piece.tier > existing.tier) {
                seen.set(piece.name, piece);
            }
        }
        return Array.from(seen.values()).sort((a, b) => b.tier - a.tier);
    }, [pieces]);
    const dropPreviewX = Math.min(
        Math.max(aimX, nextPiece.radius + 8),
        boardSize.width - nextPiece.radius - 8,
    );

    return {
        boardRef,
        pieces,
        nextPiece,
        score,
        highestTier,
        presetId,
        generatedPoolSize,
        lastEvent,
        isCrowded,
        peakName,
        activeLabelId,
        generationFocus,
        selectedView,
        activePreset,
        rungs,
        canUseAi,
        canDrop,
        hasStarted,
        gameWon,
        activeGenerations,
        legendEntries,
        dropPreviewX,
        selectPiece,
        showDiscovery,
        dropNextPiece,
        resetGame,
        startWithPreset,
        updateAim,
        handleBoardPointerDown,
    };
}
