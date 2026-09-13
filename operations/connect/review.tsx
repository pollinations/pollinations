import { Button, ChevronIcon, Dropdown, TabButton } from "@pollinations/ui";
import { loginErrors } from "@shared/auth/login-errors.ts";
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
import { useConnectConditions } from "./conditions";
import { appLoginScreens } from "./pollen-connect-app-login";
import type { CanvasScreen } from "./pollen-connect-canvas-data";
import { galleryScreensForFlow } from "./pollen-connect-gallery-data";
import type {
    JourneyEntrance,
    JourneySection,
    JourneyWorld,
} from "./pollen-connect-journey-state";
import type { ReviewCase } from "./review-cases";
import { clearReviewSteps } from "./review-driver";
import {
    reviewCaseForNode,
    reviewCaseForScreen,
    reviewCasesForFlow,
    situationLabel,
} from "./review-inventory";
import { clearExampleStorage } from "./review-storage";
import type { ObservedScreen } from "./runtime-frame";
import "./review.css";

export function reviewScreen(
    recipe: ReviewCase,
    inventory: CanvasScreen[],
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
                params: { ...recipe.query, review_case: recipe.id },
            },
        ],
    };
}
export const isErrorRouteCase = (recipe: ReviewCase) =>
    Boolean(recipe.query.request_error) ||
    Object.values(loginErrors).some(
        (error) => error.id === recipe.query.screen,
    );
type Review = {
    flow: JourneyEntrance;
    section: JourneySection;
    cases: ReviewCase[];
    screens: CanvasScreen[];
    screen?: CanvasScreen;
    selected?: ReviewCase;
    result?: PreviewResult;
    error?: string;
    running: boolean;
    journey: boolean;
    pending: boolean;
    observed?: ObservedScreen;
    select: (id: string) => void;
    selectScreen: (id: string) => void;
    observe: (world: JourneyWorld, screen: ObservedScreen) => void;
    resolve: (entry: CanvasScreen) => ReviewCase | undefined;
    run: (recipe: ReviewCase) => Promise<boolean>;
};
const ReviewContext = createContext<Review | null>(null);
export const useReview = () => useContext(ReviewContext);

type Selection = { pageId: string; choices: Record<string, string> };

