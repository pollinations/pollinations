import {
    Alert,
    Button,
    LoadingStatus,
    RefreshIcon,
    Section,
} from "@pollinations/ui";
import { type ReactNode, useContext, useState } from "react";
import { createPortal } from "react-dom";
import { PageStatusSlot } from "./dashboard-shell.tsx";

/** The page's single loading status, shown above its cards. */
export function PageStatus() {
    const slot = useContext(PageStatusSlot);
    return (
        slot &&
        createPortal(
            // Same surface as the mobile menu button it faces.
            <div className="flex h-10 items-center rounded-full bg-surface-menu/80 px-4 backdrop-blur-md lg:h-8 lg:px-3">
                <LoadingStatus>Loading…</LoadingStatus>
            </div>,
            slot,
        )
    );
}

/** Keep section headings and controls outside the content that waits for data. */
export function SectionContent({
    loading,
    pageStatus = false,
    children,
}: {
    loading: boolean;
    pageStatus?: boolean;
    children?: ReactNode;
}) {
    if (!loading) return children;
    return pageStatus ? <PageStatus /> : null;
}

/** Every card title of a page that is still loading, with the page status. */
export function PageLoading({ titles }: { titles: readonly string[] }) {
    return (
        <>
            <PageStatus />
            {titles.map((title) => (
                <Section key={title} title={title}>
                    {null}
                </Section>
            ))}
        </>
    );
}

export function LoadError({
    children,
    onRetry,
}: {
    children: string;
    onRetry?: () => unknown;
}) {
    const [retrying, setRetrying] = useState(false);

    async function retry() {
        if (!onRetry || retrying) return;
        setRetrying(true);
        try {
            await onRetry();
        } catch {
            // Keep the existing error visible if the retry also fails.
        } finally {
            setRetrying(false);
        }
    }

    return (
        <Alert intent="danger">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <span>{children}</span>
                {onRetry && (
                    <Button
                        intent="neutral"
                        icon={<RefreshIcon />}
                        onClick={retry}
                        disabled={retrying}
                    >
                        {retrying ? "Retrying…" : "Try again"}
                    </Button>
                )}
            </div>
        </Alert>
    );
}
