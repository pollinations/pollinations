import { XIcon } from "@pollinations/ui";
import { cn } from "@pollinations/ui";
import { type FC, useEffect, useState } from "react";

interface StatusNotice {
    message: string;
    link?: string;
    linkLabel?: string;
    createdAt: string;
}

interface StatusNoticeBannerProps {
    className?: string;
}

const DISMISS_KEY = "pollinations-status-notice-dismissed";

/**
 * Dashboard-wide status notice banner.
 * Displays admin-published notices about outages, maintenance, or critical updates.
 * Users can dismiss it temporarily; it returns after refresh while still active.
 */
export const StatusNoticeBanner: FC<StatusNoticeBannerProps> = ({
    className,
}) => {
    const [notice, setNotice] = useState<StatusNotice | null>(null);
    const [isDismissed, setIsDismissed] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchNotice = async () => {
            try {
                const response = await fetch("/api/status-notice");
                if (response.ok) {
                    const data = await response.json();
                    setNotice(data.notice);
                }
            } catch {
                // Silently fail - notice is optional
            } finally {
                setIsLoading(false);
            }
        };

        fetchNotice();
    }, []);

    useEffect(() => {
        if (!notice) return;

        // Check if this notice was dismissed
        try {
            const dismissed = localStorage.getItem(DISMISS_KEY);
            if (dismissed) {
                const { createdAt } = JSON.parse(dismissed);
                // If the notice is newer than the dismissed one, show it
                if (createdAt === notice.createdAt) {
                    setIsDismissed(true);
                }
            }
        } catch {
            // Invalid JSON, show the notice
        }
    }, [notice]);

    const handleDismiss = () => {
        setIsDismissed(true);
        try {
            localStorage.setItem(
                DISMISS_KEY,
                JSON.stringify({ createdAt: notice?.createdAt }),
            );
        } catch {
            // localStorage might be full or disabled
        }
    };

    if (isLoading || !notice || isDismissed) {
        return null;
    }

    return (
        <div
            role="status"
            aria-live="polite"
            className={cn(
                "rounded-lg border border-intent-warning-border bg-intent-warning-bg-light px-4 py-3 text-sm text-intent-warning-text",
                className,
            )}
        >
            <div className="flex items-start gap-3">
                <div className="flex-1">
                    <p>{notice.message}</p>
                    {notice.link && (
                        <a
                            href={notice.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1 inline-block text-xs font-medium underline hover:no-underline"
                        >
                            {notice.linkLabel || "Learn more"}
                        </a>
                    )}
                </div>
                <button
                    type="button"
                    onClick={handleDismiss}
                    className="shrink-0 rounded p-1 opacity-60 hover:opacity-100"
                    aria-label="Dismiss notice"
                >
                    <XIcon className="h-4 w-4" />
                </button>
            </div>
        </div>
    );
};
