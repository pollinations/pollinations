import { Alert, IconButton, XIcon } from "@pollinations/ui";
import { type FC, useEffect, useState } from "react";

interface StatusNotice {
    message: string;
    link?: string;
    linkLabel?: string;
}

export const StatusNoticeBanner: FC<{ className?: string }> = ({
    className,
}) => {
    const [notice, setNotice] = useState<StatusNotice | null>(null);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        const controller = new AbortController();

        fetch("/api/status-notice", { signal: controller.signal })
            .then(async (response) => {
                if (!response.ok) return;
                const data = (await response.json()) as {
                    notice: StatusNotice | null;
                };
                setNotice(data.notice);
            })
            .catch(() => {});

        return () => controller.abort();
    }, []);

    if (!notice || dismissed) return null;

    return (
        <Alert intent="warning" className={className}>
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
                <IconButton
                    title="Dismiss status notice"
                    onClick={() => setDismissed(true)}
                    className="shrink-0"
                >
                    <XIcon className="h-4 w-4" />
                </IconButton>
            </div>
        </Alert>
    );
};
