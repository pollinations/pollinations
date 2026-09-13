import { Button } from "@pollinations/ui";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useConnectConditions } from "./conditions";
import {
    type CanvasScreen,
    canvasScreenUrl,
} from "./pollen-connect-canvas-data";
import { illustrations } from "./pollen-connect-illustrations";
import { ProviderScreen } from "./pollen-connect-provider";
import { CapturedScreen, useReview } from "./review";
import { type ObservedScreen, RuntimeFrame } from "./runtime-frame";
import "./pollen-connect-window.css";

// Match the fixed viewports used by Screens and the expanded previews.
export function JourneyPreview({
    desktop,
    framed = true,
    children,
}: {
    desktop: boolean;
    framed?: boolean;
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
            {framed ? (
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
            ) : (
                children
            )}
        </div>
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

export function Illustration({
    name,
    onAction,
}: {
    name: string;
    onAction?: (label: string) => void;
}) {
    const { state } = useConnectConditions();
    if (["device", "device-link", "device-done"].includes(name)) {
        const linked = name === "device-link";
        const device = state?.device;
        const url =
            (linked
                ? device?.verificationUriComplete
                : device?.verificationUri) ?? `${location.origin}/device`;
        return (
            <div className="connect-terminal-output">
                <pre>
                    {name !== "device-done"
                        ? "$ my-app connect\n\nOpen this URL in your browser:\n"
                        : device?.status === "completed"
                          ? "$ my-app connect\n\nConnected.\nYou can return to your app."
                          : "$ my-app connect\n\nWaiting for a completed connection."}
                </pre>
                {name !== "device-done" && (
                    <>
                        {onAction ? (
                            <Button
                                className="connect-terminal-link"
                                onClick={() =>
                                    onAction?.(
                                        linked
                                            ? "Open link with code"
                                            : "Open verification URL",
                                    )
                                }
                            >
                                {url}
                            </Button>
                        ) : (
                            <span className="connect-terminal-link">{url}</span>
                        )}
                        <pre>
                            {device
                                ? `\nDevice code: ${device.userCode}\n\n${device.status}`
                                : "\nStart a connection in Journey to get a device code."}
                        </pre>
                    </>
                )}
            </div>
        );
    }
    // Static, repository-owned illustrations; never populated with user or API content.
    const provider =
        name.startsWith("github-") && name !== "github-signup"
            ? "github"
            : undefined;
    const html = provider
        ? illustrations[name].replace(/<div class="symbol">[^<]+<\/div>/, "")
        : illustrations[name];
    const wrap = (content: ReactNode) =>
        provider ? (
            <ProviderScreen provider={provider}>{content}</ProviderScreen>
        ) : (
            content
        );
    const action = html.match(/<div class="external-button">([^<]+)<\/div>/);
    if (onAction && (action || name === "device")) {
        const [before, after = ""] = action ? html.split(action[0]) : [html];
        return wrap(
            <div className="canvas-illustration">
                <div
                    className="illustration-fragment"
                    dangerouslySetInnerHTML={{ __html: before }}
                />
                <Button
                    className="external-button"
                    onClick={() =>
                        onAction(action?.[1] ?? "Open verification URL")
                    }
                >
                    {action?.[1] ?? "Open verification URL"}
                </Button>
                <div
                    className="illustration-fragment"
                    dangerouslySetInnerHTML={{
                        __html: after.replace(
                            "<p>New to GitHub? Create an account.</p>",
                            "",
                        ),
                    }}
                />
                {name === "github-login" && (
                    <Button
                        size="sm"
                        className="journey-quiet"
                        onClick={() => onAction("Create an account")}
                    >
                        Create an account
                    </Button>
                )}
                {name === "github-signup" && (
                    <Button
                        size="sm"
                        className="journey-quiet"
                        onClick={() => onAction("Cancel")}
                    >
                        Cancel
                    </Button>
                )}
                {name === "github-authorize" && (
                    <Button
                        size="sm"
                        className="journey-quiet"
                        onClick={() => onAction("Cancel")}
                    >
                        Cancel
                    </Button>
                )}
            </div>,
        );
    }
    return wrap(
        <div
            className="canvas-illustration"
            dangerouslySetInnerHTML={{ __html: html }}
        />,
    );
}

export function ScreenContent({
    entry,
    variant = 0,
    focused = false,
    scrollable = false,
    onOpen,
    overrides = {},
    onClose,
    onKeyDown,
    onReport,
}: {
    entry: CanvasScreen;
    variant?: number;
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
    if (entry.illustration || entry.owner === "GitHub")
        return (
            <ScreenWindow entry={entry}>
                <Illustration name={entry.illustration ?? "github-handoff"} />
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
                src={canvasScreenUrl(entry, variant, overrides)}
                title={`${entry.title} · screen preview`}
                interactive={false}
                onClose={onClose}
                onKeyDown={onKeyDown}
                onReport={onReport}
            />
        </ScreenWindow>
    );
}
