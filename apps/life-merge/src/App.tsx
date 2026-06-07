import { PolliProvider, useAuthState } from "@pollinations/sdk/react";
import { BeakerIcon, Button, Chip } from "@pollinations/ui";
import { AppUserMenu } from "@pollinations/ui/app-user-menu/sdk";
import logoWordmarkUrl from "@pollinations/ui/assets/logo-wordmark.svg";
import { type CSSProperties, useState } from "react";
import { type GamePiece, LIFE_PRESETS, type LineageNode } from "./life";
import {
    BOARD_ASPECT_RATIO,
    BOARD_MAX_WIDTH,
    BOARD_WIDTH_FROM_HEIGHT,
    DROP_Y,
    LOSS_LINE,
    useGameEngine,
} from "./useGameEngine";

const APP_THEME = "green";

const brandWordmarkMask: CSSProperties = {
    WebkitMask: `url(${logoWordmarkUrl}) center / contain no-repeat`,
    mask: `url(${logoWordmarkUrl}) center / contain no-repeat`,
};

function pieceTitle(
    piece: Pick<GamePiece, "name" | "description" | "lineage">,
) {
    const parents = piece.lineage.parents
        ? ` Parents: ${piece.lineage.parents[0].name} + ${piece.lineage.parents[1].name}.`
        : "";
    return `${piece.name}: ${piece.description}.${parents}`;
}

function parentTitle(parents: [LineageNode, LineageNode]) {
    return [
        `${parents[0].name}: ${parents[0].description}.`,
        `${parents[1].name}: ${parents[1].description}.`,
    ].join(" ");
}

// Only a real generated image (a blob:/http URL) is rendered. The data: SVG
// placeholder is never shown — the coloured circle stands in until the real
// image arrives.
function realImage(imageUrl?: string): string | undefined {
    return imageUrl && !imageUrl.startsWith("data:") ? imageUrl : undefined;
}

function FloatingPieceLabel({
    name,
    pending,
    active,
    x,
    y,
}: {
    name: string;
    pending?: boolean;
    active?: boolean;
    x: number;
    y: number;
}) {
    return (
        <span
            className={`piece-label ${pending ? "is-pending" : ""} ${
                active ? "is-active" : ""
            }`}
            style={
                {
                    "--label-x": `${x}px`,
                    "--label-y": `${y}px`,
                } as CSSProperties
            }
        >
            <span className="piece-label-name">{name}</span>
            {pending ? (
                <span className="piece-label-status">Making…</span>
            ) : null}
        </span>
    );
}

function App() {
    return (
        <PolliProvider
            appKey=""
            permissions={["profile", "usage"]}
            models={["claude", "zimage"]}
            budget={6}
            expiry={7}
        >
            <LifeMergeApp />
        </PolliProvider>
    );
}

