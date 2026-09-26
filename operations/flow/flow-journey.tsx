import { useState } from "react";
import { useFlowConditions } from "./conditions";
import { galleryScreensForFlow } from "./flow-gallery-data";
import type { JourneyLocation, JourneySelection } from "./flow-journey-state";
import { DeviceTerminal, ScreenViewer, ScreenWindow } from "./flow-preview";
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
}) {
    const { state, refresh } = useFlowConditions();
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
                const response = await fetch("/__flow/device/start", {
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
                        <ScreenViewer entry={first} desktop={desktop}>
                            <ScreenWindow entry={first}>
                                <DeviceTerminal
                                    name={
                                        entrance.section === "link"
                                            ? "device-link"
                                            : "device"
                                    }
                                    onOpen={openDevice}
                                    busy={busy}
                                    error={error}
                                />
                            </ScreenWindow>
                        </ScreenViewer>
                    </main>
                </div>
            </div>
        );
    const entry = reviewCase
        ? reviewScreen(reviewCase, inventory, {
              flow: entrance.world,
              section: entrance.section,
          })
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
            entry={entry}
            world={
                entrance.world === "app" && entrance.section === "topup"
                    ? "topup"
                    : entrance.world
            }
            revision={entrance.revision}
            desktop={desktop}
            onLocationChange={onLocationChange}
            onOpenDashboard={onOpenDashboard}
        />
    );
}
