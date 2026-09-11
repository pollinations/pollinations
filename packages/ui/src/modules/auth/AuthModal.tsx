import type { CSSProperties, ReactNode } from "react";
import wordmarkUrl from "../../brand/lockup-horizontal.svg";
import logoUrl from "../../brand/mark.svg";
import { cn } from "../../lib/cn.ts";
import { Dialog } from "../../primitives/Dialog.tsx";
import { IconButton } from "../../primitives/IconButton.tsx";
import { InlineLink } from "../../primitives/InlineLink.tsx";
import { ScrollArea } from "../../primitives/ScrollArea.tsx";
import { Surface } from "../../primitives/Surface.tsx";
import { Heading } from "../../primitives/Typography.tsx";

const authLogoMaskUrl = `url('${logoUrl}')`;

const authLogoMask: CSSProperties = {
    WebkitMaskImage: authLogoMaskUrl,
    WebkitMaskPosition: "center",
    WebkitMaskRepeat: "no-repeat",
    WebkitMaskSize: "contain",
    maskImage: authLogoMaskUrl,
    maskPosition: "center",
    maskRepeat: "no-repeat",
    maskSize: "contain",
};

export type AuthModalProps = {
    children: ReactNode;
    contentClassName?: string;
    dialog?: {
        label?: string;
        labelledBy?: string;
    };
};

export function AuthModal({
    children,
    contentClassName,
    dialog,
}: AuthModalProps) {
    return (
        <Dialog
            open
            showBackdrop={false}
            ariaLabel={dialog?.label}
            labelledBy={dialog?.labelledBy}
            positionerClassName="polli:items-start polli:overflow-y-auto polli:bg-app-bg polli:p-0 polli:sm:p-4"
            contentClassName={cn(
                "polli:bg-surface-white polli:border-0 polli:rounded-none polli:shadow-none polli:max-w-xl polli:w-full polli:my-0 polli:min-h-dvh polli:max-h-dvh polli:sm:rounded-2xl polli:sm:shadow-container polli:sm:my-auto polli:sm:min-h-0 polli:sm:max-h-[calc(100dvh-2rem)]",
                contentClassName,
            )}
        >
            {children}
        </Dialog>
    );
}

export type AuthModalHeaderProps = {
    children?: ReactNode;
    logoOnly?: boolean;
};

/** Shared consent/sign-in chrome; content scrolls behind the anchored controls. */
export function AuthFlowLayout({
    children,
    account,
    actions,
    secondaryAction,
    actionLayout = "stacked",
    dialog,
}: {
    children: ReactNode;
    account?: ReactNode;
    actions: ReactNode;
    secondaryAction?: ReactNode;
    actionLayout?: "stacked" | "inline";
    dialog?: AuthModalProps["dialog"];
}) {
    return (
        <AuthModal
            dialog={dialog}
            contentClassName="polli:flex polli:h-dvh polli:flex-col polli:sm:h-[calc(100dvh-2rem)]"
        >
            <ScrollArea className="polli:min-h-0 polli:flex-1 polli:overscroll-contain polli:scroll-pt-28 polli:scroll-pb-48 polli:sm:rounded-2xl">
                <div className="polli:flex polli:min-h-dvh polli:flex-col polli:sm:min-h-[calc(100dvh-2rem)]">
                    <div className="polli:sticky polli:top-0 polli:z-10 polli:shrink-0 polli:bg-surface-white/80 polli:pb-3 polli:backdrop-blur-md">
                        <AuthModalHeader logoOnly>{account}</AuthModalHeader>
                    </div>
                    <div className="polli:flex-1 polli:space-y-3 polli:px-6 polli:py-2">
                        {children}
                    </div>
                    <AuthActionFooter
                        actions={actions}
                        secondaryAction={secondaryAction}
                        actionLayout={actionLayout}
                    />
                </div>
            </ScrollArea>
        </AuthModal>
    );
}

