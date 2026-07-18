import type * as ReactDOMModule from "react-dom";

type ReactDOMGlobal = typeof ReactDOMModule;

function getReactDOM(): ReactDOMGlobal {
    const ReactDOM = (
        globalThis as typeof globalThis & { ReactDOM?: ReactDOMGlobal }
    ).ReactDOM;

    if (!ReactDOM) {
        throw new Error(
            "@pollinations/ui browser bundle requires globalThis.ReactDOM. Load ReactDOM before @pollinations/ui.",
        );
    }

    return ReactDOM;
}

const ReactDOM = getReactDOM();

export default ReactDOM;
export const { createPortal, flushSync } = ReactDOM;
