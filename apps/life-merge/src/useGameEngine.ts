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
const STYLE_IDS = LIFE_STYLE_PRESETS.map((style) => style.id);

type PieceBody = Body & { plugin: { pieceId: string } };

export type Discovery = {
    id: string;
    name: string;
    description: string;
    lineage: LineageNode;
};

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
    const presetIdRef = useRef<LifePresetId>(DEFAULT_PRESET.id);
    const presetRef = useRef<LifePreset>(DEFAULT_PRESET);
    const rungsRef = useRef(DEFAULT_PRESET.rungs);
    const styleIdRef = useRef<LifeStylePresetId>(DEFAULT_STYLE_PRESET.id);
    const styleRef = useRef(composeStyle(DEFAULT_STYLE_PRESET, DEFAULT_PRESET));
    const generatedPoolRef = useRef<Map<string, Specimen[]>>(new Map());
    const generatedCacheRef = useRef<Map<string, Specimen>>(new Map());
    const nextPieceRef = useRef<GamePiece>(
        createGamePiece(
            0,
            {
                specimen: createSeedSpecimen(
                    DEFAULT_PRESET.rungs,
                    composeStyle(DEFAULT_STYLE_PRESET, DEFAULT_PRESET),
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
    const [presetId, setPresetId] = useQueryParam<LifePresetId>(
        "preset",
        DEFAULT_PRESET.id,
        PRESET_IDS,
    );
    const [styleId, setStyleId] = useQueryParam<LifeStylePresetId>(
        "style",
        DEFAULT_STYLE_PRESET.id,
        STYLE_IDS,
    );
    const [presetEdits, setPresetEdits] =
        useState<PresetEdits>(initialPresetEdits);
    const [generatedPoolSize, setGeneratedPoolSize] = useState(0);
    const [lastEvent, setLastEvent] = useState(
        "Authorize to generate the first seed.",
    );
    const [isCrowded, setIsCrowded] = useState(false);
    const [peakName, setPeakName] = useState("Seeds");
    const [discovery, setDiscovery] = useState<Discovery | null>(null);
    const [generationFocus, setGenerationFocus] =
        useState<GenerationFocus | null>(null);
    const [lineageView, setLineageView] = useState<LineageNode>(
        nextPieceRef.current.lineage,
    );

    const basePreset = useMemo(
        () =>
            LIFE_PRESETS.find((preset) => preset.id === presetId) ??
            DEFAULT_PRESET,
        [presetId],
    );
    const activePreset = useMemo(
        () => editPreset(basePreset, presetEdits[presetId]),
        [basePreset, presetEdits, presetId],
    );
    const activeStyle = useMemo(
        () =>
            LIFE_STYLE_PRESETS.find((style) => style.id === styleId) ??
            DEFAULT_STYLE_PRESET,
        [styleId],
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
        activeGenerations === 0 &&
        nextPiece.generated &&
        !isCrowded;
    const gameWon = highestTier >= rungs.length - 1;
    const presetsLocked = pieces.length > 0;

    useEffect(() => {
        apiKeyRef.current = apiKey;
    }, [apiKey]);

    useEffect(() => {
        highestTierRef.current = highestTier;
    }, [highestTier]);

    useEffect(() => {
        presetIdRef.current = presetId;
        presetRef.current = activePreset;
        rungsRef.current = rungs;
    }, [activePreset, presetId, rungs]);

    useEffect(() => {
        styleIdRef.current = styleId;
        styleRef.current = promptStyle;
    }, [styleId, promptStyle]);

    useEffect(() => {
        if (!discovery) return undefined;
        const timeout = window.setTimeout(() => setDiscovery(null), 5200);
        return () => window.clearTimeout(timeout);
    }, [discovery]);

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

    const showDiscovery = (
        piece: Pick<GamePiece, "id" | "name" | "description" | "lineage">,
    ) => {
        setDiscovery({
            id: piece.id,
            name: piece.name,
            description: piece.description,
            lineage: piece.lineage,
        });
        setLineageView(piece.lineage);
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

    // biome-ignore lint/correctness/useExhaustiveDependencies: Auth hydration should run once when delegated generation becomes available.
    useEffect(() => {
        if (
            canUseAi &&
            !nextPieceRef.current.generated &&
            !nextPieceRef.current.pending
        ) {
            void hydrateSeedPiece(nextPieceRef.current);
        }
    }, [canUseAi]);

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
            setLineageView(piece.lineage);
        }
        if (tier === 0) void hydrateSeedPiece(piece);
    };

    const hasPendingGeneration = () =>
        nextPieceRef.current.pending ||
        piecesRef.current.some((piece) => piece.pending);

    const dropNextPiece = (x = aimX) => {
        if (!canUseAi) {
            setLastEvent("Authorize with Pollinations to play.");
            return;
        }
        if (hasPendingGeneration()) {
            setLastEvent(
                nextPieceRef.current.pending
                    ? "Generating the next seed."
                    : "Generating the merge result.",
            );
            return;
        }
        if (!nextPieceRef.current.generated) {
            setLastEvent("Generating the next seed.");
            return;
        }
        if (isCrowded) return;
        const size = boardSizeRef.current;
        const clampedX = Math.min(
            Math.max(x, nextPieceRef.current.radius + 8),
            size.width - nextPieceRef.current.radius - 8,
        );
        addPieceToWorld(nextPieceRef.current, clampedX, DROP_Y);
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
        createNextDrop(0);
        setLastEvent(
            apiKeyRef.current
                ? "The vessel is clear. Generating a seed."
                : "Authorize to generate the first seed.",
        );
    };

    const selectPreset = (nextPresetId: LifePresetId) => {
        if (piecesRef.current.length > 0) return;
        const nextPreset =
            LIFE_PRESETS.find((preset) => preset.id === nextPresetId) ??
            DEFAULT_PRESET;
        const editedPreset = editPreset(nextPreset, presetEdits[nextPreset.id]);
        presetIdRef.current = nextPreset.id;
        presetRef.current = editedPreset;
        rungsRef.current = editedPreset.rungs;
        styleRef.current = composeStyle(activeStyle, editedPreset);
        setPresetId(nextPreset.id);
        resetGame();
        setLastEvent(`${editedPreset.label} axis loaded.`);
    };

    const selectStyle = (nextStyleId: LifeStylePresetId) => {
        if (piecesRef.current.length > 0) return;
        const nextStyle =
            LIFE_STYLE_PRESETS.find((style) => style.id === nextStyleId) ??
            DEFAULT_STYLE_PRESET;
        styleIdRef.current = nextStyle.id;
        styleRef.current = composeStyle(nextStyle, presetRef.current);
        setStyleId(nextStyle.id);
        resetGame();
        setLastEvent(`${nextStyle.label} style loaded.`);
    };

    const updateActivePresetEdit = (field: keyof PresetEdit, value: string) => {
        if (presetsLocked) return;
        setPresetEdits((current) => ({
            ...current,
            [presetId]: {
                ...current[presetId],
                [field]: value,
            },
        }));
    };

    const applyPresetEdit = () => {
        if (presetsLocked) return;
        presetRef.current = activePreset;
        rungsRef.current = activePreset.rungs;
        styleRef.current = promptStyle;
        resetGame();
        setLastEvent(`${activePreset.label} preset applied.`);
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
        setLineageView(result.lineage);

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
        dropNextPiece(event.clientX - bounds.left);
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

    const rungRows = useMemo(
        () =>
            rungs.map((rung, index) => ({
                rung,
                index,
                active: index <= highestTier,
            })),
        [highestTier, rungs],
    );
    const activeEdit = presetEdits[presetId];
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
        styleId,
        generatedPoolSize,
        lastEvent,
        isCrowded,
        peakName,
        discovery,
        generationFocus,
        lineageView,
        activePreset,
        activeStyle,
        rungs,
        canUseAi,
        canDrop,
        gameWon,
        presetsLocked,
        activeGenerations,
        rungRows,
        activeEdit,
        dropPreviewX,
        setLineageView,
        dropNextPiece,
        resetGame,
        selectPreset,
        selectStyle,
        updateActivePresetEdit,
        applyPresetEdit,
        updateAim,
        handleBoardPointerDown,
    };
}
