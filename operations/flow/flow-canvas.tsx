import {
    AppIcon,
    Button,
    CheckIcon,
    ChevronIcon,
    Dropdown,
    DropdownItem,
    ExternalLinkIcon,
    GitBranchIcon,
    IconButton,
    MoonIcon,
    ScrollArea,
    SunIcon,
    setColorMode,
    TabButton,
    useColorMode,
    XIcon,
} from "@pollinations/ui";
import logoUrl from "@pollinations/ui/brand/mark.svg";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { FlowConditionsProvider } from "./conditions";
import { appLoginScreens } from "./flow-app-login";
import { type CanvasScreen, canvasGroups } from "./flow-canvas-data";
import { dashboardSections } from "./flow-dashboard";
import { getDeviceFlow } from "./flow-device";
import {
    edgeLabelPosition,
    edgePoints,
    getFlowFocus,
    nodeSize,
    paper,
} from "./flow-diagram";
import { ScreenGallery } from "./flow-gallery";
import { galleryScreensForFlow } from "./flow-gallery-data";
import { GridIcon, SmartphoneIcon } from "./flow-icons";
import { Journey } from "./flow-journey";
import {
    entrances,
    type JourneyEntrance,
    type JourneyLocation,
    type JourneySection,
    type JourneySelection,
} from "./flow-journey-state";
import { ScreenContent, ScreenOwnership } from "./flow-preview";
import { FlowSource } from "./flow-source";
import {
    ReviewHeader,
    ReviewJourney,
    ReviewJourneyTab,
    ReviewPanel,
    ReviewProvider,
    ReviewStartOver,
    useReview,
} from "./review";
import type { ReviewCase } from "./review-cases";
import "@frontend/style.css";
import "./flow-canvas.css";

const screens = canvasGroups.flatMap((group) => group.screens);
const flowOptions: Record<
    Exclude<JourneyEntrance, "admin">,
    { id: JourneySection; label: string }[]
> = {
    app: [
        { id: "main", label: "Login" },
        { id: "topup", label: "Top up" },
    ],
    device: [
        { id: "main", label: "Enter Code" },
        { id: "link", label: "Open Device Link" },
    ],
    account: dashboardSections,
};

const requestedMode = new URLSearchParams(location.search).get("theme");
if (requestedMode === "light" || requestedMode === "dark")
    setColorMode(requestedMode);

