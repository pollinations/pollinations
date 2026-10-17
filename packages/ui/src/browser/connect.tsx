// <polli-connect>: Pollinations sign-in as one script tag, no build step.
// The page reads `element.apiKey` and listens for `change`.
import { PolliProvider, useAuthState } from "@pollinations/sdk/react";
import { useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AppUserMenu } from "../modules/app-user-menu/AppUserMenu.tsx";
import { CONNECT_ATTRIBUTES, connectOptions } from "./connect-options.ts";

// The element uses the package stylesheet published next to this script and
// sizes to its button. Both go first in <head>, so the page's own rules win.
const script = document.currentScript;
if (
    script instanceof HTMLScriptElement &&
    script.src &&
    !document.querySelector("link[data-polli-connect]")
) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = new URL("styles.css", script.src).href;
    link.dataset.polliConnect = "";
    const style = document.createElement("style");
    style.textContent = "polli-connect{display:inline-block}";
    document.head.prepend(link, style);
}

function KeyBridge({
    onChange,
}: {
    onChange: (apiKey: string | null) => void;
}) {
    const { apiKey, isHydrated } = useAuthState();
    useEffect(() => {
        if (isHydrated) onChange(apiKey);
    }, [apiKey, isHydrated, onChange]);
    return null;
}

class PolliConnect extends HTMLElement {
    static observedAttributes = CONNECT_ATTRIBUTES;

    /** The connected user's API key, or null when signed out. */
    apiKey: string | null = null;

    #root: Root | undefined;

    connectedCallback() {
        this.#root ??= createRoot(this);
        this.#render();
    }

    disconnectedCallback() {
        this.#root?.unmount();
        this.#root = undefined;
    }

    attributeChangedCallback() {
        if (this.#root) this.#render();
    }

    #setKey = (apiKey: string | null) => {
        if (apiKey === this.apiKey) return;
        this.apiKey = apiKey;
        this.dispatchEvent(new Event("change"));
    };

    #render() {
        this.#root?.render(
            <PolliProvider {...connectOptions(this)}>
                <KeyBridge onChange={this.#setKey} />
                <AppUserMenu />
            </PolliProvider>,
        );
    }
}

if (!customElements.get("polli-connect")) {
    customElements.define("polli-connect", PolliConnect);
}
