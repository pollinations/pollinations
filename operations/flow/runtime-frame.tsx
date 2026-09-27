import { useEffect, useRef } from "react";
import { useFlowConditions } from "./conditions";
import { ADMIN_ORIGIN } from "./local-origins";
import { type ObservedScreen, observeScreen } from "./observe-screen";

export { type ObservedScreen, observeScreen } from "./observe-screen";

export function navigateFrame(
    frame: HTMLIFrameElement | null,
    action: "back" | "reload",
) {
    if (frame?.contentDocument) {
        if (action === "back") frame.contentWindow?.history.back();
        else frame.contentWindow?.location.reload();
    } else
        frame?.contentWindow?.postMessage(
            { type: "flow:admin-navigation", action },
            ADMIN_ORIGIN,
        );
}

// Observe real navigation and DOM; never infer progress from a clicked label,
// change a route's loader, or manufacture a response to advance the journey.
export function RuntimeFrame({
    src,
    title,
    interactive = true,
    onReport,
    onOpenDashboard,
    onClose,
    onKeyDown,
}: {
    src: string;
    title: string;
    interactive?: boolean;
    onReport?: (screen: ObservedScreen) => void;
    onOpenDashboard?: () => void;
    onClose?: () => void;
    onKeyDown?: (event: KeyboardEvent) => void;
}) {
    const { state, revision, restarting } = useFlowConditions();
    const frame = useRef<HTMLIFrameElement>(null);
    const observer = useRef<MutationObserver | undefined>(undefined);
    const callbacks = useRef({
        onReport,
        onOpenDashboard,
        onClose,
        onKeyDown,
    });
    callbacks.current = {
        onReport,
        onOpenDashboard,
        onClose,
        onKeyDown,
    };
    useEffect(() => {
        if (restarting) observer.current?.disconnect();
        return () => observer.current?.disconnect();
    }, [restarting]);
    useEffect(() => {
        const refresh = () => navigateFrame(frame.current, "reload");
        import.meta.hot?.on("flow:source-refreshed", refresh);
        return () => import.meta.hot?.off("flow:source-refreshed", refresh);
    }, []);
    useEffect(() => {
        const receive = (event: MessageEvent) => {
            if (
                event.origin !== ADMIN_ORIGIN ||
                event.source !== frame.current?.contentWindow
            )
                return;
            if (event.data?.type === "flow:admin-screen")
                callbacks.current.onReport?.(event.data.screen);
            if (event.data?.type === "flow:admin-key") {
                if (event.data.key === "Escape") callbacks.current.onClose?.();
                callbacks.current.onKeyDown?.(
                    new KeyboardEvent("keydown", { key: event.data.key }),
                );
            }
        };
        window.addEventListener("message", receive);
        return () => window.removeEventListener("message", receive);
    }, []);
    if (!state || restarting) return null;
    return (
        <iframe
            key={revision}
            ref={frame}
            src={src}
            title={title}
            loading={interactive ? "eager" : "lazy"}
            tabIndex={interactive ? 0 : -1}
            inert={!interactive}
            onLoad={() => {
                observer.current?.disconnect();
                const doc = frame.current?.contentDocument;
                if (!doc?.defaultView) return;
                doc.documentElement.inert = !interactive;
                let last = "";
                let previous: ObservedScreen | undefined;
                const report = () => {
                    const screen = observeScreen(doc, previous);
                    if (!screen) return;
                    previous = screen;
                    const key = JSON.stringify(screen);
                    if (key === last) return;
                    last = key;
                    callbacks.current.onReport?.(screen);
                };
                observer.current = new MutationObserver(report);
                observer.current.observe(doc.documentElement, {
                    subtree: true,
                    childList: true,
                    characterData: true,
                    attributes: true,
                    attributeFilter: [
                        "data-flow-state",
                        "data-admin-connected",
                        "aria-busy",
                        "hidden",
                        "aria-hidden",
                        "data-state",
                    ],
                });
                report();
                doc.defaultView.addEventListener("popstate", report);
                doc.addEventListener("keydown", (event) => {
                    if (event.key === "Escape") callbacks.current.onClose?.();
                    callbacks.current.onKeyDown?.(event);
                });
                doc.addEventListener(
                    "click",
                    (event) => {
                        const link = (event.target as Element)?.closest?.("a");
                        if (!link || !interactive) return;
                        if (
                            link.dataset.pollinationsAction === "dashboard" &&
                            callbacks.current.onOpenDashboard
                        ) {
                            event.preventDefault();
                            event.stopImmediatePropagation();
                            callbacks.current.onOpenDashboard();
                        }
                    },
                    true,
                );
            }}
        />
    );
}
