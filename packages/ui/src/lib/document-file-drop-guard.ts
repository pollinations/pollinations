type GuardState = {
    consumers: number;
    preventFileNavigation: EventListener;
};

const guards = new WeakMap<Document, GuardState>();

/**
 * Prevents the browser from navigating to a dropped file while at least one
 * upload control is mounted. One listener pair is shared per document.
 */
export function acquireDocumentFileDropGuard(document: Document): () => void {
    let guard = guards.get(document);

    if (!guard) {
        const preventFileNavigation: EventListener = (event) => {
            const types = (event as DragEvent).dataTransfer?.types;
            if (types?.includes("Files")) event.preventDefault();
        };

        guard = { consumers: 0, preventFileNavigation };
        guards.set(document, guard);
        document.addEventListener("dragover", preventFileNavigation);
        document.addEventListener("drop", preventFileNavigation);
    }

    guard.consumers += 1;
    let released = false;

    return () => {
        if (released) return;
        released = true;
        guard.consumers -= 1;

        if (guard.consumers > 0) return;
        document.removeEventListener("dragover", guard.preventFileNavigation);
        document.removeEventListener("drop", guard.preventFileNavigation);
        guards.delete(document);
    };
}
