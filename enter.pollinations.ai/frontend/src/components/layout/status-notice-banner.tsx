import { cn, XIcon } from "@pollinations/ui";
import { type FC, useEffect, useState } from "react";

interface StatusNotice {
    message: string;
    link?: string;
    linkLabel?: string;
    createdAt: string;
}

const DISMISSED_KEY = "polli_status_dismissed";

export const StatusNoticeBanner: FC<{ className?: string }> = ({
    className,
}) => {
    const [notice, setNotice] = useState<StatusNotice | null>(null);
    const [dismissed, setDismissed] = useState(true);

    useEffect(() => {
        fetch("/api/status-notice")
            .then((r) => r.json() as Promise<{ notice: StatusNotice | null }>)
            .then((d) => {
                setNotice(d.notice);
                if (d.notice) {
                    try {
                        const prev = JSON.parse(
                            localStorage.getItem(DISMISSED_KEY) || "{}",
                        );
                        setDismissed(prev.id === d.notice.createdAt);
                    } catch {
                        setDismissed(false);
                    }
                }
            })
            .catch(() => {});
    }, []);

    const dismiss = () => {
        setDismissed(true);
        if (notice) {
            try {
                localStorage.setItem(
                    DISMISSED_KEY,
                    JSON.stringify({ id: notice.createdAt }),
                );
            } catch {}
        }
    };

    if (!notice || dismissed) return null;

    return (
        <div
            role="alert"
            className={cn(
                "flex items-start gap-3 rounded-lg border border-warning-border bg-warning-bg-light px-4 py-3 text-sm text-warning-text",
                className,
            )}
        >
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
                onClick={dismiss}
                className="shrink-0 rounded p-1 opacity-60 hover:opacity-100"
                aria-label="Dismiss"
            >
                <XIcon className="h-4 w-4" />
            </button>
        </div>
    );
};