/** Stable provider-action, optional return-action, and terms slots. */
export function AuthActionFooter({
    actions,
    secondaryAction,
    actionLayout = "stacked",
    className,
}: {
    actions: ReactNode;
    secondaryAction?: ReactNode;
    actionLayout?: "stacked" | "inline";
    className?: string;
}) {
    const primarySlot = (
        <div
            data-auth-slot="primary"
            className="polli:flex polli:min-h-12 polli:w-full polli:items-center polli:justify-center polli:[&>button]:h-12 polli:[&>button]:w-full polli:[&>a]:h-12 polli:[&>a]:w-full"
        >
            {actions}
        </div>
    );
    const secondarySlot = (
        <div
            data-auth-slot="secondary"
            className="polli:flex polli:min-h-9 polli:items-center polli:justify-center polli:[&>button]:h-9 polli:[&>a]:h-9"
        >
            {secondaryAction}
        </div>
    );
    return (
        <div
            className={cn(
                "polli:sticky polli:bottom-0 polli:z-10 polli:flex polli:shrink-0 polli:flex-col polli:items-center polli:gap-3 polli:bg-surface-white/80 polli:p-6 polli:pt-4 polli:backdrop-blur-md",
                className,
            )}
        >
            <div
                className={cn(
                    "polli:w-full polli:gap-3",
                    actionLayout === "inline"
                        ? "polli:grid polli:grid-cols-2"
                        : "polli:flex polli:flex-col polli:items-center",
                )}
            >
                {actionLayout === "inline" ? (
                    <>
                        {secondarySlot}
                        {primarySlot}
                    </>
                ) : (
                    <>
                        {primarySlot}
                        {secondarySlot}
                    </>
                )}
            </div>
            <InlineLink
                href="https://pollinations.ai/terms"
                external
                className="polli:text-xs"
            >
                Terms &amp; Conditions
            </InlineLink>
        </div>
    );
}

export function AuthModalHeader({
    children,
    logoOnly = false,
}: AuthModalHeaderProps) {
    return (
        <div className="polli:@container/auth-header polli:px-6 polli:pt-6 polli:pb-2">
            <div className="polli:flex polli:min-h-13 polli:flex-wrap polli:items-center polli:justify-between polli:gap-3">
                <a
                    href="https://pollinations.ai"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="polli:inline-flex polli:shrink-0 polli:items-center polli:text-theme-text-strong"
                    aria-label="pollinations.ai"
                >
                    <span className="polli:sr-only">Pollinations</span>
                    <span
                        aria-hidden="true"
                        className={cn(
                            "polli:block polli:h-8 polli:w-8 polli:bg-current",
                            !logoOnly &&
                                (children
                                    ? "polli:@min-[400px]/auth-header:hidden"
                                    : "polli:@min-[240px]/auth-header:hidden"),
                        )}
                        style={authLogoMask}
                    />
                    {!logoOnly && (
                        <span
                            aria-hidden="true"
                            className={cn(
                                "polli:hidden polli:h-7 polli:w-[220px] polli:bg-current",
                                children
                                    ? "polli:@min-[400px]/auth-header:block"
                                    : "polli:@min-[240px]/auth-header:block",
                            )}
                            style={{
                                ...authLogoMask,
                                WebkitMaskImage: `url('${wordmarkUrl}')`,
                                maskImage: `url('${wordmarkUrl}')`,
                            }}
                        />
                    )}
                </a>
                {children}
            </div>
        </div>
    );
}

export function AuthModalLoading({
    title,
    message = "Checking whether you’re signed in…",
}: {
    title: string;
    message?: string;
}) {
    return (
        <AuthFlowLayout dialog={{ label: title }} actions={null}>
            <Heading as="h1" size="section" className="polli:pt-3">
                {title}
            </Heading>
            <output className="polli:flex polli:items-center polli:gap-2 polli:text-sm polli:text-theme-text-muted">
                <span
                    aria-hidden="true"
                    className="polli:h-2 polli:w-2 polli:shrink-0 polli:rounded-full polli:bg-current polli:animate-pulse polli:motion-reduce:animate-none"
                />
                {message}
            </output>
        </AuthFlowLayout>
    );
}

