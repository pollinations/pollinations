// <polli-connect>: Pollinations sign-in as one script tag, no build step.
// The page reads `element.apiKey` and listens for `change`.
import { createRoot, type Root } from "react-dom/client";
import { AppUserMenu } from "../modules/app-user-menu/AppUserMenu.tsx";
import { ConnectAuth } from "./connect-auth.tsx";
import {
    CONNECT_ATTRIBUTES,
    connectMenuOptions,
    connectOptions,
} from "./connect-options.ts";

// Marks the account menu's panel, which is portalled to <body>.
const MENU = "polli-connect-menu";

// Our React apps load Tailwind's preflight; host pages don't. This scoped copy
// keeps browser defaults and the page's inherited text styles out of the
// button and its menu, and nothing else on the page. It sits in the base
// layer, so the package's utility classes still win.
const RESET = `
polli-connect { display: inline-block; }
@layer base {
    :where(polli-connect, .${MENU}) {
        font: 400 1rem/1.5 var(--polli-font-body);
        letter-spacing: normal;
        text-transform: none;
        text-align: start;
        color: var(--polli-color-text-strong);
    }
    :where(polli-connect, .${MENU}) *,
    :where(.${MENU}) {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
        border: 0 solid;
    }
    :where(polli-connect, .${MENU}) :where(button) {
        font: inherit;
        letter-spacing: inherit;
        color: inherit;
        border-radius: 0;
        background-color: transparent;
    }
    :where(polli-connect, .${MENU}) :where(a) {
        color: inherit;
        text-decoration: inherit;
    }
    :where(polli-connect, .${MENU}) :where(img, svg) {
        display: block;
        vertical-align: middle;
    }
}`;

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
    style.textContent = RESET;
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
                <AppUserMenu
                    menuClassName={MENU}
                    {...connectMenuOptions(this)}
                />
            </ConnectAuth>,
        );
    }
}

if (!customElements.get("polli-connect")) {
    customElements.define("polli-connect", PolliConnect);
}
