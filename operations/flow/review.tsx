import { Button, IconButton, TabButton } from "@pollinations/ui";
import {
    createContext,
    type PropsWithChildren,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import type { PreviewResult } from "./capture-types";
import { useFlowConditions } from "./conditions";
import { appLoginScreens } from "./flow-app-login";
import type { CanvasScreen } from "./flow-canvas-data";
import { galleryScreensForFlow } from "./flow-gallery-data";
import { RouteIcon } from "./flow-icons";
import type { JourneyEntrance, JourneySection } from "./flow-journey-state";
import { loginSituations } from "./review-auth";
import type { ReviewCase } from "./review-cases";
import { clearReviewSteps } from "./review-driver";
import {
    journeyStartCase,
    type ReviewScope,
    reviewCaseForScreen,
    reviewCasesForFlow,
    reviewPageForLocation,
    reviewPageForNode,
    situationLabel,
} from "./review-inventory";
import { describeReviewRequest } from "./review-requests";
import { clearExampleStorage } from "./review-storage";
import type { ObservedScreen } from "./runtime-frame";
import "./review.css";

export function reviewScreen(
    recipe: ReviewCase,
    inventory: CanvasScreen[],
    scope: { flow: string; section: string },
): CanvasScreen {
    const entry = inventory.find((entry) => entry.id === recipe.pageId);
    return {
        ...entry,
        id: recipe.id,
        title: recipe.title,
        owner: entry?.owner ?? "Pollinations",
        illustration: undefined,
        screen: recipe.query.screen,
        variants: [
            {
                label: recipe.title,
                params: {
                    ...recipe.query,
                    review_case: recipe.id,
                    review_flow: scope.flow,
                    review_section: scope.section,
                },
            },
        ],
    };
}
export const isErrorRouteCase = (recipe: ReviewCase) =>
    Boolean(recipe.query.request_error) ||
    Object.values(loginSituations).some(
        (error) => error.id === recipe.query.screen,
    );
type Review = {
    flow: JourneyEntrance;
    section: JourneySection;
    cases: ReviewCase[];
    screens: CanvasScreen[];
    screen?: CanvasScreen;
    selected?: ReviewCase;
    setup?: ReviewCase;
    result?: PreviewResult;
    error?: string;
    running: boolean;
    journey: boolean;
    pending: boolean;
    observed?: ObservedScreen;
    select: (id: string) => void;
    selectScreen: (id: string) => void;
    observe: (screen: ObservedScreen, origin?: ReviewScope) => void;
    resolve: (entry: CanvasScreen) => ReviewCase | undefined;
    run: (recipe: ReviewCase) => Promise<boolean>;
    startOver: () => Promise<boolean>;
};
const ReviewContext = createContext<Review | null>(null);
export const useReview = () => useContext(ReviewContext);

type Selection = { pageId: string; choices: Record<string, string> };

export function ReviewProvider({
    flow,
    section,
    view,
    theme,
    desktop,
    onRun,
    onNavigate,
    start,
    onStartOver,
    children,
}: PropsWithChildren<{
    flow: JourneyEntrance;
    section: JourneySection;
    view: string;
    theme: string;
    desktop: boolean;
    onRun: (recipe: ReviewCase) => void;
    onNavigate: (scope: ReviewScope) => void;
    start: ReviewScope;
    onStartOver: () => void;
}>) {
    const { restart, state } = useFlowConditions();
    const applied = useRef<
        { start: ReviewScope; recipe: ReviewCase } | undefined
    >(undefined);
    const enabled = view !== "journey";
    const cases = useMemo(
        () => reviewCasesForFlow(flow, section),
        [flow, section],
    );
    const screens = useMemo(
        () => galleryScreensForFlow(flow, section),
        [flow, section],
    );
    const scope = `${flow}/${section}`;
    const [selections, setSelections] = useState<Record<string, Selection>>(
        () => {
            const id = new URLSearchParams(location.search).get("situation");
            const recipe = cases.find((item) => item.id === id);
            return recipe
                ? {
                      [scope]: {
                          pageId: recipe.pageId,
                          choices: { [recipe.pageId]: recipe.id },
                      },
                  }
                : {};
        },
    );
    const selection = selections[scope];
    const selectedScreen =
        screens.find((entry) => entry.id === selection?.pageId) ?? screens[0];
    const choices = selection?.choices ?? {};
    const [pendingScope, setPendingScope] = useState<string>();
    const [observed, setObserved] = useState<{
        scope: string;
        screen: ObservedScreen;
    }>();
    const screen =
        view === "journey" &&
        observed?.scope === scope &&
        !reviewPageForNode(cases, screens, observed.screen.node)
            ? undefined
            : selectedScreen;
    const selected = screen
        ? reviewCaseForScreen(cases, screen, choices)
        : undefined;
    const selectedId = selected?.id;
    useEffect(() => {
        const url = new URL(location.href);
        if (selectedId) url.searchParams.set("situation", selectedId);
        else url.searchParams.delete("situation");
        history.replaceState(history.state, "", url);
    }, [selectedId]);
    const [preview, setPreview] = useState<{
        query: string;
        result: PreviewResult;
    }>();
    const [runError, setRunError] = useState("");
    const [running, setRunning] = useState(false);
    const runLock = useRef(false);
    const mapCases = new Map<string, ReviewCase>();
    for (const recipe of cases)
        if (
            !mapCases.has(recipe.family) ||
            choices[recipe.pageId] === recipe.id
        )
            mapCases.set(recipe.family, recipe);
    const requested = (
        view === "map" ? [...mapCases.values()] : selected ? [selected] : []
    ).filter((recipe) => !recipe.provider);
    const requestedIds = requested
        .map((recipe) => recipe.id)
        .sort()
        .join(",");
    const query = new URLSearchParams({
        flow,
        section,
        theme,
        size: desktop ? "desktop" : "mobile",
        cases: requestedIds,
    }).toString();
    useEffect(() => {
        if (!enabled || !requestedIds) return;
        const controller = new AbortController();
        let timer: ReturnType<typeof setTimeout>;
        setPreview(undefined);
        async function poll() {
            try {
                const response = await fetch(`/__flow/previews?${query}`, {
                    signal: controller.signal,
                });
                if (!response.ok)
                    throw new Error("Couldn’t load screen previews.");
                const next: PreviewResult = await response.json();
                if (!controller.signal.aborted)
                    setPreview({ query, result: next });
            } catch (reason) {
                if (!controller.signal.aborted)
                    setPreview({
                        query,
                        result: {
                            revision: "",
                            status: "error",
                            stale: false,
                            cases: {},
                            error:
                                reason instanceof Error
                                    ? reason.message
                                    : "Couldn’t load screen previews.",
                        },
                    });
            } finally {
                if (!controller.signal.aborted) timer = setTimeout(poll, 2000);
            }
        }
        void poll();
        return () => {
            controller.abort();
            clearTimeout(timer);
        };
    }, [enabled, query, requestedIds]);
    function selectScreen(pageId: string, recipe?: ReviewCase) {
        if (!screens.some((entry) => entry.id === pageId)) return;
        if (pageId === screen?.id && (!recipe || recipe.id === selected?.id))
            return;
        setRunError("");
        setPendingScope(scope);
        setSelections((all) => ({
            ...all,
            [scope]: {
                pageId,
                choices: {
                    ...all[scope]?.choices,
                    ...(recipe ? { [pageId]: recipe.id } : {}),
                },
            },
        }));
    }
    async function prepare(recipe: ReviewCase, open: () => void) {
        if (runLock.current) return false;
        runLock.current = true;
        setRunning(true);
        setRunError("");
        try {
            if (state) clearExampleStorage(state.connection.clientId);
            clearReviewSteps();
            if (!(await restart(recipe))) return false;
            setPendingScope(undefined);
            setObserved(undefined);
            open();
            return true;
        } catch (reason) {
            setRunError(
                reason instanceof Error
                    ? reason.message
                    : "Couldn’t start this screen. Please try again.",
            );
            return false;
        } finally {
            runLock.current = false;
            setRunning(false);
        }
    }
    const value: Review = {
        flow,
        section,
        cases,
        screens,
        screen,
        selected,
        setup: applied.current?.recipe,
        result: preview?.query === query ? preview.result : undefined,
        error: runError,
        running,
        journey: !enabled,
        pending: pendingScope === scope,
        observed: observed?.scope === scope ? observed.screen : undefined,
        selectScreen,
        select: (id) => {
            const recipe = cases.find((item) => item.id === id);
            if (recipe) selectScreen(recipe.pageId, recipe);
        },
        observe: (next, origin) => {
            if (enabled) return;
            const page = reviewPageForLocation({ flow, section }, next, origin);
            const nextScope = page ? `${page.flow}/${page.section}` : scope;
            setObserved((old) =>
                old?.scope === nextScope &&
                old.screen.node === next.node &&
                old.screen.title === next.title &&
                old.screen.path === next.path
                    ? old
                    : { scope: nextScope, screen: next },
            );
            // Native navigation updates the current page. A requested situation
            // remains pending until run; observation never applies fixtures.
            if (pendingScope === scope || runLock.current) return;
            if (!page) return;
            const pageCases = reviewCasesForFlow(page.flow, page.section);
            const recipe = page.recipe;
            setSelections((all) => {
                const previous = all[nextScope];
                const chosen = pageCases.find(
                    (item) => item.id === previous?.choices[page.entry.id],
                );
                if (
                    previous?.pageId === page.entry.id &&
                    chosen?.family === recipe?.family
                )
                    return all;
                return {
                    ...all,
                    [nextScope]: {
                        pageId: page.entry.id,
                        choices: {
                            ...previous?.choices,
                            ...(recipe &&
                                (!chosen ||
                                    chosen.family !== recipe.family) && {
                                    [page.entry.id]: recipe.id,
                                }),
                        },
                    },
                };
            });
            if (nextScope !== scope) onNavigate(page);
        },
        resolve: (entry) => {
            const family =
                (flow === "app" && section === "main"
                    ? [...appLoginScreens].find(
                          ([, item]) => item.id === entry.id,
                      )?.[0]
                    : undefined) ?? entry.id;
            return reviewCaseForScreen(
                cases,
                entry,
                choices,
                screens.includes(entry) ? undefined : family,
            );
        },
        run: async (recipe) => {
            return prepare(recipe, () => {
                applied.current = { start, recipe };
                selectScreen(recipe.pageId, recipe);
                setPendingScope(undefined);
                onRun(recipe);
            });
        },
        startOver: () => {
            const selected =
                applied.current?.start === start
                    ? applied.current.recipe
                    : undefined;
            const recipe = journeyStartCase(start, selected);
            if (!selected && state) recipe.conditions = { ...state.conditions };
            return prepare(recipe, () => {
                applied.current = { start, recipe };
                setSelections((all) => ({
                    ...all,
                    [`${start.flow}/${start.section}`]: {
                        pageId: galleryScreensForFlow(
                            start.flow,
                            start.section,
                        )[0].id,
                        choices: {},
                    },
                }));
                onStartOver();
            });
        },
    };
    return (
        <ReviewContext.Provider value={value}>
            {children}
        </ReviewContext.Provider>
    );
}

export function ReviewJourney({ children }: PropsWithChildren) {
    const review = useReview();
    return review?.running ? (
        <div className="flow-journey-preparing">
            <output>Starting…</output>
        </div>
    ) : (
        children
    );
}

export function ReviewHeader({ children }: PropsWithChildren) {
    const review = useReview();
    return (
        <header className="flow-header" inert={review?.running}>
            {children}
        </header>
    );
}

export function ReviewJourneyTab({
    active,
    visited,
    onResume,
}: {
    active: boolean;
    visited: boolean;
    onResume: () => void;
}) {
    const review = useReview();
    const { state, busy } = useFlowConditions();
    return (
        <IconButton
            size="md"
            variant={active ? "tile" : "ghost"}
            pressed={active}
            title={review?.running ? "Starting Journey…" : "Journey"}
            disabled={busy || !state || review?.running}
            onClick={() => {
                if (review?.selected && (review.pending || !visited))
                    void review.run(review.selected);
                else onResume();
            }}
        >
            <RouteIcon
                className={`polli:h-4 polli:w-4${review?.running ? " polli:animate-pulse" : ""}`}
            />
        </IconButton>
    );
}

export function ReviewPanel({ journey }: { journey: boolean }) {
    const review = useReview();
    const { state, busy, error } = useFlowConditions();
    if (!review) return null;
    const { screen, selected: recipe } = review;
    const setup = journey ? review.setup : recipe;
    const situations = review.cases.filter(
        (item) => item.pageId === screen?.id,
    );
    const configuredRequests = [
        ...(setup?.requests ?? []),
        ...(setup?.steps ?? []).flatMap((step) => step.requests ?? []),
        ...(setup?.action?.type === "sign-in" &&
        setup.action.outcome === "pending"
            ? [
                  {
                      path: "/api/auth/sign-in/social",
                      method: "POST",
                      outcome: "pending" as const,
                  },
              ]
            : []),
    ];
    const hasChoices = Boolean(screen && situations.length > 1);
    const hasDevice =
        journey && review.flow === "device" && Boolean(state?.device);
    const messages = [review.error, error].filter(Boolean);
    if (
        !hasChoices &&
        !hasDevice &&
        !messages.length &&
        !recipe?.provider &&
        !setup?.note &&
        !configuredRequests.length &&
        !(recipe && isErrorRouteCase(recipe))
    )
        return null;
    return (
        <div className="flow-review-float">
            <aside
                className="flow-conditions flow-review-stack"
                aria-label={journey ? "Journey controls" : "Screen review"}
            >
                {screen && hasChoices && (
                    <fieldset
                        aria-label="Situations"
                        disabled={
                            review.running || (journey && (busy || !state))
                        }
                    >
                        <div>
                            {situations.map((item) => (
                                <span
                                    key={item.id}
                                    style={{ maxWidth: "100%" }}
                                    title={
                                        [
                                            ...(item.requests ?? []),
                                            ...(item.steps ?? []).flatMap(
                                                (step) => step.requests ?? [],
                                            ),
                                        ]
                                            .map(describeReviewRequest)
                                            .join("\n") || undefined
                                    }
                                >
                                    <TabButton
                                        size="sm"
                                        // Journey buttons restart a scenario. Native
                                        // actions can change it, so a remembered choice
                                        // must not claim to describe the live account.
                                        active={
                                            !journey && recipe?.id === item.id
                                        }
                                        onClick={() => {
                                            review.select(item.id);
                                            if (journey) void review.run(item);
                                        }}
                                    >
                                        {situationLabel(item, screen)}
                                    </TabButton>
                                </span>
                            ))}
                        </div>
                    </fieldset>
                )}
                {configuredRequests.length > 0 && (
                    <p className="flow-review-note">
                        {configuredRequests
                            .map(describeReviewRequest)
                            .join(". ")}
                        .
                        {configuredRequests.some(
                            (request) => request.outcome === "pending",
                        ) &&
                            " Choose another situation to leave this held state. Requests are not released automatically."}
                    </p>
                )}
                {setup?.note && (
                    <p className="flow-review-note">{setup.note}</p>
                )}
                {recipe?.provider ? (
                    <p className="flow-review-note">
                        {recipe.provider} is an external reference. Journey uses
                        a local provider.
                    </p>
                ) : recipe && isErrorRouteCase(recipe) ? (
                    <p className="flow-review-note">
                        Opens the real error route for copy and layout review.
                    </p>
                ) : null}
                {hasDevice && <DeviceConnectionStatus />}
                {messages.map((message) => (
                    <p
                        key={message}
                        className="flow-conditions-error"
                        role="alert"
                    >
                        {message}
                    </p>
                ))}
            </aside>
        </div>
    );
}

export function ReviewStartOver() {
    const review = useReview();
    const { state, busy } = useFlowConditions();
    if (!review?.journey) return null;
    return (
        <div className="flow-start-over" data-theme="neutral">
            <IconButton
                size="md"
                disabled={!state || busy || review.running}
                title="Start over"
                tooltip="Return to the journey’s beginning with the selected account conditions"
                onClick={() => void review.startOver()}
            >
                <svg
                    aria-hidden="true"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <path d="M20 4v7h-7" />
                    <path d="M20 11a8 8 0 1 0-2.34 6.66" />
                </svg>
            </IconButton>
        </div>
    );
}

function DeviceConnectionStatus() {
    const { state, busy, refresh } = useFlowConditions();
    const [error, setError] = useState("");
    const [checking, setChecking] = useState(false);
    if (!state?.device) return null;
    return (
        <div className="flow-device-status">
            <strong>Device code</strong>
            <code>{state.device.userCode}</code>
            <span>{state.device.status}</span>
            <Button
                size="sm"
                data-theme="neutral"
                disabled={
                    busy || checking || state.device.status === "completed"
                }
                onClick={async () => {
                    setChecking(true);
                    setError("");
                    try {
                        const response = await fetch("/__flow/device/poll", {
                            method: "POST",
                        });
                        if (!response.ok)
                            throw new Error(
                                "Couldn’t check the device connection.",
                            );
                        await refresh();
                    } catch (reason) {
                        setError(
                            reason instanceof Error
                                ? reason.message
                                : "Device check failed.",
                        );
                    } finally {
                        setChecking(false);
                    }
                }}
            >
                Check connection
            </Button>
            {error && <p role="alert">{error}</p>}
        </div>
    );
}

export function CapturedScreen({
    recipe,
    scrollable = false,
    onOpen,
    onClose,
    onKeyDown,
}: {
    recipe: ReviewCase;
    scrollable?: boolean;
    onOpen?: () => void;
    onClose?: () => void;
    onKeyDown?: (event: KeyboardEvent) => void;
}) {
    const review = useReview();
    const capture = review?.result?.cases[recipe.id];
    return (
        <div className="flow-captured-screen">
            {scrollable && capture?.document ? (
                <iframe
                    src={capture.document}
                    title={`${recipe.title} · scrollable preview`}
                    sandbox="allow-same-origin"
                    loading="lazy"
                    tabIndex={onOpen ? -1 : 0}
                    onLoad={(event) => {
                        const document = event.currentTarget.contentDocument;
                        if (onOpen) document?.addEventListener("click", onOpen);
                        document?.addEventListener("keydown", (event) => {
                            if (event.key === "Escape") onClose?.();
                            else onKeyDown?.(event);
                        });
                    }}
                />
            ) : capture?.image ? (
                <img src={capture.image} alt={recipe.title} draggable={false} />
            ) : null}
            {capture?.status !== "ready" && (
                <div
                    className="flow-capture-status"
                    role={capture?.status === "error" ? "alert" : "status"}
                >
                    <strong>
                        {capture?.status === "error" ||
                        review?.result?.status === "error"
                            ? "Preview unavailable"
                            : review?.result?.queue?.position
                              ? `Queued · ${review.result.queue.position} of ${review.result.queue.total}`
                              : "Capturing real screen…"}
                    </strong>
                    {(capture?.error || review?.result?.error) && (
                        <span>{capture?.error || review?.result?.error}</span>
                    )}
                </div>
            )}
        </div>
    );
}
