// <polli-connect>: Pollinations sign-in as one script tag, no build step.
// The page reads `element.apiKey` and listens for `change`.
import { createRoot, type Root } from "react-dom/client";
import { AppUserMenu } from "../modules/app-user-menu/AppUserMenu.tsx";
import { ConnectAuth } from "./connect-auth.tsx";
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

// ponytail: one auth root per page; shared auth can follow a concrete consumer.
let activeConnect: PolliConnect | undefined;

class PolliConnect extends HTMLElement {
    static observedAttributes = CONNECT_ATTRIBUTES;

    /** The connected user's API key, or null when signed out. */
    apiKey: string | null = null;

    #root: Root | undefined;

    connectedCallback() {
        if (activeConnect && activeConnect !== this) {
            const error = document.createElement("span");
            error.setAttribute("role", "alert");
            error.textContent =
                "Only one <polli-connect> is supported per page.";
            this.replaceChildren(error);
            return;
        }
        activeConnect = this;
        this.#root ??= createRoot(this);
        this.#render();
    }

    disconnectedCallback() {
        this.#root?.unmount();
        this.#root = undefined;
        if (activeConnect === this) activeConnect = undefined;
        this.#setKey(null);
    }

    attributeChangedCallback(
        name: string,
        previous: string | null,
        next: string | null,
    ) {
        if (name === "app-key" && previous?.trim() !== next?.trim()) {
            this.#setKey(null);
        }
        if (this.#root) this.#render();
    }

    #setKey = (apiKey: string | null) => {
        if (apiKey === this.apiKey) return;
        this.apiKey = apiKey;
        this.dispatchEvent(new Event("change"));
    };

    #render() {
        this.#root?.render(
            <ConnectAuth {...connectOptions(this)} onChange={this.#setKey}>
                <AppUserMenu />
            </ConnectAuth>,
        );
    }
}

if (!customElements.get("polli-connect")) {
    customElements.define("polli-connect", PolliConnect);
}
