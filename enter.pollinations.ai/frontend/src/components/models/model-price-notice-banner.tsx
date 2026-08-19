import { Alert, IconButton, TrendUpIcon, XIcon } from "@pollinations/ui";
import { type FC, useEffect, useState } from "react";

// Phase 1 of the notifications system (see the notifications proposal):
// a targeted banner on the models page for `price_change` notices, backed
// by the reusable user-scoped `notification` table and
// GET /api/notifications. A full bell-icon inbox (Phase 2) can reuse the
// same endpoints — list with any `type`/`unread` filter, unread-count,
// mark-read, mark-all-read — without a backend change.

interface Notification {
    id: string;
    type: string;
    title: string;
    body: string;
    link: string | null;
    readAt: string | null;
    createdAt: string;
}

interface ListResponse {
    notifications: Notification[];
}

const MAX_VISIBLE = 3;

/** Shows unread price-change notices for the signed-in user (e.g. "flux's
 * price changes tomorrow"). Renders nothing for signed-out visitors or once
 * there's nothing unread. Dismissing a notice marks it read, so it won't
 * reappear on the next visit. */
export const ModelPriceNoticeBanner: FC<{ className?: string }> = ({
    className,
}) => {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        const controller = new AbortController();

        fetch("/api/notifications?type=price_change&unread=true&limit=5", {
            credentials: "include",
            signal: controller.signal,
        })
            .then(async (response) => {
                if (!response.ok) return;
                const data = (await response.json()) as ListResponse;
                setNotifications(data.notifications);
            })
            .catch(() => {});

        return () => controller.abort();
    }, []);

    const visible = notifications.filter((n) => !dismissedIds.has(n.id));
    if (visible.length === 0) return null;

    const dismiss = (id: string) => {
        // Optimistic: hide immediately, mark read in the background. Even if
        // the request fails, the next unread-only fetch will just show it
        // again, which is the safe direction to fail in.
        setDismissedIds((previous) => new Set(previous).add(id));
        fetch(`/api/notifications/${id}/read`, {
            method: "POST",
            credentials: "include",
        }).catch(() => {});
    };

    return (
        <div className={className}>
            {visible.slice(0, MAX_VISIBLE).map((notification) => (
                <Alert
                    key={notification.id}
                    intent="info"
                    className="mb-3 flex items-start gap-3"
                >
                    <TrendUpIcon className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="flex-1">
                        <p className="font-semibold">{notification.title}</p>
                        <p className="mt-0.5 text-theme-text-soft">
                            {notification.body}
                        </p>
                        {notification.link && (
                            <a
                                href={notification.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-1 inline-block text-xs font-medium underline hover:no-underline"
                            >
                                Learn more
                            </a>
                        )}
                    </div>
                    <IconButton
                        title="Dismiss"
                        onClick={() => dismiss(notification.id)}
                        className="shrink-0"
                    >
                        <XIcon className="h-4 w-4" />
                    </IconButton>
                </Alert>
            ))}
        </div>
    );
};
