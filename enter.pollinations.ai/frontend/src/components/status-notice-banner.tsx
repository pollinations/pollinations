import { Alert, Button, cn, IconButton, XIcon } from "@pollinations/ui";
import { useCallback, useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Severity = "info" | "warning" | "critical";

interface StatusNotice {
    message: string;
    severity: Severity;
    linkUrl?: string;
    linkLabel?: string;
    updatedAt: string;
}

type FetchResult = { notice: StatusNotice | null };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 60_000;
const DISMISS_KEY = "pollinations-status-notice-dismissed";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function severityIntent(severity: Severity): "info" | "warning" | "danger" {
    switch (severity) {
        case "info":
            return "info";
        case "critical":
            return "danger";
        default:
            return "warning";
    }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const StatusNoticeBanner = () => {
    const [notice, setNotice] = useState<StatusNotice | null>(null);
    const [dismissedAt, setDismissedAt] = useState<string | null>(() =>
        localStorage.getItem(DISMISS_KEY),
    );
    const [loading, setLoading] = useState(true);
    const dismissedRef = useRef(dismissedAt);
    dismissedRef.current = dismissedAt;

    const fetchNotice = useCallback(async () => {
        try {
            const res = await fetch("/api/status-notice");
            if (!res.ok) return;
            const data = (await res.json()) as FetchResult;
            setNotice(data.notice);
        } catch {
            // Silently ignore fetch errors; the banner just won't appear.
        } finally {
            setLoading(false);
        }
    }, []);

    // Initial fetch + polling
    useEffect(() => {
        void fetchNotice();
        const id = setInterval(fetchNotice, POLL_INTERVAL_MS);
        return () => clearInterval(id);
    }, [fetchNotice]);

    // Reset dismiss when notice changes (keyed by updatedAt)
    useEffect(() => {
        if (!notice) return;
        if (dismissedRef.current !== notice.updatedAt) {
            setDismissedAt(localStorage.getItem(DISMISS_KEY));
        }
    }, [notice]);

    const handleDismiss = () => {
        if (!notice) return;
        const key = notice.updatedAt;
        localStorage.setItem(DISMISS_KEY, key);
        setDismissedAt(key);
    };

    // Don't render while loading first fetch, when no notice, or when dismissed
    if (loading || !notice) return null;
    if (dismissedAt === notice.updatedAt) return null;

    return (
        <Alert
            intent={severityIntent(notice.severity)}
            className={cn(
                "polli:relative",
                notice.severity === "critical" && "polli:animate-pulse",
            )}
        >
            <div className="polli:flex polli:items-start polli:gap-2">
                <div className="polli:flex-1 polli:min-w-0">
                    <p className="polli:text-sm polli:leading-snug">
                        {notice.message}
                    </p>
                    {notice.linkUrl && (
                        <Button
                            as="a"
                            href={notice.linkUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            size="sm"
                            className="polli:mt-1"
                        >
                            {notice.linkLabel || "Learn more"}
                        </Button>
                    )}
                </div>
                <IconButton
                    onClick={handleDismiss}
                    title="Dismiss status notice"
                    className="polli:shrink-0"
                >
                    <XIcon />
                </IconButton>
            </div>
        </Alert>
    );
};
