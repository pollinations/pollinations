import { Menu } from "@ark-ui/react/menu";
import type {
    CSSProperties,
    FC,
    PropsWithChildren,
    ReactNode,
    RefObject,
} from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "../../lib/cn.ts";
import { useScrollLock } from "../../lib/use-scroll-lock.ts";
import { ChevronIcon } from "../../primitives/ChevronIcon.tsx";
import {
    ExternalLinkIcon,
    MenuIcon,
    XIcon,
} from "../../primitives/icons/index.tsx";
import { ScrollArea } from "../../primitives/ScrollArea.tsx";
import type { ThemeName } from "../../theme.ts";

export type AppShellNavItem<T extends string = string> = {
    id: T;
    label: string;
    theme?: ThemeName;
};

export type AppShellBrand = {
    href: string;
    label: string;
    imageSrc: string;
    imageAlt?: string;
};

export type AppShellBrandLink = {
    href: string;
    label: string;
    icon: ReactNode;
    text: string;
    count?: string;
};

export type AppShellSupportAction = {
    label: string;
    title?: string;
    icon: ReactNode;
    idleIcon?: ReactNode;
    successIcon?: ReactNode;
    active?: boolean;
    onClick: () => void | Promise<void>;
};

export type AppShellSupportLink = {
    label: string;
    href: string;
    icon?: ReactNode;
};

export type AppShellFooterLink = {
    label: string;
    href: string;
};

export type AppShellProps<T extends string = string> = PropsWithChildren<{
    activeItem: T;
    navItems: readonly AppShellNavItem<T>[];
    onItemChange: (item: T) => void;
    brand: AppShellBrand;
    brandLinks?: readonly AppShellBrandLink[];
    supportAction?: AppShellSupportAction;
    supportLinks?: readonly AppShellSupportLink[];
    footerLinks?: readonly AppShellFooterLink[];
    footerNote?: ReactNode;
    accountArea?: ReactNode;
    walletArea?: ReactNode;
    getScrollTargetId?: (activeItem: T) => string | null | undefined;
}>;

