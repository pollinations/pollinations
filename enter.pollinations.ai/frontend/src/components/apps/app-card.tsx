import {
    CheckIcon,
    ClipboardIcon,
    CopyButton,
    ExternalLinkIcon,
    GlobeIcon,
    IconButton,
    Surface,
    XIcon,
} from "@pollinations/ui";
import type { ReactNode } from "react";
import type { UserApp } from "./types.ts";

type AppCardProps = {
    app: UserApp;
    onDelete: () => void;
};

function formatDate(value: string): string {
    // The API returns ISO timestamps; show the date only.
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? value
        : date.toISOString().slice(0, 10);
}

export function AppCard({ app, onDelete }: AppCardProps) {
    return (
        <Surface className="transition-colors hover:bg-surface-opaque/90">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <h3 className="min-w-0 truncate text-base font-semibold text-theme-text-strong">
                            {app.slug}
                        </h3>
                    </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                    <IconButton
                        intent="danger"
                        title="Delete app"
                        tooltip="Delete app"
                        tooltipAlign="center"
                        onClick={onDelete}
                    >
                        <XIcon className="h-4 w-4" />
                    </IconButton>
                </div>
            </div>

            <div className="mt-4 grid gap-2">
                <AppDetailRow
                    icon={<GlobeIcon className="h-3.5 w-3.5" />}
                    label="URL"
                    value={
                        <a
                            href={app.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex min-w-0 items-center gap-1 truncate font-mono text-theme-text-strong underline hover:text-theme-text-muted"
                        >
                            <span className="min-w-0 truncate">{app.url}</span>
                            <ExternalLinkIcon className="h-3.5 w-3.5 shrink-0" />
                        </a>
                    }
                    copyValue={app.url}
                    copyLabel="Copy URL"
                />
                <AppDetailRow
                    icon={<ClipboardIcon className="h-3.5 w-3.5" />}
                    label="App ID"
                    value={app.id}
                    copyValue={app.id}
                    copyLabel="Copy app id"
                />
                <AppDetailRow
                    icon={<ClipboardIcon className="h-3.5 w-3.5" />}
                    label="Deployed"
                    value={formatDate(app.createdAt)}
                />
            </div>
        </Surface>
    );
}

type AppDetailRowProps = {
    icon: ReactNode;
    label: string;
    value: ReactNode;
    copyValue?: string;
    copyLabel?: string;
};

function AppDetailRow({
    icon,
    label,
    value,
    copyValue,
    copyLabel,
}: AppDetailRowProps) {
    return (
        <div className="grid min-w-0 gap-1 text-xs text-theme-text-muted sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:items-center">
            <span className="inline-flex items-center gap-1.5 font-medium text-theme-text-muted">
                <span className="text-theme-text-muted">{icon}</span>
                {label}
            </span>
            <span className="flex min-w-0 items-center gap-1.5">
                {typeof value === "string" ? (
                    <span className="min-w-0 truncate font-mono text-theme-text-strong">
                        {value}
                    </span>
                ) : (
                    value
                )}
                {copyLabel && copyValue && (
                    <CopyButton
                        value={copyValue}
                        tooltip={copyLabel}
                        copiedTooltip="Copied"
                        className="inline-flex shrink-0 items-center justify-center rounded-md p-1 text-theme-text-muted transition-colors hover:bg-theme-bg-active hover:text-theme-text-strong"
                    >
                        {(copied: boolean) =>
                            copied ? (
                                <CheckIcon className="h-3.5 w-3.5" />
                            ) : (
                                <ClipboardIcon className="h-3.5 w-3.5" />
                            )
                        }
                    </CopyButton>
                )}
            </span>
        </div>
    );
}
