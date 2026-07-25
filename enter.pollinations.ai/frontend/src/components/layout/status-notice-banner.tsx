import { Alert, cn, XIcon } from "@pollinations/ui";
import { type FC, useEffect, useState } from "react";
import type { StatusNotice } from "../../backend-types.ts";
import { config } from "../../config.ts";
import {
    dismissedNoticeUpdatedAt,
    dismissStatusNotice,
    shouldShowStatusNotice,
} from "./status-notice-state.ts";

const severityToIntent = {
    info: "info",
    warning: "warning",
    critical: "danger",
} as const satisfies Record<
    StatusNotice["severity"],
    "info" | "warning" | "danger"
>;

export const StatusNoticeBanner: FC<{ className?: string }> = ({
    className,
}) => {
    const [notice, setNotice] = useState<StatusNotice | null>(null);
    const [dismissedUpdatedAt, setDismissedUpdatedAt] = useState<string | null>(
        null,
    );

    useEffect(() => {
        const controller = new AbortController();
        setDismissedUpdatedAt(dismissedNoticeUpdatedAt(localStorage));

        fetch(`${config.apiBaseUrl}/status-notice`, {
            headers: { Accept: "application/json" },
            signal: controller.signal,
        })
            .then(async (response) => {
                if (!response.ok) return;
                const data = (await response.json()) as {
                    notice: StatusNotice | null;
                };
                setNotice(data.notice);
            })
            .catch(() => undefined);

        return () => controller.abort();
    }, []);

    if (!shouldShowStatusNotice(notice, dismissedUpdatedAt)) return null;

    const intent = notice ? severityToIntent[notice.severity] : "warning";

    return (
        <Alert
            intent={intent}
            aria-live="polite"
            className={cn("relative pr-11", className)}
        >
            <p className="break-words">{notice.message}</p>
            {notice.linkUrl && (
                <a
                    href={notice.linkUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-block font-medium underline underline-offset-2 hover:no-underline"
                >
                    {notice.linkLabel ?? "Learn more"}
                </a>
            )}
            <button
                type="button"
                aria-label="Dismiss status notice"
                className="absolute top-2 right-2 rounded-full p-1 text-current opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-2 focus-visible:outline-current focus-visible:outline-offset-2"
                onClick={() => {
                    dismissStatusNotice(localStorage, notice);
                    setDismissedUpdatedAt(notice.updatedAt);
                }}
            >
                <XIcon className="h-4 w-4" aria-hidden="true" />
            </button>
        </Alert>
    );
};
