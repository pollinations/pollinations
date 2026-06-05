import { PolliProvider, useAuthState } from "@pollinations/sdk/react";
import { BeakerIcon, Button, Chip } from "@pollinations/ui";
import { AppUserMenu } from "@pollinations/ui/app-user-menu/sdk";
import logoWordmarkUrl from "@pollinations/ui/assets/logo-wordmark.svg";
import { Balance } from "@pollinations/ui/wallet/sdk";
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

const APP_KEY = import.meta.env.VITE_POLLINATIONS_APP_KEY?.trim() ?? "";
const HAS_APP_KEY = APP_KEY.startsWith("pk_");
const APP_THEME = "green";
const IS_DEV = import.meta.env.DEV;

type LifeMergeAppProps = {
    hasAppKey: boolean;
};

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
    const game = useGameEngine({ apiKey, isLoggedIn, isHydrated });

    const [presetOpen, setPresetOpen] = useState(false);

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
                    <Balance />
                    <AppUserMenu dashboardHref="https://enter.pollinations.ai" />
                </div>
            </header>

            <main className="game-layout">
                <section className="play-column">
                    <div className="board-frame">
                        <div
                            ref={game.boardRef}
                            className={`merge-board ${
                                game.isCrowded ? "is-crowded" : ""
                            }`}
                            onPointerMove={game.updateAim}
                            onPointerDown={game.handleBoardPointerDown}
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
                                className="loss-line"
                                style={{ top: LOSS_LINE }}
                            >
                                <span />
                            </div>
                            {game.hasStarted ? (
                                <div
                                    className="aim-line"
                                    style={{ left: game.dropPreviewX }}
                                />
                            ) : null}
                            <div
                                className={`drop-preview ${
                                    game.canDrop ? "" : "is-waiting"
                                } ${game.hasStarted ? "" : "is-hidden"}`}
                                title={pieceTitle(game.nextPiece)}
                                style={
                                    {
                                        "--piece-x": `${game.dropPreviewX}px`,
                                        "--piece-y": `${DROP_Y}px`,
                                        "--piece-size": `${game.nextPiece.radius * 2}px`,
                                        "--piece-color": game.nextPiece.color,
                                        "--piece-ink": game.nextPiece.ink,
                                    } as CSSProperties
                                }
                            >
                                <img
                                    src={game.nextPiece.imageUrl}
                                    alt=""
                                    draggable={false}
                                />
                                {game.nextPiece.pending ? (
                                    <span
                                        className="piece-spinner"
                                        aria-hidden="true"
                                    />
                                ) : null}
                                <span className="piece-label">
                                    <span className="piece-label-name">
                                        {game.nextPiece.name}
                                    </span>
                                    {game.nextPiece.pending ? (
                                        <span className="piece-label-status">
                                            Making…
                                        </span>
                                    ) : null}
                                </span>
                            </div>
                            {game.pieces.map((piece) => (
                                <button
                                    type="button"
                                    key={piece.id}
                                    className={`life-piece ${
                                        piece.pending ? "is-pending" : ""
                                    } ${piece.generated ? "is-generated" : ""} ${
                                        piece.y < piece.radius + 48
                                            ? "is-high"
                                            : ""
                                    } ${
                                        piece.id === game.activeLabelId
                                            ? "is-labeled"
                                            : ""
                                    }`}
                                    title={pieceTitle(piece)}
                                    onPointerEnter={() =>
                                        game.setLineageView(piece.lineage)
                                    }
                                    onClick={() =>
                                        game.setLineageView(piece.lineage)
                                    }
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
                                                Making…
                                            </span>
                                        ) : null}
                                    </span>
                                </button>
                            ))}
                            {!game.hasStarted ? (
                                <div className="board-start">
                                    <div className="board-start-card">
                                        <BeakerIcon />
                                        <strong>Choose a world</strong>
                                        <div className="board-start-presets">
                                            {LIFE_PRESETS.map((preset) => (
                                                <button
                                                    key={preset.id}
                                                    type="button"
                                                    className={`board-start-preset ${
                                                        preset.id ===
                                                        game.presetId
                                                            ? "is-active"
                                                            : ""
                                                    }`}
                                                    onClick={() =>
                                                        game.selectPreset(
                                                            preset.id,
                                                        )
                                                    }
                                                >
                                                    <strong>
                                                        {preset.label}
                                                    </strong>
                                                    <small>{preset.axis}</small>
                                                </button>
                                            ))}
                                        </div>
                                        <span className="board-start-hint">
                                            {game.canUseAi
                                                ? game.presetId
                                                    ? "Click the board to start"
                                                    : "Pick a world above"
                                                : "Authorize above to start"}
                                        </span>
                                    </div>
                                </div>
                            ) : game.pieces.length === 0 ? (
                                <div className="board-empty">
                                    <BeakerIcon />
                                    <span>
                                        {game.nextPiece.pending
                                            ? "Making the first piece…"
                                            : "Click the board to drop"}
                                    </span>
                                </div>
                            ) : null}
                            {game.generationFocus ? (
                                <output
                                    className={`generation-focus is-${game.generationFocus.status}`}
                                >
                                    <div className="generation-focus-head">
                                        <span>
                                            {game.generationFocus.status ===
                                            "result"
                                                ? "New discovery"
                                                : game.generationFocus
                                                        .status === "cached"
                                                  ? "From cache"
                                                  : "Combining"}
                                        </span>
                                    </div>
                                    <div className="generation-parents">
                                        {game.generationFocus.parents.map(
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
                                                    <img
                                                        src={parent.imageUrl}
                                                        alt=""
                                                    />
                                                    <div className="generation-parent-text">
                                                        <strong>
                                                            {parent.name}
                                                        </strong>
                                                        <p>
                                                            {parent.description}
                                                        </p>
                                                    </div>
                                                </div>
                                            ),
                                        )}
                                    </div>
                                    {game.generationFocus.result ? (
                                        <div className="generation-result">
                                            <span className="generation-arrow">
                                                ↓
                                            </span>
                                            <img
                                                src={
                                                    game.generationFocus.result
                                                        .imageUrl
                                                }
                                                alt=""
                                            />
                                            <div className="generation-result-text">
                                                <strong>
                                                    {
                                                        game.generationFocus
                                                            .result.name
                                                    }
                                                </strong>
                                                <p>
                                                    {
                                                        game.generationFocus
                                                            .result.description
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
                            ) : null}
                        </div>
                    </div>

                    <div className="play-footer">
                        <button
                            type="button"
                            className="next-orb"
                            title={pieceTitle(game.nextPiece)}
                            onClick={() =>
                                game.setLineageView(game.nextPiece.lineage)
                            }
                            style={
                                {
                                    "--piece-color": game.nextPiece.color,
                                    "--piece-ink": game.nextPiece.ink,
                                } as CSSProperties
                            }
                        >
                            <img src={game.nextPiece.imageUrl} alt="" />
                            <span className="next-orb-caption">
                                {game.nextPiece.pending
                                    ? "…"
                                    : game.nextPiece.name}
                            </span>
                        </button>
                        <div className="play-footer-status" aria-live="polite">
                            <strong>{game.score}</strong>
                            <span>
                                {game.highestTier + 1}/{game.rungs.length} sizes
                                · {game.pieces.length} on board
                            </span>
                        </div>
                        <div className="toolbar-buttons">
                            <Button
                                onClick={() => game.dropNextPiece()}
                                disabled={!game.canDrop}
                            >
                                Drop
                            </Button>
                            <Button theme="amber" onClick={game.resetGame}>
                                Reset
                            </Button>
                        </div>
                    </div>
                </section>

                <aside className="side-panel">
                    {/* Preset selection lives on the board start screen pre-game;
                        in-game this card is the locked inspector + size legend. */}
                    {game.hasStarted ? (
                        <section
                            className={`preset-card ${presetOpen ? "is-open" : ""}`}
                        >
                            <header className="preset-card-head">
                                <div>
                                    <span className="preset-card-kicker">
                                        World
                                    </span>
                                    <strong>{game.activePreset.label}</strong>
                                    <small>
                                        {game.activeStyle.label} style
                                    </small>
                                </div>
                                {IS_DEV ? (
                                    <button
                                        type="button"
                                        className="preset-toggle"
                                        aria-expanded={presetOpen}
                                        onClick={() =>
                                            setPresetOpen((open) => !open)
                                        }
                                    >
                                        {presetOpen ? "Done" : "Edit"}
                                    </button>
                                ) : null}
                            </header>

                            <p className="preset-axis-desc">
                                {game.activePreset.axis}
                            </p>

                            {presetOpen && IS_DEV ? (
                                <div className="preset-editor">
                                    <label>
                                        <span>Seeds</span>
                                        <textarea
                                            value={game.activeEdit.seedsText}
                                            disabled={game.presetsLocked}
                                            rows={4}
                                            onChange={(event) =>
                                                game.updateActivePresetEdit(
                                                    "seedsText",
                                                    event.currentTarget.value,
                                                )
                                            }
                                        />
                                    </label>
                                    <label>
                                        <span>Evolution</span>
                                        <textarea
                                            value={
                                                game.activeEdit.evolutionPrompt
                                            }
                                            disabled={game.presetsLocked}
                                            rows={3}
                                            onChange={(event) =>
                                                game.updateActivePresetEdit(
                                                    "evolutionPrompt",
                                                    event.currentTarget.value,
                                                )
                                            }
                                        />
                                    </label>
                                    <Button
                                        onClick={game.applyPresetEdit}
                                        disabled={game.presetsLocked}
                                    >
                                        Apply
                                    </Button>
                                </div>
                            ) : null}

                            <ul className="rung-list" aria-label="Merge sizes">
                                {game.rungRows.map(
                                    ({ rung, index, active }) => (
                                        <li
                                            key={rung.id}
                                            className={`rung-row ${
                                                active ? "is-active" : ""
                                            }`}
                                            title={`Size ${index + 1}: same colour merges`}
                                        >
                                            <span
                                                style={
                                                    {
                                                        "--piece-color":
                                                            rung.color,
                                                        "--piece-ink": rung.ink,
                                                    } as CSSProperties
                                                }
                                            />
                                        </li>
                                    ),
                                )}
                            </ul>
                        </section>
                    ) : null}

                    <section className="lineage-card">
                        <header>
                            <strong>Lineage</strong>
                            <small>{game.generatedPoolSize} generated</small>
                        </header>
                        <div className="lineage-tree">
                            <LineageTree node={game.lineageView} />
                        </div>
                    </section>
                </aside>
            </main>
        </div>
    );
}

export default App;
