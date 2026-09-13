import {
    ArrowRightIcon,
    Button,
    Tooltip,
    useColorMode,
} from "@pollinations/ui";
import { useEffect, useRef, useState } from "react";
import { useConnectConditions } from "./conditions";
import {
    type CanvasScreen,
    canvasScreenUrl,
} from "./pollen-connect-canvas-data";
import type { JourneyLocation } from "./pollen-connect-journey-state";
import { ScreenViewer, ScreenWindow } from "./pollen-connect-preview";
import { useReview } from "./review";
import { reviewCaseForNode } from "./review-inventory";
import { type ObservedScreen, RuntimeFrame } from "./runtime-frame";
import "./pollen-connect-journey.css";

export function RuntimeJourney({
    entry,
    inventory,
    world,
    revision,
    desktop,
    onLocationChange,
    onOpenDashboard,
    onReport,
}: {
    entry: CanvasScreen;
    inventory: CanvasScreen[];
    world: JourneyLocation["world"];
    revision: number;
    desktop: boolean;
    onLocationChange: (location: JourneyLocation) => void;
    onOpenDashboard: () => void;
    onReport?: (screen: ObservedScreen) => void;
}) {
    const {
        state,
        refresh,
        revision: conditionsRevision,
    } = useConnectConditions();
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
    const frameHost = useRef<HTMLDivElement>(null);
    // A flow selection starts the selected real route. Observing another page
    // only updates the caption and map location; it never remounts that route.
    // biome-ignore lint/correctness/useExhaustiveDependencies: revision is the explicit request to open a new route, not an observed state update.
    useEffect(() => {
        if (!ready) return;
        setPage({
            id: ++sequence.current,
            src: canvasScreenUrl(initial.current, 0, { theme: mode }),
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
    const observedCase =
        observed && reviewCaseForNode(review?.cases ?? [], observed.node);
    const currentEntry =
        inventory.find(
            (item) => item.id === (observedCase?.pageId ?? observed?.node),
        ) ?? entry;
    const title = observedCase
        ? currentEntry.title
        : observed?.title || currentEntry.title;
    function report(screen: ObservedScreen) {
        setObserved(screen);
        review?.observe(world, screen);
        const currentWindow =
            frameHost.current?.querySelector<HTMLIFrameElement>("iframe")
                ?.contentWindow as
                | (Window & { navigation?: { canGoBack: boolean } })
                | null;
        setCanGoBack(Boolean(currentWindow?.navigation?.canGoBack));
        if (visible) {
            onLocationChange({
                world,
                node:
                    reviewCaseForNode(review?.cases ?? [], screen.node)
                        ?.family ?? screen.node,
            });
            onReport?.(screen);
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
            <div className="journey-back-tools">
                <Tooltip content="Previous step" triggerAs="span">
                    <Button
                        data-theme="neutral"
                        aria-label="Previous step"
                        disabled={!canGoBack}
                        className="polli:gap-2"
                        onClick={() => {
                            frameHost.current
                                ?.querySelector("iframe")
                                ?.contentWindow?.history.back();
                        }}
                    >
                        <ArrowRightIcon className="polli:h-4 polli:w-4 polli:rotate-180" />
                        <span className="journey-back-label">
                            Previous step
                        </span>
                    </Button>
                </Tooltip>
            </div>
        </div>
    );
}
