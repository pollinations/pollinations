import { ArrowRightIcon, IconButton, useColorMode } from "@pollinations/ui";
import { useEffect, useRef, useState } from "react";
import { useFlowConditions } from "./conditions";
import { type CanvasScreen, canvasScreenUrl } from "./flow-canvas-data";
import type { JourneyLocation } from "./flow-journey-state";
import { ScreenViewer, ScreenWindow } from "./flow-preview";
import { ADMIN_ORIGIN } from "./local-origins";
import { useReview } from "./review";
import { type ReviewScope, reviewPageForLocation } from "./review-inventory";
import {
    navigateFrame,
    type ObservedScreen,
    RuntimeFrame,
} from "./runtime-frame";
import "./flow-journey.css";

export function RuntimeJourney({
    entry,
    world,
    revision,
    desktop,
    onLocationChange,
    onOpenDashboard,
}: {
    entry: CanvasScreen;
    world: JourneyLocation["world"];
    revision: number;
    desktop: boolean;
    onLocationChange: (location: JourneyLocation) => void;
    onOpenDashboard: () => void;
}) {
    const {
        state,
        refresh,
        revision: conditionsRevision,
    } = useFlowConditions();
    const { mode } = useColorMode();
    const review = useReview();
    const visible = review?.journey !== false;
    const [page, setPage] = useState<{ id: number; src: string }>();
    const [observed, setObserved] = useState<ObservedScreen>();
    const [canGoBack, setCanGoBack] = useState(false);
    const ready = Boolean(state);
    const sequence = useRef(0);
    const initial = useRef(entry);
    initial.current = entry;
    const scope: ReviewScope = {
        flow: review?.flow ?? "app",
        section: review?.section ?? "main",
    };
    const origin = useRef(scope);
    const frameHost = useRef<HTMLDivElement>(null);
    // A flow selection starts the selected real route. Observing another page
    // only updates the caption and map location; it never remounts that route.
    // biome-ignore lint/correctness/useExhaustiveDependencies: revision is the explicit request to open a new route, not an observed state update.
    useEffect(() => {
        if (!ready) return;
        origin.current = scope;
        setPage({
            id: ++sequence.current,
            src: canvasScreenUrl(initial.current, undefined, { theme: mode }),
        });
        setObserved(undefined);
        setCanGoBack(false);
    }, [revision, ready, mode]);
    // The frame restarts from its entry URL when starting conditions are applied.
    // biome-ignore lint/correctness/useExhaustiveDependencies: clear observations on an explicit restart.
    useEffect(() => {
        setObserved(undefined);
        setCanGoBack(false);
    }, [conditionsRevision]);
    const current =
        observed && reviewPageForLocation(scope, observed, origin.current);
    const currentEntry =
        current?.entry ??
        (observed
            ? {
                  id: observed.node,
                  title: observed.title || "Unrecognized page",
                  owner: "Pollinations" as const,
              }
            : entry);
    const title =
        current?.entry.title ?? (observed?.title || currentEntry.title);
    function report(screen: ObservedScreen) {
        setObserved(screen);
        review?.observe(screen, origin.current);
        const currentWindow =
            frameHost.current?.querySelector<HTMLIFrameElement>("iframe")
                ?.contentDocument?.defaultView as
                | (Window & { navigation?: { canGoBack: boolean } })
                | null;
        // Navigation API entries omit documents from the other origin. An
        // Admin → Enter handoff still has the starting dashboard behind it.
        const currentOrigin = currentWindow?.location.origin ?? ADMIN_ORIGIN;
        const entryOrigin = new URL(page?.src ?? "", location.origin).origin;
        setCanGoBack(
            currentOrigin !== entryOrigin ||
                (screen.canGoBack ??
                    Boolean(currentWindow?.navigation?.canGoBack)),
        );
        if (visible) {
            const page = reviewPageForLocation(scope, screen, origin.current);
            onLocationChange({
                world:
                    page?.flow === "app" && page.section === "topup"
                        ? "topup"
                        : (page?.flow ?? world),
                node: page?.node ?? screen.node,
            });
        }
        void refresh();
    }
    const reportLatest = useRef<() => void>(() => {});
    reportLatest.current = () => {
        if (observed) report(observed);
    };
    useEffect(() => {
        if (visible) reportLatest.current();
    }, [visible]);
    return (
        <div
            className="journey-view"
            data-theme="accent"
            data-preview-size={desktop ? "desktop" : "mobile"}
        >
            <div className="journey-shell">
                <main className="journey-layout">
                    <ScreenViewer
                        entry={currentEntry}
                        title={title}
                        desktop={desktop}
                    >
                        <ScreenWindow entry={currentEntry}>
                            <div ref={frameHost} style={{ height: "100%" }}>
                                {page && (
                                    <RuntimeFrame
                                        key={page.id}
                                        src={page.src}
                                        title={`${currentEntry.title} · journey`}
                                        onReport={report}
                                        onOpenDashboard={onOpenDashboard}
                                    />
                                )}
                            </div>
                        </ScreenWindow>
                    </ScreenViewer>
                </main>
            </div>
            <div className="journey-back-tools" data-theme="neutral">
                <IconButton
                    size="md"
                    title="Previous step"
                    disabled={!canGoBack}
                    onClick={() => {
                        navigateFrame(
                            frameHost.current?.querySelector("iframe") ?? null,
                            "back",
                        );
                    }}
                >
                    <ArrowRightIcon className="polli:h-4 polli:w-4 polli:rotate-180" />
                </IconButton>
            </div>
        </div>
    );
}