export function ErrorBanner({ children }: { children: ReactNode }) {
    return (
        <div
            role="alert"
            className="polli:rounded-lg polli:bg-intent-danger-bg-light polli:p-4"
        >
            <p className="polli:text-sm polli:text-intent-danger-text">
                {children}
            </p>
        </div>
    );
}

export type AuthInfoCardProps = {
    title?: string | null;
    titleId?: string;
    children: ReactNode;
};

export function AuthInfoCard({
    title = "Authorize",
    titleId,
    children,
}: AuthInfoCardProps) {
    return (
        <Surface variant="card-themed">
            {title != null && (
                <p
                    id={titleId}
                    className="polli:mb-2 polli:font-body polli:text-xs polli:font-semibold polli:tracking-wide polli:text-theme-text-soft"
                >
                    {title}
                </p>
            )}
            {children}
        </Surface>
    );
}

export function AuthAccessSummary({
    title,
    children,
    note,
}: {
    title: ReactNode;
    children: ReactNode;
    note?: ReactNode;
}) {
    return (
        <section className="polli:pt-2 polli:pb-3">
            <h2 className="polli:mb-2 polli:font-body polli:text-xs polli:font-semibold polli:tracking-wide polli:text-theme-text-soft">
                {title}
            </h2>
            <Surface variant="card-themed">
                <ul className="polli:space-y-3 polli:text-sm polli:text-theme-text-base">
                    {children}
                </ul>
            </Surface>
            {note != null && (
                <p className="polli:mt-3 polli:text-xs polli:text-theme-text-soft">
                    {note}
                </p>
            )}
        </section>
    );
}

/** A consent row with an optional icon toggle and expandable details. */
export function AuthAccessItem({
    icon,
    children,
    control,
    details,
    checked = false,
    onChange,
    ariaLabel,
    disabled = false,
}: {
    icon: ReactNode;
    children: ReactNode;
    control?: ReactNode;
    details?: ReactNode;
    checked?: boolean;
    onChange?: (checked: boolean) => void;
    ariaLabel?: string;
    disabled?: boolean;
}) {
    return (
        <li>
            <div
                className={cn(
                    "polli:flex polli:items-center polli:gap-2",
                    !onChange && "polli:cursor-not-allowed",
                )}
            >
                {onChange ? (
                    <IconButton
                        title={ariaLabel}
                        tooltip={false}
                        pressed={checked}
                        disabled={disabled}
                        onClick={() => onChange(!checked)}
                        variant={checked ? "tile" : "ghost"}
                        size="md"
                        className={cn(
                            "polli:shrink-0",
                            checked &&
                                !disabled &&
                                "polli:text-theme-bg-pale polli:hover:text-theme-bg-pale",
                        )}
                    >
                        <span aria-hidden="true">{icon}</span>
                    </IconButton>
                ) : (
                    <span
                        aria-hidden="true"
                        className={cn(
                            "polli:flex polli:h-9 polli:w-9 polli:shrink-0 polli:items-center polli:justify-center polli:rounded-full polli:text-theme-text-soft",
                            checked && "polli:bg-theme-bg-active",
                            checked && !disabled && "polli:text-theme-bg-pale",
                        )}
                    >
                        {icon}
                    </span>
                )}
                <span
                    className={cn(
                        "polli:min-w-0 polli:flex-1 polli:transition-opacity",
                        !!onChange && !checked && "polli:opacity-60",
                    )}
                >
                    {children}
                </span>
                {control != null && (
                    <span className="polli:shrink-0">{control}</span>
                )}
            </div>
            {details && <div className="polli:pt-3">{details}</div>}
        </li>
    );
}
