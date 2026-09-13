import { Button } from "@pollinations/ui";
import { useState } from "react";
import { useConnectConditions } from "./conditions";
import { galleryScreensForFlow } from "./pollen-connect-gallery-data";
import type {
    JourneyLocation,
    JourneySelection,
} from "./pollen-connect-journey-state";
import {
    JourneyPreview,
    ScreenOwnership,
    ScreenWindow,
} from "./pollen-connect-preview";
import type { AppPreviewProps } from "./pollen-connect-request-config";
import { reviewScreen } from "./review";
import type { ReviewCase } from "./review-cases";
import { RuntimeJourney } from "./runtime-journey";

export function Journey({
    desktop,
    entrance,
    onLocationChange,
    onOpenDashboard,
    reviewCase,
}: {
    desktop: boolean;
    entrance: JourneySelection;
    onLocationChange: (location: JourneyLocation) => void;
    onOpenDashboard: () => void;
    reviewCase?: ReviewCase;
} & AppPreviewProps) {
    const { state, refresh } = useConnectConditions();
    const [opened, setOpened] = useState<number | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const inventory = galleryScreensForFlow(entrance.world, entrance.section);
    const terminal =
        entrance.world === "device" &&
        !reviewCase &&
        opened !== entrance.revision;
    const first =
        inventory.find(
            (entry) =>
                entry.id ===
                (entrance.world === "device" ? "device-start" : "app-connect"),
        ) ?? inventory[0];
    async function openDevice() {
        setBusy(true);
        setError("");
        try {
            if (!state?.device || state.device.status !== "pending") {
                const response = await fetch("/__connect/device/start", {
                    method: "POST",
                });
                if (!response.ok)
                    throw new Error("Couldn’t start a local device request.");
                await refresh();
            }
            setOpened(entrance.revision);
        } catch (reason) {
            setError(
                reason instanceof Error
                    ? reason.message
                    : "Couldn’t start the device request.",
            );
        } finally {
            setBusy(false);
        }
    }
    if (terminal)
        return (
            <div
                className="journey-view"
                data-preview-size={desktop ? "desktop" : "mobile"}
            >
                <div className="journey-shell">
                    <main className="journey-layout">
                        <section className="journey-preview">
                            <div className="journey-screen-caption">
                                <strong>{first.title}</strong>
                                <ScreenOwnership entry={first} />
                            </div>
                            <JourneyPreview desktop={desktop}>
                                <ScreenWindow entry={first}>
                                    <div className="connect-terminal-output">
                                        <pre>
                                            {
                                                "$ my-app connect\n\nOpen this URL in your browser:\n"
                                            }
                                        </pre>
                                        <Button
                                            className="connect-terminal-link"
                                            disabled={busy || !state}
                                            onClick={() => void openDevice()}
                                        >
                                            {entrance.section === "link"
                                                ? "Open device link"
                                                : "Open verification URL"}
                                        </Button>
                                        {state?.device && (
                                            <pre>{`\nDevice code: ${state.device.userCode}\n\n${state.device.status}`}</pre>
                                        )}
                                        {error && <p role="alert">{error}</p>}
                                    </div>
                                </ScreenWindow>
                            </JourneyPreview>
                        </section>
                    </main>
                </div>
            </div>
        );
    const entry = reviewCase
        ? reviewScreen(reviewCase, inventory)
        : entrance.world === "device"
          ? {
                ...(inventory.find((item) => item.id === "device-code") ??
                    first),
                illustration: undefined,
                screen:
                    entrance.section === "link"
                        ? "device-prefilled"
                        : "device-code",
            }
          : first;
    return (
        <RuntimeJourney
            key={`${entrance.world}:${entrance.section}`}
            entry={entry}
            inventory={inventory}
            world={entrance.world}
            revision={entrance.revision}
            desktop={desktop}
            onLocationChange={onLocationChange}
            onOpenDashboard={onOpenDashboard}
        />
    );
}
