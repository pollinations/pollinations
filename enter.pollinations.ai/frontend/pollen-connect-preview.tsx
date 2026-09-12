import { Button, Chip } from "@pollinations/ui";
import { type ReactNode, useRef } from "react";
import {
    type CanvasScreen,
    canvasScreenUrl,
} from "./pollen-connect-canvas-data";
import { illustrations } from "./pollen-connect-illustrations";
import { ProviderScreen } from "./pollen-connect-provider";
import "./pollen-connect-window.css";

export function InventoryCount({
    count,
    unit,
}: {
    count: number;
    unit: "screen" | "state";
}) {
    const label = `${count} ${unit}${count === 1 ? "" : "s"}`;
    return (
        <Chip
            size="sm"
            data-theme="neutral"
            className="connect-count-badge"
            title={label}
            aria-label={label}
        >
            {count}
        </Chip>
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
            className={`connect-screen-window ${terminal ? "connect-terminal-window" : "connect-browser-window"}`}
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
        <div className="connect-terminal-device">{content}</div>
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
    if (["device", "device-link", "device-done"].includes(name)) {
        const linked = name === "device-link";
        const url = `https://enter.pollinations.ai/device${linked ? "?user_code=ABCD-EFGH" : ""}`;
        return (
            <div className="connect-terminal-output">
                <pre>
                    {name !== "device-done"
                        ? "$ my-app connect\n\nOpen this URL in your browser:\n"
                        : "$ my-app connect\n\nConnected.\nYou can return to your app."}
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
                            {
                                "\nDevice code: ABCD-EFGH\n\nWaiting for approval…"
                            }
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
    overrides = {},
    onClose,
    onKeyDown,
}: {
    entry: CanvasScreen;
    variant?: number;
    focused?: boolean;
    overrides?: Record<string, string>;
    onClose?: () => void;
    onKeyDown?: (event: KeyboardEvent) => void;
}) {
    const frame = useRef<HTMLIFrameElement>(null);
    if (entry.illustration)
        return (
            <ScreenWindow entry={entry}>
                <Illustration name={entry.illustration} />
            </ScreenWindow>
        );
    return (
        <ScreenWindow entry={entry}>
            <iframe
                ref={frame}
                id={focused ? "inspector-frame" : undefined}
                src={
                    canvasScreenUrl(entry, variant, overrides) +
                    (focused ? "" : "&thumbnail=1")
                }
                title={
                    entry.title + (focused ? " · screen preview" : " · preview")
                }
                loading={focused ? "eager" : "lazy"}
                tabIndex={focused ? 0 : -1}
                aria-hidden={focused ? undefined : true}
                inert={!focused}
                onLoad={() => {
                    const doc = frame.current?.contentDocument;
                    if (!focused || !doc) return;
                    const controls =
                        'a, button, input, textarea, select, [role="button"], [role="slider"], [role="switch"], [contenteditable="true"]';
                    const blockAction = (event: Event) => {
                        // Scripted fixture actions still render loading/error variants.
                        if (!event.isTrusted) return;
                        event.preventDefault();
                        event.stopImmediatePropagation();
                    };
                    for (const type of [
                        "click",
                        "dblclick",
                        "submit",
                        "beforeinput",
                    ])
                        doc.defaultView?.addEventListener(
                            type,
                            blockAction,
                            true,
                        );
                    doc.defaultView?.addEventListener(
                        "pointerdown",
                        (event) => {
                            if ((event.target as Element)?.closest?.(controls))
                                blockAction(event);
                        },
                        true,
                    );
                    doc.defaultView?.addEventListener(
                        "keydown",
                        (event) => {
                            if (event.key === "Escape") onClose?.();
                            onKeyDown?.(event);
                            if (
                                event.defaultPrevented ||
                                event.key === "Enter" ||
                                event.key === " " ||
                                (event.key !== "Tab" &&
                                    (event.target as Element)?.closest?.(
                                        controls,
                                    ))
                            )
                                blockAction(event);
                        },
                        true,
                    );
                }}
            />
        </ScreenWindow>
    );
}
