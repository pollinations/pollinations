import {
    type FC,
    useEffect,
    useLayoutEffect,
    useRef,
    useSyncExternalStore,
} from "react";
import { InlineLink } from "../primitives/InlineLink.tsx";
import { Alert } from "./Alert.tsx";

/** The one outage message, wherever account data can't load. */
export const OUTAGE_MESSAGE =
    "Pollinations is having a temporary outage. Some services are down for now. Your account, keys and pollen are safe, and nothing is lost.";

function subscribeOnline(listener: () => void): () => void {
    window.addEventListener("online", listener);
    window.addEventListener("offline", listener);
    return () => {
        window.removeEventListener("online", listener);
        window.removeEventListener("offline", listener);
    };
}

/** False while the browser reports no connection: then the failure is not ours. */
export function useOnline(): boolean {
    return useSyncExternalStore(
        subscribeOnline,
        () => navigator.onLine,
        () => true,
    );
}

// Notices on the page: the topmost gives the full message, the rest stay short.
const notices = new Set<HTMLElement>();
const listeners = new Set<() => void>();
const useIsomorphicLayoutEffect =
    typeof window === "undefined" ? useEffect : useLayoutEffect;

function subscribeNotices(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function topNotice(): HTMLElement | undefined {
    let top: HTMLElement | undefined;
    for (const notice of notices) {
        if (
            !top ||
            top.compareDocumentPosition(notice) &
                Node.DOCUMENT_POSITION_PRECEDING
        ) {
            top = notice;
        }
    }
    return top;
}

export type OutageNoticeProps = {
    /** The caller retries on its own, so the notice says so. */
    retrying?: boolean;
    /** Status page link; hidden without one. */
    statusUrl?: string;
    className?: string;
};

/**
 * Stands in for account data while Pollinations is down, or the visitor is
 * offline. With several on a page, only the topmost gives the full message.
 */
export const OutageNotice: FC<OutageNoticeProps> = ({
    retrying = false,
    statusUrl,
    className,
}) => {
    const online = useOnline();
    const ref = useRef<HTMLDivElement>(null);
    useIsomorphicLayoutEffect(() => {
        const notice = ref.current;
        if (!notice) return;
        notices.add(notice);
        for (const listener of listeners) listener();
        return () => {
            notices.delete(notice);
            for (const listener of listeners) listener();
        };
    }, []);
    const isTop = useSyncExternalStore(
        subscribeNotices,
        () => !ref.current || topNotice() === ref.current,
        () => true,
    );

    let message: string;
    if (!isTop) {
        message = online
            ? "Unavailable during the outage."
            : "Unavailable while you’re offline.";
    } else if (!online) {
        message = `You’re offline.${retrying ? " This page retries when your connection is back." : ""}`;
    } else {
        message = `${OUTAGE_MESSAGE}${retrying ? " Retrying automatically." : ""}`;
    }
    return (
        <div ref={ref} className={className}>
            <Alert intent="advisory">
                {message}
                {isTop && online && statusUrl && (
                    <>
                        {" "}
                        <InlineLink href={statusUrl}>Status page</InlineLink>
                    </>
                )}
            </Alert>
        </div>
    );
};
