import {
    PolliProvider,
    useAuthActions,
    useAuthState,
} from "@pollinations/sdk/react";
import {
    Alert,
    BeakerIcon,
    Button,
    Chip,
    ClockIcon,
    GenApiIcon,
    ImageIcon,
    StatCard,
    Surface,
    TrendUpIcon,
} from "@pollinations/ui";
import { AppUserMenu } from "@pollinations/ui/app-user-menu/sdk";
import logoWordmarkUrl from "@pollinations/ui/assets/logo-wordmark.svg";
import { Balance, KeyBudget, KeyModels } from "@pollinations/ui/wallet/sdk";
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
    type CSSProperties,
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

const APP_KEY = import.meta.env.VITE_POLLINATIONS_APP_KEY?.trim() ?? "";
const HAS_APP_KEY = APP_KEY.startsWith("pk_");
const APP_THEME = "green";
const BOARD_LOGICAL_SIZE = { width: 600, height: 900 };
const BOARD_FALLBACK = BOARD_LOGICAL_SIZE;
const BOARD_ASPECT_RATIO = `${BOARD_LOGICAL_SIZE.width} / ${BOARD_LOGICAL_SIZE.height}`;
const BOARD_MAX_WIDTH = `${BOARD_LOGICAL_SIZE.width}px`;
const BOARD_WIDTH_FROM_HEIGHT = `calc(var(--board-max-height) * ${
    BOARD_LOGICAL_SIZE.width / BOARD_LOGICAL_SIZE.height
})`;
const LOSS_LINE = 100;
const DROP_Y = 70;
const MAX_PIECES = 50;
const IS_DEV = import.meta.env.DEV;

type LifeMergeAppProps = {
    hasAppKey: boolean;
};

type PieceBody = Body & { plugin: { pieceId: string } };

type Discovery = {
    id: string;
    name: string;
    description: string;
    lineage: LineageNode;
};

type GenerationFocus = {
    id: string;
    parents: [GamePiece, GamePiece];
    targetLabel: string;
    status: "generating" | "cached";
};

type PresetEdit = {
    evolutionPrompt: string;
    stylePrompt: string;
    seedsText: string;
};

type PresetEdits = Record<LifePresetId, PresetEdit>;

const brandWordmarkMask: CSSProperties = {
    WebkitMask: `url(${logoWordmarkUrl}) center / contain no-repeat`,
    mask: `url(${logoWordmarkUrl}) center / contain no-repeat`,
};

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

function LineageTree({
    node,
    depth = 0,
}: {
    node: LineageNode;
    depth?: number;
}) {
    return (
        <div
            className="lineage-node"
            style={{ "--lineage-depth": Math.min(depth, 3) } as CSSProperties}
        >
            <div className="lineage-node-row">
                <strong>{node.name}</strong>
            </div>
            <p>{node.description}</p>
            {node.parents ? (
                <div className="lineage-parents">
                    <LineageTree node={node.parents[0]} depth={depth + 1} />
                    <LineageTree node={node.parents[1]} depth={depth + 1} />
                </div>
            ) : null}
        </div>
    );
}

function App() {
    return (
        <PolliProvider
            appKey={APP_KEY}
            permissions={["profile", "usage"]}
            models={["claude-large", "zimage"]}
            budget={6}
            expiry={7}
        >
            <LifeMergeApp hasAppKey={HAS_APP_KEY} />
        </PolliProvider>
    );
}