function LifeMergeApp() {
    const { apiKey, isLoggedIn, isHydrated } = useAuthState();
    const game = useGameEngine({ apiKey, isLoggedIn, isHydrated });
    const generationFocusId = game.generationFocus?.id ?? null;
    const [inspectorOverride, setInspectorOverride] = useState<{
        generationFocusId: string | null;
        pieceId: string;
    } | null>(null);
    const inspectorOverrideId =
        inspectorOverride?.generationFocusId === generationFocusId
            ? inspectorOverride.pieceId
            : null;
    const showInspectorOverride = (pieceId: string) =>
        setInspectorOverride({ generationFocusId, pieceId });
    const visibleGenerationFocus =
        game.generationFocus &&
        (!inspectorOverrideId || inspectorOverrideId === generationFocusId)
            ? game.generationFocus
            : null;
    const scaled = (value: number) => `${value * game.viewScale}px`;

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
                        SuikaCraft
                    </Chip>
                    {game.hasStarted ? (
                        <Chip theme="amber" size="sm">
                            {game.activePreset.label}
                        </Chip>
                    ) : null}
                    {game.hasStarted ? (
                        <span className="topbar-score" aria-live="polite">
                            <strong>{game.score}</strong>
                            <small>
                                {game.highestTier + 1}/{game.rungs.length} ·{" "}
                                {game.pieces.length} in play
                            </small>
                        </span>
                    ) : null}
                    {game.hasStarted ? (
                        <Button
                            theme="amber"
                            size="sm"
                            onClick={game.resetGame}
                        >
                            Reset
                        </Button>
                    ) : null}
                    <AppUserMenu dashboardHref="https://enter.pollinations.ai" />
                </div>
            </header>

            <main className="game-layout">
                <section className="play-column">
                    <div className="board-frame">
                        <div
                            className="board-stack"
                            style={
                                {
                                    "--board-aspect-ratio": BOARD_ASPECT_RATIO,
                                    "--board-max-width": BOARD_MAX_WIDTH,
                                    "--board-width-from-height":
                                        BOARD_WIDTH_FROM_HEIGHT,
                                } as CSSProperties
                            }
                        >
                            <div
                                ref={game.boardRef}
                                className={`merge-board ${
                                    game.isCrowded ? "is-crowded" : ""
                                }`}
                                onPointerMove={game.updateAim}
                                onPointerDown={game.handleBoardPointerDown}
                            >
                                <div
                                    className="loss-line"
                                    style={{ top: scaled(LOSS_LINE) }}
                                >
                                    <span />
                                </div>
                                {game.hasStarted ? (
                                    <div
                                        className="aim-line"
                                        style={{
                                            left: scaled(game.dropPreviewX),
                                        }}
                                    />
                                ) : null}
                                <div
                                    className={`drop-preview ${
                                        game.canDrop ? "" : "is-waiting"
                                    } ${game.hasStarted ? "" : "is-hidden"}`}
                                    title={pieceTitle(game.nextPiece)}
                                    style={
                                        {
                                            "--piece-x": scaled(
                                                game.dropPreviewX,
                                            ),
                                            "--piece-y": scaled(DROP_Y),
                                            "--piece-size": scaled(
                                                game.nextPiece.radius * 2,
                                            ),
                                            "--piece-color":
                                                game.nextPiece.color,
                                            "--piece-ink": game.nextPiece.ink,
                                        } as CSSProperties
                                    }
                                >
                                    {game.nextPiece.pending ? (
                                        <span
                                            className="piece-spinner"
                                            aria-hidden="true"
                                        />
                                    ) : realImage(game.nextPiece.imageUrl) ? (
                                        <img
                                            src={realImage(
                                                game.nextPiece.imageUrl,
                                            )}
                                            alt=""
                                            draggable={false}
                                        />
                                    ) : null}
                                </div>
                                {game.pieces.map((piece) => (
                                    <button
                                        type="button"
                                        key={piece.id}
                                        className={`life-piece ${
                                            piece.pending ? "is-pending" : ""
                                        } ${
                                            piece.generated
                                                ? "is-generated"
                                                : ""
                                        } ${
                                            piece.id === game.activeLabelId
                                                ? "is-labeled"
                                                : ""
                                        }`}
                                        title={pieceTitle(piece)}
                                        onPointerEnter={() => {
                                            showInspectorOverride(piece.id);
                                            game.showDiscovery(piece);
                                        }}
                                        onPointerLeave={(event) => {
                                            if (event.pointerType !== "touch") {
                                                setInspectorOverride(null);
                                            }
                                        }}
                                        onClick={() => {
                                            showInspectorOverride(piece.id);
                                            game.showDiscovery(piece);
                                        }}
                                        style={
                                            {
                                                "--piece-x": scaled(piece.x),
                                                "--piece-y": scaled(piece.y),
                                                "--piece-size": scaled(
                                                    piece.radius * 2,
                                                ),
                                                "--piece-rotate": `${piece.angle}rad`,
                                                "--piece-color": piece.color,
                                                "--piece-ink": piece.ink,
                                            } as CSSProperties
                                        }
                                    >
                                        {piece.pending ? (
                                            <span
                                                className="piece-spinner"
                                                aria-hidden="true"
                                            />
                                        ) : realImage(piece.imageUrl) ? (
                                            <img
                                                src={realImage(piece.imageUrl)}
                                                alt=""
                                                draggable={false}
                                            />
                                        ) : null}
                                    </button>
                                ))}
                                {!game.hasStarted ? (
                                    <div className="board-start">
                                        <div className="board-start-card">
                                            <BeakerIcon />
                                            <strong>
                                                Choose a world to start
                                            </strong>
                                            <div className="board-start-presets">
                                                {LIFE_PRESETS.map((preset) => (
                                                    <button
                                                        key={preset.id}
                                                        type="button"
                                                        className="board-start-preset"
                                                        disabled={
                                                            !game.canUseAi
                                                        }
                                                        onClick={() =>
                                                            game.startWithPreset(
                                                                preset.id,
                                                            )
                                                        }
                                                    >
                                                        <strong>
                                                            {preset.label}
                                                        </strong>
                                                        <small>
                                                            {preset.axis}
                                                        </small>
                                                    </button>
                                                ))}
                                            </div>
                                            {!game.canUseAi ? (
                                                <span className="board-start-hint">
                                                    Authorize above to start
                                                </span>
                                            ) : null}
                                        </div>
                                    </div>
                                ) : game.pieces.length === 0 ? (
                                    <div className="board-empty">
                                        <BeakerIcon />
                                        <span>Click the board to drop</span>
                                    </div>
                                ) : null}
                            </div>
                            <div
                                className="piece-label-layer"
                                aria-hidden="true"
                            >
                                {game.hasStarted ? (
                                    <FloatingPieceLabel
                                        name={game.nextPiece.name}
                                        pending={game.nextPiece.pending}
                                        active
                                        x={game.dropPreviewX * game.viewScale}
                                        y={
                                            (DROP_Y -
                                                game.nextPiece.radius -
                                                10) *
                                            game.viewScale
                                        }
                                    />
                                ) : null}
                                {game.pieces.map((piece) => (
                                    <FloatingPieceLabel
                                        key={piece.id}
                                        name={piece.name}
                                        pending={piece.pending}
                                        active={piece.id === game.activeLabelId}
                                        x={piece.x * game.viewScale}
                                        y={
                                            (piece.y - piece.radius - 10) *
                                            game.viewScale
                                        }
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                </section>

                <aside className="side-panel">
                    {visibleGenerationFocus ? (
                        <output
                            className={`generation-focus is-${visibleGenerationFocus.status}`}
                        >
                            <div className="generation-focus-head">
                                <span>
                                    {visibleGenerationFocus.status === "result"
                                        ? "New discovery"
                                        : "Combining"}
                                </span>
                            </div>
                            <div className="generation-parents">
                                {visibleGenerationFocus.parents.map(
                                    (parent, index) => (
                                        <div
                                            className="generation-parent"
                                            key={parent.id}
                                        >
                                            {index === 1 ? (
                                                <span className="generation-plus">
                                                    +
                                                </span>
                                            ) : null}
                                            <img src={parent.imageUrl} alt="" />
                                            <div className="generation-parent-text">
                                                <strong>{parent.name}</strong>
                                                <p>{parent.description}</p>
                                            </div>
                                        </div>
                                    ),
                                )}
                            </div>
                            {visibleGenerationFocus.result ? (
                                <div className="generation-result">
                                    <span className="generation-arrow">↓</span>
                                    <img
                                        src={
                                            visibleGenerationFocus.result
                                                .imageUrl
                                        }
                                        alt=""
                                    />
                                    <div className="generation-result-text">
                                        <strong>
                                            {visibleGenerationFocus.result.name}
                                        </strong>
                                        <p>
                                            {
                                                visibleGenerationFocus.result
                                                    .description
                                            }
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <div className="generation-pulse">
                                    <span />
                                </div>
                            )}
                        </output>
                    ) : (
                        /* Inspector: the focused piece's icon, name,
                           description, and immediate parents when generated. */
                        <section className="selected-card">
                            <div
                                className="selected-icon"
                                style={
                                    {
                                        "--piece-color":
                                            game.selectedView.color,
                                        "--piece-ink": game.selectedView.ink,
                                    } as CSSProperties
                                }
                            >
                                {realImage(game.selectedView.imageUrl) ? (
                                    <img
                                        src={realImage(
                                            game.selectedView.imageUrl,
                                        )}
                                        alt=""
                                        draggable={false}
                                    />
                                ) : null}
                            </div>
                            <div className="selected-text">
                                <strong>{game.selectedView.name}</strong>
                                <p>{game.selectedView.description}</p>
                                {game.selectedView.lineage.parents ? (
                                    <small
                                        className="selected-parents"
                                        title={parentTitle(
                                            game.selectedView.lineage.parents,
                                        )}
                                    >
                                        <span>from</span>
                                        <b>
                                            {
                                                game.selectedView.lineage
                                                    .parents[0].name
                                            }
                                        </b>
                                        <span>+</span>
                                        <b>
                                            {
                                                game.selectedView.lineage
                                                    .parents[1].name
                                            }
                                        </b>
                                    </small>
                                ) : null}
                            </div>
                        </section>
                    )}

                    {game.legendEntries.length > 0 ? (
                        <section className="legend-card">
                            <header>
                                <strong>In play</strong>
                                <small>{game.legendEntries.length}</small>
                            </header>
                            <ul className="legend-list">
                                {game.legendEntries.map((entry) => (
                                    <li key={entry.name}>
                                        <button
                                            type="button"
                                            className="legend-row"
                                            title={pieceTitle(entry)}
                                            onPointerEnter={() => {
                                                showInspectorOverride(entry.id);
                                                game.selectPiece(entry);
                                            }}
                                            onPointerLeave={(event) => {
                                                if (
                                                    event.pointerType !==
                                                    "touch"
                                                ) {
                                                    setInspectorOverride(null);
                                                }
                                            }}
                                            onClick={() => {
                                                showInspectorOverride(entry.id);
                                                game.showDiscovery(entry);
                                            }}
                                        >
                                            <span
                                                className="legend-icon"
                                                style={
                                                    {
                                                        "--piece-color":
                                                            entry.color,
                                                        "--piece-ink":
                                                            entry.ink,
                                                    } as CSSProperties
                                                }
                                            >
                                                {realImage(entry.imageUrl) ? (
                                                    <img
                                                        src={realImage(
                                                            entry.imageUrl,
                                                        )}
                                                        alt=""
                                                        draggable={false}
                                                    />
                                                ) : null}
                                            </span>
                                            <span className="legend-name">
                                                {entry.name}
                                            </span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    ) : null}
                </aside>
            </main>
        </div>
    );
}

export default App;