export function ReviewProvider({
    flow,
    section,
    enabled,
    theme,
    desktop,
    onRun,
    children,
}: PropsWithChildren<{
    flow: JourneyEntrance;
    section: JourneySection;
    enabled: boolean;
    theme: string;
    desktop: boolean;
    onRun: (recipe: ReviewCase) => void;
}>) {
    const { restart } = useConnectConditions();
    const cases = useMemo(
        () => reviewCasesForFlow(flow, section),
        [flow, section],
    );
    const screens = useMemo(
        () => galleryScreensForFlow(flow, section),
        [flow, section],
    );
    const scope = `${flow}/${section}`;
    const [selections, setSelections] = useState<Record<string, Selection>>({});
    const selection = selections[scope];
    const screen =
        screens.find((entry) => entry.id === selection?.pageId) ?? screens[0];
    const choices = selection?.choices ?? {};
    const selected = screen
        ? reviewCaseForScreen(cases, screen, choices)
        : undefined;
    const [pendingScope, setPendingScope] = useState<string>();
    const [observed, setObserved] = useState<{
        scope: string;
        screen: ObservedScreen;
    }>();
    const [preview, setPreview] = useState<{
        query: string;
        result: PreviewResult;
    }>();
    const [runError, setRunError] = useState("");
    const [running, setRunning] = useState(false);
    const runLock = useRef(false);
    const query = new URLSearchParams({
        flow,
        section,
        theme,
        size: desktop ? "desktop" : "mobile",
    }).toString();
    useEffect(() => {
        if (!enabled || !cases.length) return;
        const controller = new AbortController();
        let timer: ReturnType<typeof setTimeout>;
        setPreview(undefined);
        async function poll() {
            try {
                const response = await fetch(`/__connect/previews?${query}`, {
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
    }, [enabled, query, cases.length]);
    function selectScreen(pageId: string, recipe?: ReviewCase) {
        if (!screens.some((entry) => entry.id === pageId)) return;
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
    const value: Review = {
        flow,
        section,
        cases,
        screens,
        screen,
        selected,
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
        observe: (world, next) => {
            if (
                enabled ||
                (world !== flow &&
                    !(
                        world === "topup" &&
                        flow === "app" &&
                        section === "topup"
                    ))
            )
                return;
            setObserved((old) =>
                old?.scope === scope &&
                old.screen.node === next.node &&
                old.screen.title === next.title &&
                old.screen.path === next.path
                    ? old
                    : { scope, screen: next },
            );
            // Native navigation updates the current page. A requested situation
            // remains pending until Restart; observation never applies fixtures.
            if (pendingScope === scope || runLock.current) return;
            const recipe = reviewCaseForNode(cases, next.node);
            if (!recipe) return;
            setSelections((all) => {
                const previous = all[scope];
                const chosen = cases.find(
                    (item) => item.id === previous?.choices[recipe.pageId],
                );
                if (
                    previous?.pageId === recipe.pageId &&
                    chosen?.family === recipe.family
                )
                    return all;
                return {
                    ...all,
                    [scope]: {
                        pageId: recipe.pageId,
                        choices: {
                            ...previous?.choices,
                            [recipe.pageId]: recipe.id,
                        },
                    },
                };
            });
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
            if (runLock.current) return false;
            runLock.current = true;
            setRunning(true);
            setRunError("");
            try {
                clearExampleStorage();
                clearReviewSteps();
                if (!(await restart(recipe))) return false;
                setPendingScope(undefined);
                setObserved(undefined);
                onRun(recipe);
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
        <div className="connect-journey-preparing">
            <output>Starting…</output>
        </div>
    ) : (
        children
    );
}

export function ReviewHeader({ children }: PropsWithChildren) {
    const review = useReview();
    return (
        <header className="connect-header" inert={review?.running}>
            {children}
        </header>
    );
}

export function ReviewPanel({ journey }: { journey: boolean }) {
    const review = useReview();
    const { state, busy, error } = useConnectConditions();
    if (!review) return null;
    const { screen, selected: recipe } = review;
    const situations = review.cases.filter(
        (item) => item.pageId === screen?.id,
    );
    const hasChoices = Boolean(screen && situations.length > 1);
    const hasDevice =
        journey && review.flow === "device" && Boolean(state?.device);
    const messages = [review.error, error].filter(Boolean);
    if (!hasChoices && !(journey && recipe) && !hasDevice && !messages.length)
        return null;
    return (
        <div className="connect-review-float">
            <Dropdown
                key={screen?.id}
                align="end"
                portalled={false}
                className="connect-review-popover"
                trigger={(open) => (
                    <Button size="sm" data-theme="neutral">
                        {messages.length
                            ? "Review issue"
                            : journey
                              ? "Journey controls"
                              : "Situations"}
                        <ChevronIcon
                            expanded={open}
                            className="polli:h-3 polli:w-3"
                        />
                    </Button>
                )}
            >
                <aside
                    className="connect-conditions"
                    aria-label="Screen review"
                >
                    {screen && situations.length > 1 && (
                        <fieldset disabled={review.running}>
                            <legend>
                                {journey ? "Restart with" : "Situation"}
                            </legend>
                            <div>
                                {situations.map((item) => (
                                    <TabButton
                                        key={item.id}
                                        size="sm"
                                        active={recipe?.id === item.id}
                                        onClick={() => review.select(item.id)}
                                    >
                                        {situationLabel(item, screen)}
                                    </TabButton>
                                ))}
                            </div>
                        </fieldset>
                    )}
                    {recipe?.provider ? (
                        <p className="connect-review-note">
                            {recipe.provider} is an external reference. Journey
                            uses a local provider.
                        </p>
                    ) : recipe && isErrorRouteCase(recipe) ? (
                        <p className="connect-review-note">
                            Opens the real error route for copy and layout
                            review.
                        </p>
                    ) : null}
                    {recipe && (
                        <div className="connect-conditions-actions">
                            <Button
                                size="sm"
                                disabled={busy || !state || review.running}
                                onClick={() => void review.run(recipe)}
                            >
                                {review.running
                                    ? "Starting…"
                                    : journey
                                      ? "Restart"
                                      : "Run in Journey"}
                            </Button>
                        </div>
                    )}
                    {journey && (
                        <output className="connect-review-note">
                            {review.pending
                                ? "Selected situation is not applied. Restart to apply it."
                                : "Use the page to continue. Restart prepares the selected situation."}
                        </output>
                    )}
                    {hasDevice && <DeviceConnectionStatus />}
                    {messages.map((message) => (
                        <p
                            key={message}
                            className="connect-conditions-error"
                            role="alert"
                        >
                            {message}
                        </p>
                    ))}
                </aside>
            </Dropdown>
        </div>
    );
}

function DeviceConnectionStatus() {
    const { state, busy, refresh } = useConnectConditions();
    const [error, setError] = useState("");
    const [checking, setChecking] = useState(false);
    if (!state?.device) return null;
    return (
        <div className="connect-device-status">
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
                        const response = await fetch("/__connect/device/poll", {
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
        <div className="connect-captured-screen">
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
                    className="connect-capture-status"
                    role={capture?.status === "error" ? "alert" : "status"}
                >
                    <strong>
                        {capture?.status === "error" ||
                        review?.result?.status === "error"
                            ? "Preview unavailable"
                            : capture?.image
                              ? "Updating preview…"
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