export const AppShell = <T extends string>({
    activeItem,
    navItems,
    onItemChange,
    brand,
    brandLinks = [],
    supportAction,
    supportLinks = [],
    footerLinks = [],
    footerNote,
    accountArea,
    walletArea,
    getScrollTargetId,
    children,
}: AppShellProps<T>) => {
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const drawerRef = useRef<HTMLDivElement>(null);
    const menuButtonRef = useRef<HTMLButtonElement>(null);
    const mainScrollRef = useRef<HTMLDivElement>(null);

    useAppShellBodyClass();
    useScrollLock(isDrawerOpen);

    const activeTheme =
        navItems.find((item) => item.id === activeItem)?.theme ?? "green";

    const closeDrawer = useCallback(() => {
        const activeElement = document.activeElement;
        if (
            activeElement instanceof HTMLElement &&
            drawerRef.current?.contains(activeElement)
        ) {
            menuButtonRef.current?.focus({ preventScroll: true });
        }

        setIsDrawerOpen(false);
    }, []);

    useEffect(() => {
        if (!isDrawerOpen) return;

        function handleKeyDown(event: KeyboardEvent): void {
            if (event.key === "Escape") closeDrawer();
        }

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [closeDrawer, isDrawerOpen]);

    useEffect(() => {
        const scrollElement = mainScrollRef.current;
        if (!scrollElement) return;

        const targetId = getScrollTargetId?.(activeItem);
        if (targetId) {
            const target = scrollElement.querySelector(`#${targetId}`);
            if (target instanceof HTMLElement) {
                const scrollRect = scrollElement.getBoundingClientRect();
                const targetRect = target.getBoundingClientRect();
                const targetTop =
                    targetRect.top - scrollRect.top + scrollElement.scrollTop;

                scrollElement.scrollTo({
                    top: Math.max(0, targetTop - 24),
                    behavior: "auto",
                });
                return;
            }
        }

        scrollElement.scrollTo({ top: 0, behavior: "auto" });
    }, [activeItem, getScrollTargetId]);

    function handleItemChange(item: T): void {
        onItemChange(item);
        closeDrawer();
    }

    const rail = (
        <AppShellRail
            activeItem={activeItem}
            navItems={navItems}
            brand={brand}
            brandLinks={brandLinks}
            supportAction={supportAction}
            supportLinks={supportLinks}
            footerLinks={footerLinks}
            footerNote={footerNote}
            accountArea={accountArea}
            walletArea={walletArea}
            onItemChange={handleItemChange}
        />
    );

    return (
        <div className="polli:flex polli:h-dvh polli:overflow-hidden polli:bg-emerald-100 polli:text-green-950">
            <div className="polli:hidden polli:md:block">{rail}</div>
            <div
                ref={drawerRef}
                className={cn(
                    "polli:fixed polli:inset-0 polli:z-40 polli:transition-[visibility] polli:md:hidden",
                    isDrawerOpen
                        ? "polli:pointer-events-auto polli:visible polli:delay-0"
                        : "polli:pointer-events-none polli:invisible polli:delay-[420ms]",
                )}
                aria-hidden={!isDrawerOpen}
                inert={!isDrawerOpen}
            >
                <button
                    type="button"
                    className={cn(
                        "polli:absolute polli:inset-0 polli:bg-green-950/25 polli:transition-opacity polli:ease-out",
                        "polli:duration-[420ms]",
                        isDrawerOpen ? "polli:opacity-100" : "polli:opacity-0",
                    )}
                    onClick={closeDrawer}
                    aria-label="Close navigation"
                />
                <div
                    className={cn(
                        "polli:absolute polli:inset-y-0 polli:left-0 polli:flex polli:w-[min(20rem,86vw)] polli:transform-gpu polli:flex-col polli:overflow-hidden polli:border-r polli:border-green-950/10 polli:bg-emerald-100 polli:shadow-xl polli:transition-transform polli:ease-[cubic-bezier(0.22,1,0.36,1)] polli:will-change-transform",
                        "polli:duration-[420ms]",
                        isDrawerOpen
                            ? "polli:translate-x-0"
                            : "polli:-translate-x-full",
                    )}
                >
                    <div className="polli:flex polli:shrink-0 polli:flex-col polli:gap-2 polli:border-b polli:border-green-950/10 polli:px-4 polli:py-3">
                        <div className="polli:flex polli:items-center polli:justify-between polli:gap-2">
                            <BrandMark brand={brand} size="mobile" />
                            <button
                                type="button"
                                className="polli:flex polli:h-9 polli:w-9 polli:items-center polli:justify-center polli:rounded-full polli:bg-white/70 polli:text-green-950 polli:hover:bg-white"
                                onClick={closeDrawer}
                                aria-label="Close navigation"
                            >
                                <XIcon className="polli:h-5 polli:w-5" />
                            </button>
                        </div>
                        <BrandLinks links={brandLinks} />
                    </div>
                    <div className="polli:flex polli:min-h-0 polli:flex-1 polli:flex-col polli:overflow-hidden">
                        {rail}
                    </div>
                </div>
            </div>
            <div
                className="polli:flex polli:min-w-0 polli:flex-1 polli:flex-col polli:md:ml-60"
                data-theme={activeTheme}
            >
                <MobileHeader
                    buttonRef={menuButtonRef}
                    brand={brand}
                    onOpen={() => setIsDrawerOpen(true)}
                />
                <ScrollArea
                    ref={mainScrollRef}
                    className="polli:min-h-0 polli:min-w-0 polli:flex-1 polli:overscroll-contain polli:px-4 polli:pt-6 polli:pb-8 polli:md:px-6 polli:md:pt-10"
                >
                    <main className="polli:mx-auto polli:flex polli:max-w-[800px] polli:flex-col polli:gap-6">
                        {children}
                    </main>
                </ScrollArea>
            </div>
        </div>
    );
};

function useAppShellBodyClass(): void {
    useEffect(() => {
        document.documentElement.classList.add("polli-ui-shell");
        document.body.classList.add("polli-ui-shell");
        return () => {
            document.documentElement.classList.remove("polli-ui-shell");
            document.body.classList.remove("polli-ui-shell");
        };
    }, []);
}

type AppShellRailProps<T extends string> = {
    activeItem: T;
    navItems: readonly AppShellNavItem<T>[];
    brand: AppShellBrand;
    brandLinks: readonly AppShellBrandLink[];
    supportAction?: AppShellSupportAction;
    supportLinks: readonly AppShellSupportLink[];
    footerLinks: readonly AppShellFooterLink[];
    footerNote?: ReactNode;
    accountArea?: ReactNode;
    walletArea?: ReactNode;
    onItemChange: (item: T) => void;
};

const AppShellRail = <T extends string>({
    activeItem,
    navItems,
    brand,
    brandLinks,
    supportAction,
    supportLinks,
    footerLinks,
    footerNote,
    accountArea,
    walletArea,
    onItemChange,
}: AppShellRailProps<T>) => (
    <aside
        className="polli:flex polli:min-h-0 polli:flex-1 polli:flex-col polli:px-2 polli:py-4 polli:md:fixed polli:md:inset-y-0 polli:md:left-0 polli:md:z-30 polli:md:w-60 polli:md:border-r polli:md:border-green-950/10"
        aria-label="Dashboard navigation"
    >
        <div className="polli:hidden polli:shrink-0 polli:flex-col polli:gap-2 polli:border-b polli:border-green-950/10 polli:pb-4 polli:pl-1 polli:md:flex">
            <BrandMark brand={brand} size="desktop" />
            <BrandLinks links={brandLinks} />
        </div>
        <ScrollArea
            className="polli:-mr-2 polli:min-h-0 polli:flex-1 polli:pt-3"
            style={
                {
                    "--polli-color-scrollbar-thumb":
                        "color-mix(in oklab, var(--polli-color-text-muted) 65%, transparent)",
                } as CSSProperties
            }
        >
            <nav className="polli:flex polli:flex-col polli:gap-1 polli:pr-2">
                {navItems.map((item) => (
                    <AppShellNavButton
                        key={item.id}
                        item={item}
                        active={activeItem === item.id}
                        onClick={() => onItemChange(item.id)}
                    />
                ))}
                {(supportAction || supportLinks.length > 0) && (
                    <AppShellSupport
                        action={supportAction}
                        links={supportLinks}
                    />
                )}
            </nav>
        </ScrollArea>
        <div className="polli:flex polli:shrink-0 polli:flex-col polli:gap-2 polli:border-t polli:border-green-950/10 polli:pt-4">
            {walletArea && <div className="polli:px-1">{walletArea}</div>}
            {accountArea}
            <AppShellFooter links={footerLinks} note={footerNote} />
        </div>
    </aside>
);

type AppShellNavButtonProps<T extends string> = {
    item: AppShellNavItem<T>;
    active: boolean;
    onClick: () => void;
};

const AppShellNavButton = <T extends string>({
    item,
    active,
    onClick,
}: AppShellNavButtonProps<T>) => (
    <button
        type="button"
        data-theme={item.theme}
        className={cn(
            "polli:flex polli:items-center polli:gap-2 polli:rounded-full polli:px-3 polli:py-2 polli:text-left polli:text-sm polli:font-medium polli:transition-colors",
            active
                ? "polli:bg-theme-bg-active polli:text-theme-text-strong"
                : "polli:text-gray-800 polli:hover:bg-white/60 polli:hover:text-gray-950",
        )}
        onClick={onClick}
        aria-current={active ? "page" : undefined}
    >
        <span
            className="polli:h-2.5 polli:w-2.5 polli:shrink-0 polli:rounded-full polli:bg-theme-bg-hover polli:shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]"
            aria-hidden="true"
        />
        {item.label}
    </button>
);

const MobileHeader: FC<{
    buttonRef: RefObject<HTMLButtonElement | null>;
    brand: AppShellBrand;
    onOpen: () => void;
}> = ({ buttonRef, brand, onOpen }) => (
    <header className="polli:sticky polli:top-0 polli:z-30 polli:flex polli:items-center polli:justify-between polli:border-b polli:border-green-950/10 polli:bg-emerald-100 polli:px-4 polli:py-3 polli:md:hidden">
        <button
            ref={buttonRef}
            type="button"
            className="polli:flex polli:h-9 polli:w-9 polli:items-center polli:justify-center polli:rounded-full polli:bg-white/70 polli:text-green-950 polli:hover:bg-white"
            onClick={onOpen}
            aria-label="Open navigation"
        >
            <MenuIcon className="polli:h-5 polli:w-5" />
        </button>
        <BrandMark brand={brand} size="mobile" />
        <span className="polli:h-9 polli:w-9" aria-hidden="true" />
    </header>
);

const BrandMark: FC<{
    brand: AppShellBrand;
    size: "desktop" | "mobile";
}> = ({ brand, size }) => (
    <a
        href={brand.href}
        target="_blank"
        rel="noopener noreferrer"
        className="polli:inline-flex polli:items-center"
        aria-label={brand.label}
    >
        <img
            src={brand.imageSrc}
            alt={brand.imageAlt ?? brand.label}
            className={cn(
                "polli:w-auto",
                size === "desktop"
                    ? "polli:h-6"
                    : "polli:h-6 polli:min-[390px]:h-7 polli:sm:h-8",
            )}
        />
    </a>
);

const BrandLinks: FC<{ links: readonly AppShellBrandLink[] }> = ({ links }) => {
    if (links.length === 0) return null;
    return (
        <div className="polli:flex polli:items-center polli:gap-1.5">
            {links.map((link) => (
                <BrandLink key={link.href} {...link} />
            ))}
        </div>
    );
};

const BrandLink: FC<AppShellBrandLink> = ({
    href,
    label,
    icon,
    text,
    count,
}) => (
    <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={label}
        className="polli:inline-flex polli:items-center polli:gap-1.5 polli:rounded-full polli:border polli:border-transparent polli:bg-white/55 polli:py-[3px] polli:pr-[10px] polli:pl-[7px] polli:text-micro polli:font-medium polli:leading-none polli:text-green-950/80 polli:transition-colors polli:hover:border-green-950/15 polli:hover:bg-white polli:hover:text-green-950"
    >
        <span className="polli:h-[11px] polli:w-[11px]">{icon}</span>
        <span className="polli:-translate-y-px">{text}</span>
        {count && (
            <span className="polli:ml-0.5 polli:border-l polli:border-green-950/15 polli:pl-1.5 polli:font-mono polli:text-micro polli:text-green-950/55">
                {count}
            </span>
        )}
    </a>
);

const AppShellSupport: FC<{
    action?: AppShellSupportAction;
    links: readonly AppShellSupportLink[];
}> = ({ action, links }) => (
    <div className="polli:mt-2 polli:border-t polli:border-green-950/10 polli:pt-3">
        {action && (
            <button
                type="button"
                onClick={action.onClick}
                title={action.title}
                className="polli:group polli:flex polli:w-full polli:items-center polli:justify-between polli:gap-2 polli:rounded-full polli:px-3 polli:py-2 polli:text-left polli:text-sm polli:font-medium polli:text-gray-900 polli:transition-colors polli:hover:bg-white/60 polli:hover:text-gray-950"
            >
                <span className="polli:flex polli:items-center polli:gap-2">
                    {action.icon}
                    {action.label}
                </span>
                {action.active
                    ? (action.successIcon ?? null)
                    : (action.idleIcon ?? null)}
            </button>
        )}
        {links.length > 0 && (
            <div className="polli:ml-3.5 polli:mt-0.5 polli:flex polli:flex-col polli:gap-0.5 polli:border-l polli:border-green-950/10 polli:pl-2">
                {links.map((link) => (
                    <AppShellSupportLinkRow key={link.href} {...link} />
                ))}
            </div>
        )}
    </div>
);

const AppShellSupportLinkRow: FC<AppShellSupportLink> = ({
    label,
    href,
    icon,
}) => (
    <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="polli:group polli:flex polli:items-center polli:justify-between polli:gap-2 polli:rounded-full polli:px-3 polli:py-1.5 polli:text-left polli:text-xs polli:font-medium polli:text-gray-700 polli:transition-colors polli:hover:bg-white/60 polli:hover:text-gray-950"
    >
        <span className="polli:flex polli:items-center polli:gap-2">
            {icon}
            {label}
        </span>
        <ExternalLinkIcon className="polli:h-3.5 polli:w-3.5 polli:shrink-0 polli:text-gray-400 polli:transition-colors polli:group-hover:text-gray-600" />
    </a>
);

const AppShellFooter: FC<{
    links: readonly AppShellFooterLink[];
    note?: ReactNode;
}> = ({ links, note }) => (
    <>
        {links.length > 0 && (
            <div className="polli:flex polli:flex-wrap polli:gap-x-2 polli:gap-y-1 polli:px-3 polli:text-xs polli:leading-snug polli:text-green-950/55">
                {links.map((link) => (
                    <a
                        key={link.href}
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="polli:transition-colors polli:hover:text-green-950"
                    >
                        {link.label}
                    </a>
                ))}
            </div>
        )}
        {note && (
            <div className="polli:px-3 polli:text-xs polli:leading-none polli:text-green-950/45">
                {note}
            </div>
        )}
    </>
);

export type AccountMenuLink = {
    href: string;
    label: string;
    icon: ReactNode;
    ariaLabel?: string;
};

export type AccountMenuButtonProps = {
    username: string;
    avatarUrl: string;
    onSignOut?: () => void;
    links?: readonly AccountMenuLink[];
    className?: string;
};

export const AccountMenuButton: FC<AccountMenuButtonProps> = ({
    username,
    avatarUrl,
    onSignOut,
    links = [],
    className,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    return (
        <Menu.Root open={isOpen} onOpenChange={({ open }) => setIsOpen(open)}>
            <Menu.Trigger asChild>
                <button
                    type="button"
                    className={cn(
                        "polli:flex polli:min-w-0 polli:flex-row polli:items-center polli:gap-2 polli:self-center polli:whitespace-nowrap polli:rounded-full polli:bg-amber-200 polli:p-1 polli:pr-3 polli:transition-colors polli:hover:bg-amber-300",
                        className,
                    )}
                >
                    <img
                        src={avatarUrl}
                        alt={`${username} avatar`}
                        className="polli:h-8 polli:shrink-0 polli:rounded-full"
                    />
                    <span className="polli:min-w-0 polli:flex-1 polli:truncate polli:text-left polli:font-medium polli:text-amber-900">
                        {username}
                    </span>
                    <ChevronIcon
                        expanded={isOpen}
                        className="polli:ml-auto polli:h-4 polli:w-4 polli:shrink-0 polli:text-amber-900 polli:transition-transform polli:duration-200 polli:ease-out"
                    />
                </button>
            </Menu.Trigger>
            <Menu.Positioner>
                <Menu.Content className="polli:z-50 polli:w-[var(--reference-width)] polli:min-w-0 polli:rounded-lg polli:bg-amber-200 polli:p-1 polli:focus:outline-none">
                    {links.map((link) => (
                        <AccountMenuLinkRow key={link.href} {...link} />
                    ))}
                    {links.length > 0 && (
                        <div className="polli:my-1 polli:border-t polli:border-amber-300" />
                    )}
                    <Menu.Item
                        value="sign-out"
                        className="polli:flex polli:cursor-pointer polli:items-center polli:rounded-lg polli:px-3 polli:py-2 polli:text-sm polli:text-amber-900 polli:hover:bg-amber-300 polli:focus:outline-none polli:focus-visible:bg-amber-300"
                        onClick={onSignOut}
                    >
                        Sign Out
                    </Menu.Item>
                </Menu.Content>
            </Menu.Positioner>
        </Menu.Root>
    );
};

const AccountMenuLinkRow: FC<AccountMenuLink> = ({
    href,
    label,
    icon,
    ariaLabel,
}) => (
    <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={ariaLabel ?? label}
        className="polli:flex polli:items-center polli:justify-start polli:gap-2 polli:rounded-lg polli:px-3 polli:py-2 polli:text-sm polli:font-medium polli:text-amber-900 polli:transition-colors polli:hover:bg-amber-300 polli:focus:outline-none polli:focus-visible:bg-amber-300"
    >
        <span className="polli:h-4 polli:w-4 polli:shrink-0" aria-hidden="true">
            {icon}
        </span>
        <span>{label}</span>
    </a>
);
