import { ENTER_ORIGIN } from "./local-origins";
import { observeScreen } from "./observe-screen";

// Flow can observe its other local host, but cannot read its DOM directly.
// Send only page identity and navigation state, never account/session data.
if (window.parent !== window) {
    let previous = "";
    const report = () => {
        const screen = observeScreen(document);
        if (!screen) return;
        const navigation = (
            window as Window & { navigation?: { canGoBack: boolean } }
        ).navigation;
        screen.canGoBack = Boolean(navigation?.canGoBack);
        const value = JSON.stringify(screen);
        if (value === previous) return;
        previous = value;
        window.parent.postMessage(
            { type: "flow:admin-screen", screen },
            ENTER_ORIGIN,
        );
    };
    new MutationObserver(report).observe(document.documentElement, {
        subtree: true,
        childList: true,
        characterData: true,
    });
    window.addEventListener("popstate", report);
    window.addEventListener("message", (event) => {
        if (
            event.origin !== ENTER_ORIGIN ||
            event.source !== window.parent ||
            event.data?.type !== "flow:admin-navigation"
        )
            return;
        if (event.data.action === "reload") location.reload();
        if (event.data.action === "back") history.back();
    });
    document.addEventListener("keydown", (event) => {
        if (["Escape", "ArrowLeft", "ArrowRight"].includes(event.key))
            window.parent.postMessage(
                { type: "flow:admin-key", key: event.key },
                ENTER_ORIGIN,
            );
    });
    report();
}
