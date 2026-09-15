import { Button } from "@pollinations/ui";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useConnectConditions } from "./conditions";
import {
    type CanvasScreen,
    canvasScreenUrl,
} from "./pollen-connect-canvas-data";
import { ProviderReference } from "./pollen-connect-provider";
import { CapturedScreen, useReview } from "./review";
import { type ObservedScreen, RuntimeFrame } from "./runtime-frame";
import "./pollen-connect-window.css";

// Screens and Journey share one fitted viewport.
function PreviewViewport({
    desktop,
    children,
}: {
    desktop: boolean;
    children: ReactNode;
}) {
    const stage = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(1);
    const width = desktop ? 1280 : 375;
    const height = desktop ? 800 : (375 * 2622) / 1206;
    useEffect(() => {
        const element = stage.current;
        if (!element) return;
        const observer = new ResizeObserver(([{ contentRect }]) => {
            setScale(
                Math.max(
                    0,
                    Math.min(
                        1,
                        contentRect.width / width,
                        contentRect.height / height,
                    ),
                ),
            );
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, [width, height]);
    return (
        <div className="journey-stage" ref={stage}>
            <div
                className={`journey-device journey-device-${desktop ? "desktop" : "mobile"}`}
                style={{ width: width * scale, height: height * scale }}
            >
                <div
                    className="journey-screen"
                    style={{ width, height, transform: `scale(${scale})` }}
                >
                    {children}
                </div>
            </div>
        </div>
    );
}

export function ScreenViewer({
    entry,
    title = entry.title,
    desktop,
    children,
}: {
    entry: CanvasScreen;
    title?: string;
    desktop: boolean;
    children: ReactNode;
}) {
    return (
        <section className="connect-screen-viewer" aria-label={title}>
            <div className="connect-screen-caption">
                <strong>{title}</strong>
                <ScreenOwnership entry={entry} />
            </div>
            <PreviewViewport desktop={desktop}>{children}</PreviewViewport>
        </section>
    );
}

export function isTerminalScreen(entry?: CanvasScreen) {
    return (
        entry?.illustration === "device" ||
        entry?.illustration === "device-link" ||
        entry?.illustration === "device-done"
    );
}

export function ScreenOwnership({ entry }: { entry: CanvasScreen }) {
    return (
        <small className="connect-screen-owner">
            {isTerminalScreen(entry)
                ? "On your device"
                : entry.owner === "Developer app"
                  ? "In your app · optional UI"
                  : `On ${entry.owner}`}
        </small>
    );
}

export function ScreenWindow({
    entry,
    children,
}: {
    entry: CanvasScreen;
    children: ReactNode;
}) {
    const terminal = isTerminalScreen(entry);
    const content = (
        <div
            className={`connect-screen-window ${terminal ? "connect-terminal-window" : "connect-browser-window connect-screen-viewport"}`}
        >
            {terminal && (
                <div className="connect-window-bar">
                    <span aria-hidden="true">&gt;_</span>
                    <strong>App terminal</strong>
                    <span className="connect-window-owner">· Developer</span>
                </div>
            )}
            <div className="connect-window-content">{children}</div>
        </div>
    );
    return terminal ? (
        <div className="connect-terminal-device connect-screen-viewport">
            {content}
        </div>
    ) : (
        content
    );
}

export function DeviceTerminal({
    name,
    onOpen,
    busy = false,
    error,
}: {
    name: string;
    onOpen?: () => void | Promise<void>;
    busy?: boolean;
    error?: string;
}) {
    const { state } = useConnectConditions();
    const device = state?.device;
    const linked = name === "device-link";
    const done = name === "device-done";
    const url =
        (linked ? device?.verificationUriComplete : device?.verificationUri) ??
        `${location.origin}/device`;
    return (
        <div className="connect-terminal-output">
            <pre>
                {!done
                    ? "$ my-app connect\n\nOpen this URL in your browser:\n"
                    : device?.status === "completed"
                      ? "$ my-app connect\n\nConnected.\nYou can return to your app."
                      : "$ my-app connect\n\nWaiting for a completed connection."}
            </pre>
            {!done && (
                <>
                    {onOpen ? (
                        <Button
                            className="connect-terminal-link"
                            disabled={busy || !state}
                            onClick={() => void onOpen()}
                        >
                            {linked
                                ? "Open device link"
                                : "Open verification URL"}
                        </Button>
                    ) : (
                        <span className="connect-terminal-link">{url}</span>
                    )}
                    {(device || !onOpen) && (
                        <pre>
                            {device
                                ? `\nDevice code: ${device.userCode}\n\n${device.status}`
                                : "\nStart a connection in Journey to get a device code."}
                        </pre>
                    )}
                </>
            )}
            {error && <p role="alert">{error}</p>}
        </div>
    );
}

export function ScreenContent({
    entry,
    focused = false,
    scrollable = false,
    onOpen,
    overrides = {},
    onClose,
    onKeyDown,
    onReport,
}: {
    entry: CanvasScreen;
    focused?: boolean;
    scrollable?: boolean;
    onOpen?: () => void;
    overrides?: Record<string, string>;
    onClose?: () => void;
    onKeyDown?: (event: KeyboardEvent) => void;
    onReport?: (screen: ObservedScreen) => void;
}) {
    const review = useReview();
    const recipe = review?.resolve(entry);
    if (
        recipe?.provider ||
        entry.owner === "GitHub" ||
        entry.owner === "Stripe"
    )
        return (
            <ScreenWindow entry={entry}>
                <ProviderReference
                    github={
                        recipe?.provider === "GitHub" ||
                        entry.owner === "GitHub"
                    }
                    billing={(recipe?.query.screen ?? entry.screen)?.includes(
                        "billing",
                    )}
                />
            </ScreenWindow>
        );
    if (recipe)
        return (
            <ScreenWindow entry={entry}>
                <CapturedScreen
                    recipe={recipe}
                    scrollable={focused || scrollable}
                    onOpen={onOpen}
                    onClose={onClose}
                    onKeyDown={onKeyDown}
                />
            </ScreenWindow>
        );
    if (entry.illustration)
        return (
            <ScreenWindow entry={entry}>
                <DeviceTerminal name={entry.illustration} />
            </ScreenWindow>
        );
    if (!focused)
        return (
            <ScreenWindow entry={entry}>
                <div className="connect-route-reference">
                    <strong>{entry.title}</strong>
                    <ScreenOwnership entry={entry} />
                    <span>Preview not captured yet</span>
                </div>
            </ScreenWindow>
        );
    return (
        <ScreenWindow entry={entry}>
            <RuntimeFrame
                src={canvasScreenUrl(entry, undefined, overrides)}
                title={`${entry.title} · screen preview`}
                interactive={false}
                onClose={onClose}
                onKeyDown={onKeyDown}
                onReport={onReport}
            />
        </ScreenWindow>
    );
}