function Canvas({
    entrance,
    location: journeyLocation,
    gallery = false,
    desktop,
}: {
    entrance: JourneySelection;
    location: JourneyLocation;
    gallery?: boolean;
    desktop: boolean;
}) {
    const { mode } = useColorMode();
    const review = useReview();
    const [selected, setSelected] = useState<CanvasScreen | null>(null);
    const inspector = useRef<HTMLElement>(null);
    const inspectorOpen = selected !== null;
    useEffect(() => {
        if (!inspectorOpen) return;
        const previous = document.activeElement as HTMLElement | null;
        inspector.current?.focus();
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") setSelected(null);
        };
        window.addEventListener("keydown", closeOnEscape);
        return () => {
            window.removeEventListener("keydown", closeOnEscape);
            if (previous?.isConnected) previous.focus();
        };
    }, [inspectorOpen]);
    useEffect(() => {
        const screen = review?.screen;
        if (screen) setSelected((current) => (current ? screen : null));
    }, [review?.screen]);
    const isAppLogin = entrance.world === "app" && entrance.section === "main";
    const showOwnership =
        isAppLogin || ["device", "admin"].includes(entrance.world);
    const navigationOrder = useRef(screens);
    const handlePreviewKey = useCallback(
        (event: KeyboardEvent) => {
            if (
                !selected ||
                event.defaultPrevented ||
                event.altKey ||
                event.ctrlKey ||
                event.metaKey ||
                event.shiftKey ||
                !["ArrowLeft", "ArrowRight"].includes(event.key)
            )
                return;
            const target = event.target as HTMLElement | null;
            if (
                target?.closest?.(
                    '.flow-conditions, input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="slider"], [role="spinbutton"], [role="combobox"], [role="listbox"], [role="menu"], [role="tablist"]',
                )
            )
                return;
            const index = navigationOrder.current.findIndex(
                (entry) =>
                    entry.id === selected.id ||
                    (review?.resolve(entry)?.pageId === selected.id &&
                        review?.resolve(entry)?.family ===
                            review?.selected?.family),
            );
            if (index < 0) return;
            const next =
                navigationOrder.current[
                    index + (event.key === "ArrowRight" ? 1 : -1)
                ];
            event.preventDefault();
            if (!next) return;
            setSelected(next);
            const recipe = review?.resolve(next);
            if (recipe) review?.select(recipe.id);
        },
        [selected, review?.resolve, review?.select, review?.selected?.family],
    );
    useEffect(() => {
        if (!selected) return;
        window.addEventListener("keydown", handlePreviewKey);
        return () => window.removeEventListener("keydown", handlePreviewKey);
    }, [selected, handlePreviewKey]);
    const [view, setView] = useState({ x: 30, y: 20, scale: 0.32 });
    const [highlight, setHighlight] = useState<string | null>(null);
    const canvas = useRef<HTMLDivElement>(null);
    const focus = useMemo(
        () => getFlowFocus(entrance.world, entrance.section),
        [entrance.world, entrance.section],
    );
    const fitAll = () => {
        setHighlight(null);
        focusArea(getFlowFocus(entrance.world, entrance.section).bounds);
    };
    const viewRef = useRef(view);
    viewRef.current = view;
    const drag = useRef<{
        x: number;
        y: number;
        left: number;
        top: number;
    } | null>(null);

    const zoomAt = useCallback((scale: number, x: number, y: number) => {
        setView((old) => {
            const next = Math.max(0.12, Math.min(1.6, scale));
            return {
                scale: next,
                x: x - ((x - old.x) * next) / old.scale,
                y: y - ((y - old.y) * next) / old.scale,
            };
        });
    }, []);
    const focusArea = useCallback(
        (area: { x: number; y: number; width: number; height: number }) => {
            const el = canvas.current;
            if (!el) return;
            const scale = Math.min(
                (el.clientWidth - 60) / area.width,
                (el.clientHeight - 60) / area.height,
                1,
            );
            setView({
                scale,
                x: (el.clientWidth - area.width * scale) / 2 - area.x * scale,
                y: (el.clientHeight - area.height * scale) / 2 - area.y * scale,
            });
        },
        [],
    );
    useEffect(() => {
        const selectedFocus = getFlowFocus(entrance.world, entrance.section);
        const currentNode =
            entrance.world === "device"
                ? getDeviceFlow(entrance.section).map.nodeForState(
                      journeyLocation.node,
                  )
                : journeyLocation.node;
        setHighlight(
            selectedFocus.nodeIds.has(currentNode) ? currentNode : null,
        );
        focusArea(selectedFocus.bounds);
    }, [entrance, journeyLocation.node, focusArea]);
    useEffect(() => {
        if (review?.selected) setHighlight(review.selected.family);
    }, [review?.selected]);
    // biome-ignore lint/correctness/useExhaustiveDependencies: Close the inspector only when the selected flow changes.
    useEffect(() => setSelected(null), [entrance.world, entrance.section]);
    const selectedScreens =
        entrance.world === "app" && entrance.section === "main"
            ? [...appLoginScreens.values()]
            : entrance.world === "device"
              ? [...getDeviceFlow(entrance.section).map.screens.values()]
              : galleryScreensForFlow(entrance.world, entrance.section);
    const mapScreens = focus.nodes.flatMap((node) => {
        const entry =
            selectedScreens.find((entry) => entry.id === node.screen) ??
            screens.find((entry) => entry.id === node.screen);
        return entry ? [entry] : [];
    });
    const mapSections = [
        {
            title:
                entrance.world === "admin"
                    ? "Admin"
                    : entrance.world === "device"
                      ? `Devices · ${entrance.section === "link" ? "Open Device Link" : "Enter Code"}`
                      : entrance.world === "account"
                        ? `Dashboard · ${dashboardSections.find(({ id }) => id === entrance.section)?.label ?? "Login"}`
                        : `Apps · ${entrance.section === "topup" ? "Top up" : "Login"}`,
            note: "Shared screen states · external provider and app handoffs",
            x: focus.bounds.x - 30,
            y: focus.bounds.y - 80,
            width: focus.bounds.width + 60,
            height: focus.bounds.height + 110,
        },
    ];
    const zoom = (factor: number) => {
        const el = canvas.current;
        if (el)
            zoomAt(
                view.scale * factor,
                el.clientWidth / 2,
                el.clientHeight / 2,
            );
    };
    useEffect(() => {
        const url = new URL(location.href);
        url.searchParams.set("theme", mode);
        history.replaceState({}, "", url);
    }, [mode]);
    useEffect(() => {
        const el = canvas.current;
        if (!el) return;
        const wheel = (event: WheelEvent) => {
            event.preventDefault();
            if (event.ctrlKey || event.metaKey) {
                const rect = el.getBoundingClientRect();
                zoomAt(
                    viewRef.current.scale * Math.exp(-event.deltaY * 0.008),
                    event.clientX - rect.left,
                    event.clientY - rect.top,
                );
            } else {
                const unit =
                    event.deltaMode === 1
                        ? 16
                        : event.deltaMode === 2
                          ? el.clientHeight
                          : 1;
                setView((old) => ({
                    ...old,
                    x: old.x - event.deltaX * unit,
                    y: old.y - event.deltaY * unit,
                }));
            }
        };
        el.addEventListener("wheel", wheel, { passive: false });
        return () => el.removeEventListener("wheel", wheel);
    }, [zoomAt]);
    const close = () => setSelected(null);
    const stopPan = () => {
        drag.current = null;
        canvas.current?.classList.remove("is-panning");
    };
    return (
        <>
            {gallery ? (
                <ScreenGallery
                    key={`${entrance.world}-${entrance.section}`}
                    entrance={entrance}
                    desktop={desktop}
                />
            ) : (
                <>
                    <div className="flow-view-tools">
                        <Button size="sm" onClick={fitAll}>
                            Fit flow
                        </Button>
                        <Button
                            size="sm"
                            aria-label="Zoom out"
                            onClick={() => zoom(1 / 1.25)}
                        >
                            −
                        </Button>
                        <output className="canvas-zoom" aria-label="Zoom level">
                            {Math.round(view.scale * 100)}%
                        </output>
                        <Button
                            size="sm"
                            aria-label="Zoom in"
                            onClick={() => zoom(1.25)}
                        >
                            +
                        </Button>
                    </div>
                    <ScrollArea
                        axis="both"
                        role="region"
                        ref={canvas}
                        className="screen-canvas"
                        tabIndex={0}
                        aria-label="Connection flow diagram"
                        style={{
                            backgroundPosition: `${view.x}px ${view.y}px`,
                            backgroundSize: `${Math.max(16, 24 * view.scale)}px ${Math.max(16, 24 * view.scale)}px`,
                        }}
                        onKeyDown={(event) => {
                            if (event.target !== event.currentTarget) return;
                            const moves: Record<string, [number, number]> = {
                                ArrowLeft: [80, 0],
                                ArrowRight: [-80, 0],
                                ArrowUp: [0, 80],
                                ArrowDown: [0, -80],
                            };
                            if (moves[event.key]) {
                                event.preventDefault();
                                const [x, y] = moves[event.key];
                                setView((old) => ({
                                    ...old,
                                    x: old.x + x,
                                    y: old.y + y,
                                }));
                            } else if (event.key === "+" || event.key === "=")
                                zoom(1.25);
                            else if (event.key === "-") zoom(1 / 1.25);
                            else if (event.key === "0") fitAll();
                        }}
                        onPointerDown={(event) => {
                            if (
                                event.button !== 0 ||
                                (event.target as Element).closest(
                                    "button, a, input",
                                )
                            )
                                return;
                            const target = event.currentTarget;
                            drag.current = {
                                x: event.clientX,
                                y: event.clientY,
                                left: view.x,
                                top: view.y,
                            };
                            target.setPointerCapture(event.pointerId);
                            target.classList.add("is-panning");
                            event.preventDefault();
                        }}
                        onPointerMove={(event) => {
                            const current = drag.current;
                            if (!current) return;
                            setView((old) => ({
                                ...old,
                                x: current.left + event.clientX - current.x,
                                y: current.top + event.clientY - current.y,
                            }));
                        }}
                        onPointerUp={stopPan}
                        onPointerCancel={stopPan}
                        onLostPointerCapture={stopPan}
                    >
                        <div
                            className="flow-paper"
                            style={{
                                width: paper.width,
                                height: paper.height,
                                transform:
                                    "translate(" +
                                    view.x +
                                    "px, " +
                                    view.y +
                                    "px) scale(" +
                                    view.scale +
                                    ")",
                            }}
                        >
                            {mapSections.map((section) => (
                                <section
                                    key={section.title}
                                    className="flow-section"
                                    data-dimmed={
                                        !focus.nodes.some(
                                            (node) =>
                                                node.x >= section.x &&
                                                node.x <
                                                    section.x + section.width &&
                                                node.y >= section.y &&
                                                node.y <
                                                    section.y + section.height,
                                        )
                                            ? "true"
                                            : undefined
                                    }
                                    aria-label={section.title}
                                    style={{
                                        left: section.x,
                                        top: section.y,
                                        width: section.width,
                                        height: section.height,
                                    }}
                                >
                                    <h2>{section.title}</h2>
                                    <p>{section.note}</p>
                                </section>
                            ))}
                            <svg
                                className="flow-arrows"
                                width={paper.width}
                                height={paper.height}
                                role="img"
                                aria-label="Flow transitions, decisions, cancellations and retry loops"
                            >
                                <defs>
                                    <marker
                                        id="flow-arrow"
                                        markerWidth="8"
                                        markerHeight="8"
                                        refX="7"
                                        refY="4"
                                        orient="auto-start-reverse"
                                    >
                                        <path
                                            d="M0,0 L8,4 L0,8 Z"
                                            fill="currentColor"
                                        />
                                    </marker>
                                </defs>
                                {focus.edges.map((edge) => {
                                    const points = edgePoints(
                                        edge,
                                        focus.nodes,
                                    );
                                    const [x, y] = edgeLabelPosition(
                                        edge,
                                        focus.nodes,
                                    );
                                    const active =
                                        !highlight ||
                                        edge.from === highlight ||
                                        edge.to === highlight;
                                    return (
                                        <g
                                            key={
                                                edge.from + edge.to + edge.label
                                            }
                                            className={
                                                "flow-edge" +
                                                (edge.alternate
                                                    ? " flow-edge-alternate"
                                                    : "")
                                            }
                                            opacity={active ? 1 : 0.12}
                                        >
                                            <title>
                                                {edge.from +
                                                    " → " +
                                                    edge.to +
                                                    ": " +
                                                    edge.label}
                                            </title>
                                            <polyline
                                                points={points
                                                    .map((point) =>
                                                        point.join(","),
                                                    )
                                                    .join(" ")}
                                                markerEnd="url(#flow-arrow)"
                                            />
                                            <text
                                                x={x}
                                                y={y - 9}
                                                textAnchor="middle"
                                            >
                                                {edge.label}
                                            </text>
                                        </g>
                                    );
                                })}
                            </svg>
                            {focus.nodes.map((node) => {
                                const entry = mapScreens.find(
                                    (entry) => entry.id === node.screen,
                                );
                                return (
                                    <article
                                        key={node.id}
                                        className={
                                            "flow-node " +
                                            (entry
                                                ? "canvas-screen"
                                                : `flow-${node.kind}`)
                                        }
                                        style={{
                                            left: node.x,
                                            top: node.y,
                                            ...nodeSize(node),
                                        }}
                                        data-screen-id={node.screen}
                                        data-node-id={node.id}
                                        data-dimmed={
                                            !focus.nodeIds.has(node.id)
                                                ? "true"
                                                : undefined
                                        }
                                        onMouseEnter={() =>
                                            setHighlight(node.id)
                                        }
                                        onMouseLeave={() => setHighlight(null)}
                                    >
                                        {entry ? (
                                            <Button
                                                className="flow-screen-button"
                                                aria-label={`Open ${entry.title}`}
                                                onClick={() => {
                                                    navigationOrder.current =
                                                        mapScreens;
                                                    setSelected(entry);
                                                    const recipe =
                                                        review?.resolve(entry);
                                                    if (recipe)
                                                        review?.select(
                                                            recipe.id,
                                                        );
                                                }}
                                                onFocus={() =>
                                                    setHighlight(node.id)
                                                }
                                                onBlur={() =>
                                                    setHighlight(null)
                                                }
                                            >
                                                <span className="canvas-screen-title">
                                                    <span>
                                                        <span className="canvas-screen-heading">
                                                            <span>
                                                                {entry.title}
                                                            </span>
                                                        </span>
                                                        {showOwnership && (
                                                            <ScreenOwnership
                                                                entry={entry}
                                                            />
                                                        )}
                                                    </span>
                                                    <ExternalLinkIcon className="polli:h-4 polli:w-4" />
                                                </span>
                                                <span className="canvas-phone">
                                                    <ScreenContent
                                                        entry={entry}
                                                    />
                                                </span>
                                            </Button>
                                        ) : (
                                            <div className="flow-node-label">
                                                <strong>{node.label}</strong>
                                                {node.note && (
                                                    <small>{node.note}</small>
                                                )}
                                            </div>
                                        )}
                                    </article>
                                );
                            })}
                        </div>
                    </ScrollArea>
                </>
            )}
            {!gallery && selected && (
                <div className="canvas-inspector-overlay">
                    <section
                        role="dialog"
                        aria-modal="false"
                        aria-label={selected.title}
                        tabIndex={-1}
                        ref={inspector}
                        className={`canvas-inspector ${desktop ? "canvas-inspector-desktop" : ""}`}
                    >
                        {selected && (
                            <>
                                <div className="canvas-inspector-header">
                                    <div
                                        className={`canvas-inspector-title${showOwnership ? " has-owner" : ""}`}
                                    >
                                        <strong>{selected.title}</strong>
                                        {showOwnership && (
                                            <ScreenOwnership entry={selected} />
                                        )}
                                    </div>
                                    <IconButton
                                        title="Close screen preview"
                                        tooltip={false}
                                        onClick={close}
                                        size="sm"
                                    >
                                        <XIcon />
                                    </IconButton>
                                </div>
                                <div className="canvas-phone canvas-interactive">
                                    <ScreenContent
                                        key={selected.id}
                                        entry={selected}
                                        focused
                                        onClose={close}
                                        onKeyDown={handlePreviewKey}
                                    />
                                </div>
                            </>
                        )}
                    </section>
                </div>
            )}
        </>
    );
}
function FlowLab() {
    const { mode } = useColorMode();
    const [desktop, setDesktop] = useState(false);
    const [journeyCase, setJourneyCase] = useState<ReviewCase>();
    const [view, setView] = useState(
        ["map", "screens"].includes(
            new URLSearchParams(location.search).get("view") ?? "",
        )
            ? (new URLSearchParams(location.search).get("view") ?? "journey")
            : "journey",
    );
    const [journeyVisited, setJourneyVisited] = useState(view === "journey");
    const [subsections, setSubsections] = useState<
        Record<"app" | "account" | "device", JourneySection>
    >(() => {
        try {
            const saved = JSON.parse(
                localStorage.getItem("flow-lab-subsections") ?? "{}",
            );
            return {
                app: saved?.app === "topup" ? "topup" : "main",
                account:
                    dashboardSections.find((s) => s.id === saved?.account)
                        ?.id ?? "main",
                device: saved?.device === "link" ? "link" : "main",
            };
        } catch {
            return { app: "main", account: "main", device: "main" };
        }
    });
    const [entrance, setEntrance] = useState<JourneySelection>(() => {
        const params = new URLSearchParams(location.search);
        const world =
            entrances.find((item) => item.id === params.get("flow"))?.id ??
            "app";
        const section =
            world === "admin"
                ? "main"
                : (flowOptions[world].find(
                      (s) => s.id === params.get("section"),
                  )?.id ?? subsections[world]);
        return { world, section, revision: 0 };
    });
    const [journeyStart, setJourneyStart] = useState(() => ({
        flow: entrance.world,
        section: entrance.section,
    }));
    useEffect(() => {
        const url = new URL(location.href);
        url.searchParams.set("flow", entrance.world);
        url.searchParams.set("section", entrance.section);
        history.replaceState({}, "", url);
        if (entrance.world !== "admin") {
            const next = { ...subsections, [entrance.world]: entrance.section };
            if (subsections[entrance.world] !== entrance.section)
                setSubsections(next);
            try {
                localStorage.setItem(
                    "flow-lab-subsections",
                    JSON.stringify(next),
                );
            } catch {
                /* Navigation still works without browser storage. */
            }
        }
    }, [entrance.world, entrance.section, subsections]);
    const chooseFlow = (
        world: JourneyEntrance,
        section: JourneySection = "main",
    ) => {
        setJourneyVisited(view === "journey");
        setJourneyCase(undefined);
        setJourneyStart({ flow: world, section });
        setEntrance((old) => ({
            world,
            section,
            revision: old.revision + 1,
        }));
    };
    const openDashboard = () => {
        setJourneyVisited(view === "journey");
        setJourneyCase(undefined);
        setJourneyStart({ flow: "account", section: "topup" });
        setEntrance((old) => ({
            world: "account",
            section: "topup",
            revision: old.revision + 1,
        }));
    };
    const [journeyLocation, setJourneyLocation] = useState<JourneyLocation>({
        world: "app",
        node: "app-connect",
    });
    const changeView = (next: string) => {
        if (next === "journey") setJourneyVisited(true);
        const url = new URL(location.href);
        url.searchParams.set("view", next);
        history.replaceState({}, "", url);
        setView(next);
    };
    return (
        <ReviewProvider
            flow={entrance.world}
            section={entrance.section}
            view={view}
            theme={mode}
            desktop={view === "map" ? false : desktop}
            start={journeyStart}
            onStartOver={() => {
                setJourneyCase(undefined);
                setJourneyVisited(true);
                setEntrance((old) => ({
                    world: journeyStart.flow,
                    section: journeyStart.section,
                    revision: old.revision + 1,
                }));
            }}
            onNavigate={({ flow, section }) => {
                setEntrance((old) => ({ ...old, world: flow, section }));
            }}
            onRun={(recipe) => {
                setJourneyCase(recipe);
                setEntrance((old) => ({
                    ...old,
                    revision: old.revision + 1,
                }));
                changeView("journey");
            }}
        >
            <div className="flow-lab" data-theme="accent">
                <ReviewHeader>
                    <div className="flow-header-main">
                        <div className="flow-brand">
                            <span
                                aria-hidden="true"
                                className="flow-brand-icon"
                                style={{
                                    WebkitMask: `url(${logoUrl}) center / contain no-repeat`,
                                    mask: `url(${logoUrl}) center / contain no-repeat`,
                                }}
                            />
                            <span>Flow</span>
                        </div>
                        <div className="flow-header-controls">
                            <fieldset
                                className="flow-control-group"
                                aria-label="Preview size"
                                data-theme="neutral"
                            >
                                <IconButton
                                    size="md"
                                    variant={!desktop ? "tile" : "ghost"}
                                    pressed={!desktop}
                                    disabled={view === "map"}
                                    title="Mobile"
                                    tooltip={
                                        view === "map"
                                            ? "Mobile preview — unavailable in Map"
                                            : "Mobile"
                                    }
                                    onClick={() => setDesktop(false)}
                                >
                                    <SmartphoneIcon className="polli:h-4 polli:w-4" />
                                </IconButton>
                                <IconButton
                                    size="md"
                                    variant={desktop ? "tile" : "ghost"}
                                    pressed={desktop}
                                    disabled={view === "map"}
                                    title="Desktop"
                                    tooltip={
                                        view === "map"
                                            ? "Desktop preview — unavailable in Map"
                                            : "Desktop"
                                    }
                                    onClick={() => setDesktop(true)}
                                >
                                    <AppIcon className="polli:h-4 polli:w-4" />
                                </IconButton>
                            </fieldset>
                            <nav
                                className="flow-control-group flow-view-tabs"
                                aria-label="View"
                                data-theme="neutral"
                            >
                                <ReviewJourneyTab
                                    active={view === "journey"}
                                    visited={journeyVisited}
                                    onResume={() => changeView("journey")}
                                />
                                <IconButton
                                    size="md"
                                    variant={view === "map" ? "tile" : "ghost"}
                                    pressed={view === "map"}
                                    title="Map"
                                    onClick={() => changeView("map")}
                                >
                                    <GitBranchIcon className="polli:h-4 polli:w-4" />
                                </IconButton>
                                <IconButton
                                    size="md"
                                    variant={
                                        view === "screens" ? "tile" : "ghost"
                                    }
                                    pressed={view === "screens"}
                                    title="Screens"
                                    onClick={() => changeView("screens")}
                                >
                                    <GridIcon className="polli:h-4 polli:w-4" />
                                </IconButton>
                            </nav>
                            <fieldset
                                className="flow-control-group"
                                aria-label="Color mode"
                                data-theme="neutral"
                            >
                                <IconButton
                                    size="md"
                                    variant={
                                        mode === "light" ? "tile" : "ghost"
                                    }
                                    pressed={mode === "light"}
                                    title="Light mode"
                                    onClick={() => setColorMode("light")}
                                >
                                    <SunIcon className="polli:h-4 polli:w-4" />
                                </IconButton>
                                <IconButton
                                    size="md"
                                    variant={mode === "dark" ? "tile" : "ghost"}
                                    pressed={mode === "dark"}
                                    title="Dark mode"
                                    onClick={() => setColorMode("dark")}
                                >
                                    <MoonIcon className="polli:h-4 polli:w-4" />
                                </IconButton>
                            </fieldset>
                        </div>
                    </div>
                    <FlowSource />
                    <ScrollArea axis="x" className="flow-header-secondary">
                        <div className="flow-navigation">
                            <nav
                                className="flow-entrances"
                                aria-label="Choose a flow"
                            >
                                <div className="flow-navigation-buttons">
                                    {entrances.map((item) => {
                                        const active =
                                            entrance.world === item.id;
                                        if (item.id === "admin")
                                            return (
                                                <TabButton
                                                    key={item.id}
                                                    size="sm"
                                                    variant="ghost"
                                                    active={active}
                                                    onClick={() =>
                                                        chooseFlow(item.id)
                                                    }
                                                >
                                                    {item.label}
                                                </TabButton>
                                            );
                                        const options = flowOptions[item.id];
                                        const section = active
                                            ? entrance.section
                                            : subsections[item.id];
                                        const selected = options.find(
                                            (option) => option.id === section,
                                        );
                                        return (
                                            <Dropdown
                                                key={item.id}
                                                className="polli:min-w-44 polli:p-1"
                                                trigger={(open) => (
                                                    <Button
                                                        type="button"
                                                        size="md"
                                                        aria-current={
                                                            active
                                                                ? "page"
                                                                : undefined
                                                        }
                                                        className={`polli:gap-2 polli:whitespace-nowrap polli:text-sm ${active ? "" : "polli:bg-transparent polli:text-theme-text-base polli:hover:bg-theme-bg-subtle"}`}
                                                    >
                                                        {item.label}
                                                        {active &&
                                                            selected &&
                                                            ` — ${selected.label}`}
                                                        <ChevronIcon
                                                            expanded={open}
                                                            className="polli:h-3 polli:w-3"
                                                        />
                                                    </Button>
                                                )}
                                            >
                                                {(close) => (
                                                    <nav
                                                        aria-label={`${item.label} flow`}
                                                        data-theme="accent"
                                                    >
                                                        {options.map(
                                                            (option) => (
                                                                <DropdownItem
                                                                    key={
                                                                        option.id
                                                                    }
                                                                    aria-current={
                                                                        active &&
                                                                        section ===
                                                                            option.id
                                                                            ? "page"
                                                                            : undefined
                                                                    }
                                                                    onClick={() => {
                                                                        chooseFlow(
                                                                            item.id,
                                                                            option.id,
                                                                        );
                                                                        close();
                                                                    }}
                                                                >
                                                                    {
                                                                        option.label
                                                                    }
                                                                    {active &&
                                                                        section ===
                                                                            option.id && (
                                                                            <CheckIcon className="polli:ml-auto polli:h-4 polli:w-4" />
                                                                        )}
                                                                </DropdownItem>
                                                            ),
                                                        )}
                                                    </nav>
                                                )}
                                            </Dropdown>
                                        );
                                    })}
                                </div>
                            </nav>
                        </div>
                    </ScrollArea>
                </ReviewHeader>
                <div className="flow-workspace">
                    <ReviewStartOver />
                    <div className="flow-content">
                        {journeyVisited && (
                            <div
                                className="flow-journey-host"
                                hidden={view !== "journey"}
                            >
                                <ReviewJourney>
                                    <ScrollArea className="flow-journey-view">
                                        <Journey
                                            reviewCase={journeyCase}
                                            desktop={desktop}
                                            entrance={entrance}
                                            onLocationChange={
                                                setJourneyLocation
                                            }
                                            onOpenDashboard={openDashboard}
                                        />
                                    </ScrollArea>
                                </ReviewJourney>
                            </div>
                        )}
                        {(view === "map" || view === "screens") && (
                            <div className="flow-map-view">
                                <Canvas
                                    desktop={desktop}
                                    key={view}
                                    entrance={entrance}
                                    location={journeyLocation}
                                    gallery={view === "screens"}
                                />
                            </div>
                        )}
                    </div>
                    {view !== "map" && (
                        <ReviewPanel journey={view === "journey"} />
                    )}
                </div>
            </div>
        </ReviewProvider>
    );
}
const root = document.getElementById("canvas-root");
if (root) {
    const reactRoot = createRoot(root);
    reactRoot.render(
        <FlowConditionsProvider>
            <FlowLab />
        </FlowConditionsProvider>,
    );
    import.meta.hot?.dispose(() => reactRoot.unmount());
}
