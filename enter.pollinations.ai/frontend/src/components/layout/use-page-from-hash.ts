import { type Dispatch, type SetStateAction, useEffect, useState } from "react";

/**
 * Tracks the active dashboard page from the URL hash, keeping it in sync with
 * `hashchange` events. Each route supplies its own stable `parse` function,
 * since routing rules differ (signed-in vs signed-out).
 */
export function usePageFromHash<TPage>(
    parse: (hash: string) => TPage,
): [TPage, Dispatch<SetStateAction<TPage>>] {
    const [activePage, setActivePage] = useState<TPage>(() =>
        parse(window.location.hash),
    );

    useEffect(() => {
        function syncPageFromHash(): void {
            setActivePage(parse(window.location.hash));
        }

        window.addEventListener("hashchange", syncPageFromHash);
        return () => window.removeEventListener("hashchange", syncPageFromHash);
    }, [parse]);

    return [activePage, setActivePage];
}