function LifeMergeApp({ hasAppKey }: LifeMergeAppProps) {
    const { apiKey, isLoggedIn, isHydrated } = useAuthState();
    const { login } = useAuthActions();
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
    const [presetId, setPresetId] = useState<LifePresetId>(DEFAULT_PRESET.id);
    const [styleId, setStyleId] = useState<LifeStylePresetId>(
        DEFAULT_STYLE_PRESET.id,
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

    const pieceTitle = (
        piece: Pick<GamePiece, "name" | "description" | "lineage">,
    ) => {
        const parents = piece.lineage.parents
            ? ` Parents: ${piece.lineage.parents[0].name} + ${piece.lineage.parents[1].name}.`
            : "";
        return `${piece.name}: ${piece.description}.${parents}`;
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
            setGenerationFocus((current) =>
                current?.id === pieceId
                    ? { ...current, status: "cached" }
                    : current,
            );
            const enriched = {
                ...cached,
                lineage: mergeLineage(cached, parents),
            };
            applyGeneratedSpecimen(pieceId, enriched, targetTier);
            setLastEvent(`${cached.name} reused from the local cache.`);
            showDiscovery({ ...parents[0], ...enriched });
            window.setTimeout(() => {
                setGenerationFocus((current) =>
                    current?.id === pieceId ? null : current,
                );
            }, 1200);
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
            setGenerationFocus((current) =>
                current?.id === pieceId ? null : current,
            );
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

    return (
        <div data-theme={APP_THEME} className="app-shell">
            <header className="topbar">
                <a
                    href="https://pollinations.ai"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="brand-mark"
                    aria-label="Pollinations"
                >
                    <span className="sr-only">Pollinations</span>
                    <span aria-hidden="true" style={brandWordmarkMask} />
                </a>
                <div className="topbar-actions">
                    <Chip theme="teal" size="sm">
                        Life Merge
                    </Chip>
                    {!hasAppKey ? (
                        <Chip theme="blue" size="sm">
                            Redirect auth
                        </Chip>
                    ) : null}
                    <AppUserMenu dashboardHref="https://enter.pollinations.ai" />
                </div>
            </header>

            <main className="game-layout">
                <section className="play-column">
                    <div className="game-toolbar">
                        <div className="next-drop">
                            <button
                                type="button"
                                className="next-orb"
                                title={pieceTitle(nextPiece)}
                                onClick={() =>
                                    setLineageView(nextPiece.lineage)
                                }
                                style={
                                    {
                                        "--piece-color": nextPiece.color,
                                        "--piece-ink": nextPiece.ink,
                                    } as CSSProperties
                                }
                            >
                                <img src={nextPiece.imageUrl} alt="" />
                            </button>
                            <div>
                                <span>Next</span>
                                <strong title={pieceTitle(nextPiece)}>
                                    {nextPiece.name}
                                </strong>
                                {nextPiece.pending ? (
                                    <small>Generating</small>
                                ) : null}
                            </div>
                        </div>
                        <div className="toolbar-buttons">
                            <Button
                                onClick={() => dropNextPiece()}
                                disabled={!canDrop}
                            >
                                Drop
                            </Button>
                            <Button theme="amber" onClick={resetGame}>
                                Reset
                            </Button>
                        </div>
                    </div>

                    <div
                        ref={boardRef}
                        className={`merge-board ${isCrowded ? "is-crowded" : ""}`}
                        onPointerMove={updateAim}
                        onPointerDown={handleBoardPointerDown}
                        style={
                            {
                                "--board-aspect-ratio": BOARD_ASPECT_RATIO,
                                "--board-max-width": BOARD_MAX_WIDTH,
                                "--board-width-from-height":
                                    BOARD_WIDTH_FROM_HEIGHT,
                            } as CSSProperties
                        }
                    >
                        <div className="loss-line" style={{ top: LOSS_LINE }}>
                            <span />
                        </div>
                        <div
                            className="aim-line"
                            style={{
                                left: dropPreviewX,
                            }}
                        />
                        <div
                            className={`drop-preview ${
                                canDrop ? "" : "is-waiting"
                            }`}
                            title={pieceTitle(nextPiece)}
                            style={
                                {
                                    "--piece-x": `${dropPreviewX}px`,
                                    "--piece-y": `${DROP_Y}px`,
                                    "--piece-size": `${nextPiece.radius * 2}px`,
                                    "--piece-color": nextPiece.color,
                                    "--piece-ink": nextPiece.ink,
                                } as CSSProperties
                            }
                        >
                            <img
                                src={nextPiece.imageUrl}
                                alt=""
                                draggable={false}
                            />
                            {nextPiece.pending ? (
                                <span
                                    className="piece-spinner"
                                    aria-hidden="true"
                                />
                            ) : null}
                            <span className="drop-preview-label">
                                {nextPiece.pending
                                    ? "Generating"
                                    : nextPiece.name}
                            </span>
                        </div>
                        {pieces.map((piece) => (
                            <button
                                type="button"
                                key={piece.id}
                                className={`life-piece ${
                                    piece.pending ? "is-pending" : ""
                                } ${piece.generated ? "is-generated" : ""} ${
                                    piece.y < piece.radius + 48 ? "is-high" : ""
                                }`}
                                title={pieceTitle(piece)}
                                onPointerEnter={() =>
                                    setLineageView(piece.lineage)
                                }
                                onClick={() => setLineageView(piece.lineage)}
                                style={
                                    {
                                        "--piece-x": `${piece.x}px`,
                                        "--piece-y": `${piece.y}px`,
                                        "--piece-size": `${piece.radius * 2}px`,
                                        "--piece-rotate": `${piece.angle}rad`,
                                        "--piece-color": piece.color,
                                        "--piece-ink": piece.ink,
                                    } as CSSProperties
                                }
                            >
                                <img
                                    src={piece.imageUrl}
                                    alt=""
                                    draggable={false}
                                />
                                {piece.pending ? (
                                    <span
                                        className="piece-spinner"
                                        aria-hidden="true"
                                    />
                                ) : null}
                                <span className="piece-label">
                                    <span className="piece-label-name">
                                        {piece.name}
                                    </span>
                                    {piece.pending ? (
                                        <span className="piece-label-status">
                                            Generating
                                        </span>
                                    ) : null}
                                </span>
                            </button>
                        ))}
                        {pieces.length === 0 ? (
                            <div className="board-empty">
                                <BeakerIcon />
                                <span>
                                    {canUseAi
                                        ? nextPiece.pending
                                            ? "Generating the first seed"
                                            : "Click the vessel to start"
                                        : "Authorize to play"}
                                </span>
                            </div>
                        ) : null}
                        {discovery ? (
                            <button
                                type="button"
                                className="discovery-toast"
                                title={`${discovery.name}: ${discovery.description}`}
                                onClick={() =>
                                    setLineageView(discovery.lineage)
                                }
                            >
                                <strong>{discovery.name}</strong>
                                <span>{discovery.description}</span>
                            </button>
                        ) : null}
                        {generationFocus ? (
                            <output className="generation-focus">
                                <div className="generation-focus-head">
                                    <span>
                                        {generationFocus.status === "cached"
                                            ? "Cached result"
                                            : "Generating"}
                                    </span>
                                    <strong>
                                        {generationFocus.targetLabel}
                                    </strong>
                                </div>
                                <div className="generation-parents">
                                    {generationFocus.parents.map((parent) => (
                                        <div
                                            className="generation-parent"
                                            key={parent.id}
                                        >
                                            <img src={parent.imageUrl} alt="" />
                                            <div>
                                                <strong>{parent.name}</strong>
                                                <p>{parent.description}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div className="generation-pulse">
                                    <span />
                                </div>
                            </output>
                        ) : null}
                    </div>

                    <div className="status-row" aria-live="polite">
                        <Alert
                            intent={
                                gameWon
                                    ? "success"
                                    : isCrowded
                                      ? "warning"
                                      : "info"
                            }
                            title={
                                gameWon
                                    ? `${peakName} reached`
                                    : isCrowded
                                      ? "Vessel crowded"
                                      : canUseAi
                                        ? "Pollinations live"
                                        : "Authorize to play"
                            }
                        >
                            {lastEvent}
                        </Alert>
                    </div>
                </section>

                <aside className="side-panel">
                    <Surface
                        variant="panel"
                        theme="green"
                        className="stats-panel"
                    >
                        <div className="stats-grid">
                            <StatCard
                                theme="green"
                                label="Score"
                                value={score}
                                detail={`${pieces.length} objects`}
                            />
                            <StatCard
                                theme="teal"
                                label="Peak"
                                value={peakName}
                                detail={`${highestTier + 1}/${rungs.length} unlocked`}
                            />
                        </div>
                        <div className="wallet-row">
                            <Balance />
                            <KeyBudget />
                            <KeyModels />
                        </div>
                    </Surface>

                    <Surface variant="panel" theme="teal" className="ai-panel">
                        <div className="panel-heading">
                            <GenApiIcon />
                            <div>
                                <h2>Generation</h2>
                                <p>
                                    {canUseAi
                                        ? "Names and images generate every playable object."
                                        : hasAppKey
                                          ? "Authorize to generate names and images."
                                          : "Authorize with redirect URI only, without app attribution."}
                                </p>
                            </div>
                        </div>
                        <div className="ai-meter">
                            <Chip
                                intent={canUseAi ? "success" : "warning"}
                                size="sm"
                            >
                                {canUseAi
                                    ? "BYOP active"
                                    : hasAppKey
                                      ? "App key auth"
                                      : "Redirect URI"}
                            </Chip>
                            <Chip theme="blue" size="sm">
                                {activeGenerations} pending
                            </Chip>
                        </div>
                        {!canUseAi ? (
                            <Button
                                onClick={() => login()}
                                disabled={!isHydrated}
                            >
                                Authorize
                            </Button>
                        ) : null}
                    </Surface>

                    <Surface
                        variant="panel"
                        theme="pink"
                        className="style-panel"
                    >
                        <div className="panel-heading">
                            <ImageIcon />
                            <div>
                                <h2>{activeStyle.label} Style</h2>
                                <p>{activeStyle.description}</p>
                            </div>
                        </div>
                        <div className="style-tabs">
                            {LIFE_STYLE_PRESETS.map((style) => (
                                <button
                                    key={style.id}
                                    type="button"
                                    className={
                                        style.id === styleId ? "is-active" : ""
                                    }
                                    disabled={presetsLocked}
                                    onClick={() => selectStyle(style.id)}
                                >
                                    <span
                                        className={`style-swatch style-swatch-${style.id}`}
                                        aria-hidden="true"
                                    />
                                    <strong>{style.label}</strong>
                                </button>
                            ))}
                        </div>
                    </Surface>

                    <Surface
                        variant="panel"
                        theme="blue"
                        className="grammar-panel"
                    >
                        <div className="panel-heading">
                            <ImageIcon />
                            <div>
                                <h2>{activePreset.label} Axis</h2>
                                <p>{activePreset.axis}</p>
                            </div>
                        </div>
                        <div className="preset-tabs">
                            {LIFE_PRESETS.map((preset) => (
                                <button
                                    key={preset.id}
                                    type="button"
                                    className={
                                        preset.id === presetId
                                            ? "is-active"
                                            : ""
                                    }
                                    disabled={presetsLocked}
                                    onClick={() => selectPreset(preset.id)}
                                >
                                    {preset.label}
                                </button>
                            ))}
                        </div>
                        <ul className="rung-list" aria-label="Merge colors">
                            {rungRows.map(({ rung, index, active }) => (
                                <li
                                    key={rung.id}
                                    className={`rung-row ${active ? "is-active" : ""}`}
                                    title={`Size ${index + 1}: same color merges`}
                                    aria-label={`Size ${index + 1}${
                                        active ? " unlocked" : " locked"
                                    }`}
                                >
                                    <span
                                        style={
                                            {
                                                "--piece-color": rung.color,
                                                "--piece-ink": rung.ink,
                                            } as CSSProperties
                                        }
                                    />
                                </li>
                            ))}
                        </ul>
                    </Surface>

                    {IS_DEV ? (
                        <Surface
                            variant="panel"
                            theme="green"
                            className="dev-preset-panel"
                        >
                            <div className="panel-heading">
                                <GenApiIcon />
                                <div>
                                    <h2>Preset</h2>
                                    <p>{activePreset.label}</p>
                                </div>
                            </div>
                            <div className="preset-editor">
                                <label>
                                    <span>Seeds</span>
                                    <textarea
                                        value={activeEdit.seedsText}
                                        disabled={presetsLocked}
                                        rows={5}
                                        onChange={(event) =>
                                            updateActivePresetEdit(
                                                "seedsText",
                                                event.currentTarget.value,
                                            )
                                        }
                                    />
                                </label>
                                <label>
                                    <span>Evolution</span>
                                    <textarea
                                        value={activeEdit.evolutionPrompt}
                                        disabled={presetsLocked}
                                        rows={4}
                                        onChange={(event) =>
                                            updateActivePresetEdit(
                                                "evolutionPrompt",
                                                event.currentTarget.value,
                                            )
                                        }
                                    />
                                </label>
                                <label>
                                    <span>Style</span>
                                    <textarea
                                        value={activeEdit.stylePrompt}
                                        disabled={presetsLocked}
                                        rows={3}
                                        onChange={(event) =>
                                            updateActivePresetEdit(
                                                "stylePrompt",
                                                event.currentTarget.value,
                                            )
                                        }
                                    />
                                </label>
                                <Button
                                    onClick={applyPresetEdit}
                                    disabled={presetsLocked}
                                >
                                    Apply
                                </Button>
                            </div>
                        </Surface>
                    ) : null}

                    <Surface
                        variant="panel"
                        theme="amber"
                        className="lineage-panel"
                    >
                        <div className="panel-heading">
                            <TrendUpIcon />
                            <div>
                                <h2>Lineage</h2>
                                <p>Hover or click an object.</p>
                            </div>
                        </div>
                        <div className="lineage-tree">
                            <LineageTree node={lineageView} />
                        </div>
                        <div className="note-chips lineage-chips">
                            <Chip theme="teal" size="sm">
                                {generatedPoolSize} generated
                            </Chip>
                            <Chip theme="blue" size="sm">
                                {activeStyle.label}
                            </Chip>
                        </div>
                    </Surface>

                    <div className="powered">
                        <ClockIcon />
                        <span>
                            Built with Pollinations UI, BYOP, text, and image
                            APIs.
                        </span>
                    </div>
                </aside>
            </main>
        </div>
    );
}

export default App;
