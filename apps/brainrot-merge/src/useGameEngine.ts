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
import {
    createGamePiece,
    createLoadingSpecimen,
    createSeedSpecimen,
    figureScale,
    type GamePiece,
    type LineageNode,
    mergeLineage,
    RUNGS,
    type Specimen,
    sample,
    tierPhysics,
} from "./brainrot";
import type { FigureData } from "./figure";
import {
    generateImageSpecimen,
    generateSpecimen,
    generateVoiceLine,
} from "./generation";

// Matter runs in this fixed logical space. The rendered board may be smaller;
// App.tsx scales positions/radii with `viewScale` instead of resizing physics.
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
const MAX_SPAWN_TIER = 4;
const MIN_SPAWN_VARIANTS_PER_TIER = 2;
const SPAWN_TIER_WEIGHTS = [55, 30, 12, 3, 1] as const;
const WALL_THICKNESS = 180;
const FLOOR_THICKNESS = 240;
const BOARD_EDGE_GAP = 2;

function uniqueSpecimensByName(specimens: Specimen[]) {
    const seen = new Set<string>();
    return specimens.filter((specimen) => {
        const key = specimen.name.trim().toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function weightedTierSample(tiers: number[]) {
    const total = tiers.reduce(
        (sum, tier) => sum + (SPAWN_TIER_WEIGHTS[tier] ?? 1),
        0,
    );
    let roll = Math.random() * total;
    for (const tier of tiers) {
        roll -= SPAWN_TIER_WEIGHTS[tier] ?? 1;
        if (roll <= 0) return tier;
    }
    return tiers[0] ?? 0;
}

function clampCenter(value: number, radius: number, extent: number) {
    const min = radius + BOARD_EDGE_GAP;
    const max = extent - radius - BOARD_EDGE_GAP;
    if (max <= min) return extent / 2;
    return Math.min(Math.max(value, min), max);
}

function clampPieceCenter(
    piece: Pick<GamePiece, "radius">,
    x: number,
    y: number,
    size: { width: number; height: number },
) {
    return {
        x: clampCenter(x, piece.radius, size.width),
        y: clampCenter(y, piece.radius, size.height),
    };
}

function cacheText(value: string) {
    return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function canonicalParents<T extends Pick<Specimen, "name" | "description">>(
    parents: [T, T],
): [T, T] {
    const [left, right] = parents;
    const leftKey = `${cacheText(left.name)}\n${cacheText(left.description)}`;
    const rightKey = `${cacheText(right.name)}\n${cacheText(right.description)}`;
    return leftKey.localeCompare(rightKey) <= 0 ? parents : [right, left];
}

// Image generation can lag behind play; only merge placeholders are unknown.
function isResolvingIdentity(piece: Pick<GamePiece, "pending" | "parents">) {
    return piece.pending && Boolean(piece.parents);
}

function mergeCacheKey(args: {
    targetTier: number;
    parents: [
        Pick<Specimen, "name" | "description">,
        Pick<Specimen, "name" | "description">,
    ];
}) {
    const parentInputs = canonicalParents(args.parents).map((parent) => [
        cacheText(parent.name),
        cacheText(parent.description),
    ]);
    return JSON.stringify(["brainrot-v1", args.targetTier, parentInputs]);
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
    status: "generating" | "result";
    result?: GenerationResult;
};

// What the inspector card shows: the focused piece's icon + identity + its
// lineage (the recursive tree is currently hidden in the UI but kept here).
export type SelectedView = {
    id: string;
    name: string;
    description: string;
    imageUrl?: string;
    catchphrase?: string;
    figure?: FigureData;
    color: string;
    ink: string;
    lineage: LineageNode;
};

function toSelectedView(
    piece: Pick<
        GamePiece,
        | "id"
        | "name"
        | "description"
        | "imageUrl"
        | "catchphrase"
        | "figure"
        | "color"
        | "ink"
        | "lineage"
    >,
): SelectedView {
    return {
        id: piece.id,
        name: piece.name,
        description: piece.description,
        imageUrl: piece.imageUrl,
        catchphrase: piece.catchphrase,
        figure: piece.figure,
        color: piece.color,
        ink: piece.ink,
        lineage: piece.lineage,
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
    const highestTierRef = useRef(0);
    const hasStartedRef = useRef(false);
    const generatedPoolRef = useRef<Map<number, Specimen[]>>(new Map());
    const generatedCacheRef = useRef<Map<string, Specimen>>(new Map());
    const voiceCacheRef = useRef<Map<string, string>>(new Map());
    const voiceEnabledRef = useRef(true);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const nextPieceRef = useRef<GamePiece>(
        createGamePiece(0, { specimen: createSeedSpecimen() }),
    );
    const mergePieceRef = useRef<(leftId: string, rightId: string) => void>(
        () => undefined,
    );

    const [viewScale, setViewScale] = useState(1);
    const [pieces, setPieces] = useState<GamePiece[]>([]);
    const [nextPiece, setNextPiece] = useState<GamePiece>(nextPieceRef.current);
    const [aimX, setAimX] = useState(BOARD_FALLBACK.width / 2);
    const [score, setScore] = useState(0);
    const [highestTier, setHighestTier] = useState(0);
    const [hasStarted, setHasStarted] = useState(false);
    const [isCrowded, setIsCrowded] = useState(false);
    const [voiceEnabled, setVoiceEnabled] = useState(true);
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

    const canUseAi = isHydrated && isLoggedIn && Boolean(apiKey);
    const canDrop =
        canUseAi && hasStarted && !isResolvingIdentity(nextPiece) && !isCrowded;
    useEffect(() => {
        apiKeyRef.current = apiKey;
    }, [apiKey]);

    useEffect(() => {
        highestTierRef.current = highestTier;
    }, [highestTier]);

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

    const addWalls = useCallback(() => {
        const engine = engineRef.current;
        if (!engine) return;
        if (wallsRef.current.length > 0) {
            Composite.remove(engine.world, wallsRef.current);
        }
        const { width, height } = BOARD_LOGICAL_SIZE;
        const wallOptions = {
            isStatic: true,
            friction: 0.18,
            render: { visible: false },
        };
        const walls = [
            Bodies.rectangle(
                width / 2,
                height + FLOOR_THICKNESS / 2,
                width + WALL_THICKNESS * 2,
                FLOOR_THICKNESS,
                wallOptions,
            ),
            Bodies.rectangle(
                -WALL_THICKNESS / 2,
                height / 2,
                WALL_THICKNESS,
                height + FLOOR_THICKNESS * 2,
                wallOptions,
            ),
            Bodies.rectangle(
                width + WALL_THICKNESS / 2,
                height / 2,
                WALL_THICKNESS,
                height + FLOOR_THICKNESS * 2,
                wallOptions,
            ),
        ];
        wallsRef.current = walls;
        Composite.add(engine.world, walls);
    }, []);

    useEffect(() => {
        const engine = Engine.create();
        engine.enableSleeping = true;
        engine.gravity.y = 1.15;
        engineRef.current = engine;
        addWalls();

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
            audioRef.current?.pause();
            for (const url of objectUrlsRef.current) URL.revokeObjectURL(url);
            objectUrlsRef.current.clear();
            voiceCacheRef.current.clear();
            bodiesRef.current.clear();
            piecesRef.current = [];
        };
    }, [addWalls]);

    useEffect(() => {
        const node = boardRef.current;
        if (!node) return;
        const updateScale = (width: number, height: number) => {
            const widthScale = width / BOARD_LOGICAL_SIZE.width;
            const heightScale = height / BOARD_LOGICAL_SIZE.height;
            const nextScale = Math.max(0.1, Math.min(widthScale, heightScale));
            setViewScale(nextScale);
            setAimX((current) =>
                Math.min(Math.max(current, 44), BOARD_LOGICAL_SIZE.width - 44),
            );
        };
        updateScale(node.clientWidth, node.clientHeight);
        const observer = new ResizeObserver(([entry]) => {
            updateScale(entry.contentRect.width, entry.contentRect.height);
        });
        observer.observe(node);
        return () => observer.disconnect();
    }, []);

    // A figure piece gets its convex hull as the physics body, scaled so the
    // hull area matches the tier circle's area. Circle fallback otherwise.
    const buildPieceBody = (piece: GamePiece, x: number, y: number) => {
        const physics = tierPhysics(piece.tier);
        const options = {
            restitution: physics.restitution,
            friction: physics.friction,
            frictionAir: 0.01,
            density: 0.0016 * physics.density,
            sleepThreshold: 45,
            label: "brainrot-piece",
        };
        if (piece.figure) {
            const scale = figureScale(piece.radius, piece.figure);
            const vertices = piece.figure.vertices.map((vertex) => ({
                x: vertex.x * scale,
                y: vertex.y * scale,
            }));
            const body = Bodies.fromVertices(x, y, [vertices], options);
            if (body) return body;
        }
        return Bodies.circle(x, y, piece.radius, options);
    };

    const addPieceToWorld = (piece: GamePiece, x: number, y: number) => {
        const engine = engineRef.current;
        if (!engine) return;
        const center = clampPieceCenter(piece, x, y, BOARD_LOGICAL_SIZE);
        const body = buildPieceBody(piece, center.x, center.y) as PieceBody;
        body.plugin = { pieceId: piece.id };
        bodiesRef.current.set(piece.id, body);
        Composite.add(engine.world, body);
        setPieceList([
            ...piecesRef.current,
            {
                ...piece,
                x: center.x,
                y: center.y,
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

    // A merge placeholder starts as a circle; once its generated specimen
    // arrives with a figure, swap in the hull body, keeping the motion state.
    const swapPieceBody = (piece: GamePiece) => {
        const engine = engineRef.current;
        const oldBody = bodiesRef.current.get(piece.id);
        if (!engine || !oldBody || !piece.figure) return;
        const newBody = buildPieceBody(
            piece,
            oldBody.position.x,
            oldBody.position.y,
        ) as PieceBody;
        Body.setAngle(newBody, oldBody.angle);
        Body.setVelocity(newBody, oldBody.velocity);
        Body.setAngularVelocity(newBody, oldBody.angularVelocity);
        newBody.plugin = { pieceId: piece.id };
        Composite.remove(engine.world, oldBody);
        bodiesRef.current.set(piece.id, newBody);
        Composite.add(engine.world, newBody);
    };

    // Focus the inspector on a piece (no label reveal) — used on hover.
    const selectPiece = (
        piece: Pick<
            GamePiece,
            | "id"
            | "name"
            | "description"
            | "imageUrl"
            | "catchphrase"
            | "figure"
            | "color"
            | "ink"
            | "lineage"
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
            | "catchphrase"
            | "figure"
            | "color"
            | "ink"
            | "lineage"
        >,
    ) => {
        setActiveLabelId(piece.id);
        setSelectedView(toSelectedView(piece));
    };

    const rememberObjectUrl = (specimen: Specimen) => {
        if (specimen.imageUrl?.startsWith("blob:")) {
            objectUrlsRef.current.add(specimen.imageUrl);
        }
        if (specimen.figure?.cutoutUrl.startsWith("blob:")) {
            objectUrlsRef.current.add(specimen.figure.cutoutUrl);
        }
    };

    // The narrator is garnish: failures and mid-flight mutes never block play.
    const speakCatchphrase = async (catchphrase?: string) => {
        const apiKey = apiKeyRef.current;
        if (!apiKey || !catchphrase || !voiceEnabledRef.current) return;
        try {
            let url = voiceCacheRef.current.get(catchphrase);
            if (!url) {
                url = await generateVoiceLine({ apiKey, text: catchphrase });
                voiceCacheRef.current.set(catchphrase, url);
                objectUrlsRef.current.add(url);
            }
            if (!voiceEnabledRef.current) return;
            const audio = audioRef.current ?? new Audio();
            audioRef.current = audio;
            audio.pause();
            audio.src = url;
            audio.currentTime = 0;
            await audio.play();
        } catch {
            // Silence is acceptable; the discovery card still shows the line.
        }
    };

    const toggleVoice = () => {
        const next = !voiceEnabledRef.current;
        voiceEnabledRef.current = next;
        setVoiceEnabled(next);
        if (!next) audioRef.current?.pause();
    };

    const hasPiece = (pieceId: string) =>
        nextPieceRef.current.id === pieceId ||
        piecesRef.current.some((piece) => piece.id === pieceId);

    const stopImagePending = (pieceId: string) => {
        if (nextPieceRef.current.id === pieceId) {
            const stoppedPiece = {
                ...nextPieceRef.current,
                pending: false,
                generated: false,
            };
            nextPieceRef.current = stoppedPiece;
            setNextPiece(stoppedPiece);
        }

        if (piecesRef.current.some((piece) => piece.id === pieceId)) {
            setPieceList(
                piecesRef.current.map((piece) =>
                    piece.id === pieceId
                        ? {
                              ...piece,
                              pending: false,
                              generated: false,
                          }
                        : piece,
                ),
            );
        }
    };

    const applyGeneratedSpecimen = (pieceId: string, specimen: Specimen) => {
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
            let updatedPiece: GamePiece | null = null;
            setPieceList(
                piecesRef.current.map((piece) => {
                    if (piece.id !== pieceId) return piece;
                    updatedPiece = {
                        ...piece,
                        ...specimen,
                        lineage: specimen.lineage ?? piece.lineage,
                        pending: false,
                        generated: true,
                    };
                    return updatedPiece;
                }),
            );
            if (updatedPiece) swapPieceBody(updatedPiece);
        }
    };

    const hydrateSeedPiece = async (piece: GamePiece) => {
        const apiKey = apiKeyRef.current;
        if (!apiKey) {
            return;
        }

        if (nextPieceRef.current.id === piece.id) {
            const pendingPiece = { ...nextPieceRef.current, pending: true };
            nextPieceRef.current = pendingPiece;
            setNextPiece(pendingPiece);
        }

        const cacheKey = `seed:${piece.name.toLowerCase()}`;
        const cached = generatedCacheRef.current.get(cacheKey);
        if (cached) {
            if (!hasPiece(piece.id)) return;
            const enriched = {
                ...cached,
                lineage: piece.lineage,
            };
            applyGeneratedSpecimen(piece.id, enriched);
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
            });
            if (!hasPiece(piece.id)) {
                if (generated.imageUrl?.startsWith("blob:")) {
                    URL.revokeObjectURL(generated.imageUrl);
                }
                if (generated.figure?.cutoutUrl.startsWith("blob:")) {
                    URL.revokeObjectURL(generated.figure.cutoutUrl);
                }
                return;
            }
            rememberObjectUrl(generated);
            generatedCacheRef.current.set(cacheKey, generated);
            const enriched = {
                ...generated,
                lineage: piece.lineage,
            };
            applyGeneratedSpecimen(piece.id, enriched);
            showDiscovery({ ...piece, ...enriched });
        } catch {
            stopImagePending(piece.id);
        }
    };

    const createNextDrop = (currentHighestTier = highestTierRef.current) => {
        const maxSpawnTier = Math.min(
            MAX_SPAWN_TIER,
            Math.max(0, currentHighestTier),
        );
        const availableTiers = [0];
        const eligiblePools = new Map<number, Specimen[]>();
        for (let tier = 1; tier <= maxSpawnTier; tier += 1) {
            const pool = generatedPoolRef.current.get(tier) ?? [];
            const uniquePool = uniqueSpecimensByName(pool);
            if (uniquePool.length >= MIN_SPAWN_VARIANTS_PER_TIER) {
                availableTiers.push(tier);
                eligiblePools.set(tier, uniquePool);
            }
        }
        const tier = weightedTierSample(availableTiers);
        const pool = eligiblePools.get(tier) ?? [];
        const specimen = tier === 0 ? createSeedSpecimen() : sample(pool);
        const piece = createGamePiece(tier, {
            specimen,
            generated: tier > 0,
        });
        nextPieceRef.current = piece;
        setNextPiece(piece);
        if (piecesRef.current.length === 0) {
            selectPiece(piece);
        }
        // Don't generate the seed image until the player has started — the
        // first seed is generated by startGame(). Mid-game tier-0 refills
        // still hydrate normally.
        if (tier === 0 && hasStartedRef.current) void hydrateSeedPiece(piece);
    };

    // First board click: start the game and generate the first seed. The seed
    // appears at the top to aim; the next click drops it.
    const startGame = () => {
        if (hasStartedRef.current) return;
        if (!apiKeyRef.current) {
            return;
        }
        hasStartedRef.current = true;
        setHasStarted(true);
        const piece = createGamePiece(0, { specimen: createSeedSpecimen() });
        nextPieceRef.current = piece;
        setNextPiece(piece);
        selectPiece(piece);
        void hydrateSeedPiece(piece);
    };

    const dropNextPiece = (x = aimX) => {
        if (!canUseAi) {
            return;
        }
        if (!hasStartedRef.current) {
            startGame();
            return;
        }
        if (isResolvingIdentity(nextPieceRef.current)) {
            return;
        }
        if (isCrowded) return;
        const clampedX = Math.min(
            Math.max(x, nextPieceRef.current.radius + 8),
            BOARD_LOGICAL_SIZE.width - nextPieceRef.current.radius - 8,
        );
        addPieceToWorld(nextPieceRef.current, clampedX, DROP_Y);
        setActiveLabelId(nextPieceRef.current.id);
        createNextDrop();
    };

    const resetGame = () => {
        for (const piece of piecesRef.current) removePieceFromWorld(piece.id);
        audioRef.current?.pause();
        for (const url of objectUrlsRef.current) URL.revokeObjectURL(url);
        objectUrlsRef.current.clear();
        generatedPoolRef.current.clear();
        generatedCacheRef.current.clear();
        voiceCacheRef.current.clear();
        setGenerationFocus(null);
        mergingIdsRef.current.clear();
        setPieceList([]);
        setScore(0);
        setHighestTier(0);
        highestTierRef.current = 0;
        hasStartedRef.current = false;
        setHasStarted(false);
        // Build a placeholder aim piece but DON'T generate — startGame()
        // hydrates the first seed on the next board click.
        createNextDrop(0);
    };

    // Briefly reveal the freshly-created character in the generation popover,
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
            return;
        }

        const generationParents = canonicalParents(parents);
        const cacheKey = mergeCacheKey({ targetTier, parents });
        const cached = generatedCacheRef.current.get(cacheKey);
        if (cached) {
            const enriched = {
                ...cached,
                lineage: mergeLineage(cached, parents),
            };
            applyGeneratedSpecimen(pieceId, enriched);
            showDiscovery({
                id: pieceId,
                ...enriched,
                color: RUNGS[targetTier].color,
                ink: RUNGS[targetTier].ink,
            });
            revealResult(pieceId, enriched, "cached");
            void speakCatchphrase(enriched.catchphrase);
            return;
        }

        try {
            const generated = await generateSpecimen({
                apiKey,
                parents: generationParents,
            });
            rememberObjectUrl(generated);
            generatedCacheRef.current.set(cacheKey, generated);
            if (!piecesRef.current.some((piece) => piece.id === pieceId)) {
                return;
            }
            const currentPool = generatedPoolRef.current.get(targetTier) ?? [];
            const enriched = {
                ...generated,
                lineage: mergeLineage(generated, parents),
            };
            generatedPoolRef.current.set(
                targetTier,
                [enriched, ...currentPool].slice(0, 18),
            );
            applyGeneratedSpecimen(pieceId, enriched);
            showDiscovery({
                id: pieceId,
                ...enriched,
                color: RUNGS[targetTier].color,
                ink: RUNGS[targetTier].ink,
            });
            revealResult(pieceId, enriched, "generated");
            void speakCatchphrase(enriched.catchphrase);
        } catch {
            removePieceFromWorld(pieceId);
            setPieceList(
                piecesRef.current.filter((piece) => piece.id !== pieceId),
            );
            setGenerationFocus((current) =>
                current?.id === pieceId ? null : current,
            );
        }
    };

    const mergePieces = (leftId: string, rightId: string) => {
        const left = piecesRef.current.find((piece) => piece.id === leftId);
        const right = piecesRef.current.find((piece) => piece.id === rightId);
        if (!left || !right) return;
        if (left.tier !== right.tier) return;
        if (left.tier >= RUNGS.length - 1) return;
        if (isResolvingIdentity(left) || isResolvingIdentity(right)) return;
        if (!apiKeyRef.current) {
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
        const loadingSpecimen = createLoadingSpecimen(
            `${left.name} + ${right.name}`,
            `Generating from ${left.name} and ${right.name}.`,
        );
        const specimen = {
            ...loadingSpecimen,
            lineage: mergeLineage(loadingSpecimen, [left, right]),
        };
        const result = createGamePiece(targetTier, {
            specimen,
            parents,
            pending: true,
            generated: false,
        });

        addPieceToWorld(result, center.x, center.y);
        setGenerationFocus({
            id: result.id,
            parents: [left, right],
            status: "generating",
        });
        setScore((current) => current + (targetTier + 1) * 10);
        if (targetTier > highestTierRef.current) {
            highestTierRef.current = targetTier;
            setHighestTier(targetTier);
        }
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
        const scale = bounds.width / BOARD_LOGICAL_SIZE.width || 1;
        setAimX((event.clientX - bounds.left) / scale);
    };

    const handleBoardPointerDown = (
        event: ReactPointerEvent<HTMLDivElement>,
    ) => {
        if (event.button !== 0) return;
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        const scale = bounds.width / BOARD_LOGICAL_SIZE.width || 1;
        const x = (event.clientX - bounds.left) / scale;
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

    // Minimal legend: the distinct characters currently on the board (icon →
    // name), collapsed by name and ordered biggest-tier first.
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
        BOARD_LOGICAL_SIZE.width - nextPiece.radius - 8,
    );

    return {
        boardRef,
        pieces,
        nextPiece,
        score,
        highestTier,
        isCrowded,
        activeLabelId,
        generationFocus,
        selectedView,
        rungs: RUNGS,
        canUseAi,
        canDrop,
        hasStarted,
        voiceEnabled,
        legendEntries,
        dropPreviewX,
        viewScale,
        selectPiece,
        showDiscovery,
        speakCatchphrase,
        toggleVoice,
        dropNextPiece,
        resetGame,
        updateAim,
        handleBoardPointerDown,
    };
}
