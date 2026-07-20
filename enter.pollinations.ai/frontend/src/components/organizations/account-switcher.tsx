import {
    CheckIcon,
    ChevronIcon,
    cn,
    DiscordIcon,
    Dropdown,
    GitHubIcon,
    PlusIcon,
    UsersIcon,
} from "@pollinations/ui";
import type { FC, ReactNode } from "react";
import { useState } from "react";
import { CreateOrganizationDialog } from "./create-organization-dialog.tsx";
import type { OrganizationSummary } from "./types.ts";

type AccountMenuLink = {
    href: string;
    label: string;
    icon: ReactNode;
    ariaLabel?: string;
};

const accountMenuLinks: readonly AccountMenuLink[] = [
    {
        href: "https://discord.com/channels/885844321461485618/1432378056126894343",
        label: "#pollen-beta",
        icon: <DiscordIcon className="h-full w-full" />,
        ariaLabel: "#pollen-beta Discord channel",
    },
    {
        href: "https://github.com/pollinations/pollinations/issues",
        label: "Report an issue",
        icon: <GitHubIcon className="h-full w-full" />,
        ariaLabel: "Report an issue on GitHub",
    },
];

type AccountSwitcherProps = {
    username: string;
    avatarUrl: string;
    onSignOut: () => void;
    organizations: readonly OrganizationSummary[];
    activeOrganizationId: string | null;
    onSelectOrganization: (organizationId: string | null) => void;
    onCreateOrganization: (name: string) => Promise<OrganizationSummary>;
    className?: string;
};

export const AccountSwitcher: FC<AccountSwitcherProps> = ({
    username,
    avatarUrl,
    onSignOut,
    organizations,
    activeOrganizationId,
    onSelectOrganization,
    onCreateOrganization,
    className,
}) => {
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const activeOrganization = organizations.find(
        (org) => org.id === activeOrganizationId,
    );
    const displayLabel = activeOrganization?.name ?? username;

    return (
        <>
            <Dropdown
                align="end"
                className="w-[var(--reference-width)] min-w-0 p-1"
                trigger={(open) => (
                    <button
                        type="button"
                        data-theme="accent"
                        className={cn(
                            "flex min-w-0 flex-row items-center gap-2 self-center whitespace-nowrap rounded-full bg-theme-bg-active p-1 pr-3 transition-colors hover:bg-theme-bg-hover",
                            className,
                        )}
                    >
                        {activeOrganization ? (
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-opaque">
                                <UsersIcon className="h-4 w-4 text-theme-text-muted" />
                            </span>
                        ) : (
                            <img
                                src={avatarUrl}
                                alt={`${username} avatar`}
                                className="h-8 shrink-0 rounded-full"
                            />
                        )}
                        <span className="min-w-0 flex-1 truncate text-left font-medium text-theme-text-strong">
                            {displayLabel}
                        </span>
                        <ChevronIcon
                            expanded={open}
                            className="ml-auto h-4 w-4 shrink-0 text-theme-text-strong transition-transform duration-200 ease-out"
                        />
                    </button>
                )}
            >
                {(close) => (
                    <>
                        <div className="px-3 pt-1 pb-1.5 text-xs font-medium uppercase tracking-wide text-theme-text-muted">
                            Account
                        </div>
                        <SwitcherRow
                            label={username}
                            avatarUrl={avatarUrl}
                            active={!activeOrganization}
                            onClick={() => {
                                onSelectOrganization(null);
                                close();
                            }}
                        />
                        {organizations.map((org) => (
                            <SwitcherRow
                                key={org.id}
                                label={org.name}
                                active={org.id === activeOrganizationId}
                                onClick={() => {
                                    onSelectOrganization(org.id);
                                    close();
                                }}
                            />
                        ))}
                        <button
                            type="button"
                            onClick={() => {
                                close();
                                setIsCreateOpen(true);
                            }}
                            className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-theme-text-strong hover:bg-theme-bg-hover focus:outline-none focus-visible:bg-theme-bg-hover"
                        >
                            <PlusIcon className="h-4 w-4 shrink-0" />
                            Create organization
                        </button>
                        <div className="my-1 border-t border-divider" />
                        {accountMenuLinks.map((link) => (
                            <AccountMenuLinkRow key={link.href} {...link} />
                        ))}
                        <div className="my-1 border-t border-divider" />
                        <button
                            type="button"
                            onClick={() => {
                                close();
                                onSignOut();
                            }}
                            className="flex w-full cursor-pointer items-center rounded-lg px-3 py-2 text-left text-sm text-theme-text-strong hover:bg-theme-bg-hover focus:outline-none focus-visible:bg-theme-bg-hover"
                        >
                            Sign Out
                        </button>
                    </>
                )}
            </Dropdown>
            <CreateOrganizationDialog
                open={isCreateOpen}
                onOpenChange={setIsCreateOpen}
                onCreate={onCreateOrganization}
                onCreated={(organization) => {
                    onSelectOrganization(organization.id);
                }}
            />
        </>
    );
};

type SwitcherRowProps = {
    label: string;
    avatarUrl?: string;
    active: boolean;
    onClick: () => void;
};

const SwitcherRow: FC<SwitcherRowProps> = ({
    label,
    avatarUrl,
    active,
    onClick,
}) => (
    <button
        type="button"
        onClick={onClick}
        className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-theme-text-strong hover:bg-theme-bg-hover focus:outline-none focus-visible:bg-theme-bg-hover"
    >
        {avatarUrl ? (
            <img
                src={avatarUrl}
                alt=""
                className="h-5 w-5 shrink-0 rounded-full"
            />
        ) : (
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-opaque">
                <UsersIcon className="h-3 w-3 text-theme-text-muted" />
            </span>
        )}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {active && (
            <CheckIcon className="h-4 w-4 shrink-0 text-theme-text-strong" />
        )}
    </button>
);

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
        className="flex items-center justify-start gap-2 rounded-lg px-3 py-2 text-sm font-medium text-theme-text-strong transition-colors hover:bg-theme-bg-hover focus:outline-none focus-visible:bg-theme-bg-hover"
    >
        <span className="h-4 w-4 shrink-0" aria-hidden="true">
            {icon}
        </span>
        <span>{label}</span>
    </a>
);
