import {
    CheckIcon,
    EarningsIcon,
    GlobeIcon,
    InlineLink,
    MegaphoneIcon,
    Surface,
    WalletIcon,
} from "@pollinations/ui";
import { formatPollen } from "@pollinations/ui/wallet";
import type { ComponentType, ReactNode } from "react";
import { useEffect, useState } from "react";
import { accountClient } from "../api.ts";
import type { ListedApp } from "../backend-types.ts";
import { genDocsUrl } from "../config.ts";
import type { DeveloperEarningsRow } from "./activity/use-earnings-data.ts";
import { isAppKey, readRedirectUris } from "./keys/key-type.ts";
import type { ApiKey } from "./keys/types.ts";
import { SUBMIT_APP_URL } from "./my-apps.tsx";

type Site = { name: string; url: string };

type AppSummary = {
    name: string;
    emoji?: string | null;
    hosts: string[];
    key?: ApiKey;
    listing?: ListedApp;
    site?: Site;
};

// The four things Pollinations does for an app, in one line each.
const FEATURES = [
    {
        icon: GlobeIcon,
        label: "Hosting",
        text: "Free at your-app.pollinations.app.",
    },
    {
        icon: WalletIcon,
        label: "Pollinations Pay",
        text: "Your users sign in and pay with their own pollen.",
    },
    {
        icon: MegaphoneIcon,
        label: "Listing",
        text: "Your app in the catalog on pollinations.ai.",
    },
    {
        icon: EarningsIcon,
        label: "Earnings",
        text: "20% of what your users spend.",
    },
] as const;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function hostOf(url: string): string | undefined {
    try {
        const host = new URL(url).hostname;
        return LOCAL_HOSTS.has(host) ? undefined : host;
    } catch {
        return undefined;
    }
}

// One app per address: an app key's redirect URLs, a listing's web URL and a
// site all name the app's domain.
function summarize(
    keys: ApiKey[],
    listed: ListedApp[],
    sites: Site[],
): AppSummary[] {
    const apps: AppSummary[] = keys.filter(isAppKey).map((key) => ({
        name: key.name ?? "App",
        key,
        hosts: readRedirectUris(key.metadata).flatMap(
            (uri) => hostOf(uri) ?? [],
        ),
    }));
    const appFor = (host: string | undefined, name: string) => {
        const found = host && apps.find((app) => app.hosts.includes(host));
        if (found) return found;
        const app: AppSummary = { name, hosts: host ? [host] : [] };
        apps.push(app);
        return app;
    };
    for (const listing of listed) {
        const app = appFor(hostOf(listing.webUrl), listing.name);
        Object.assign(app, {
            listing,
            name: listing.name,
            emoji: listing.emoji,
        });
    }
    for (const site of sites) {
        // Redirect URLs name the live address, <name>.pollinations.app; on
        // staging the site itself is served at <name>--staging.pollinations.app.
        const live = `${site.name}.pollinations.app`;
        const found = apps.find((app) => app.hosts.includes(live));
        (found ?? appFor(hostOf(site.url), site.name)).site = site;
    }
    return apps;
}

function useSitesAndEarnings() {
    const [sites, setSites] = useState<Site[]>([]);
    const [earned, setEarned] = useState<Record<string, number>>({});
    useEffect(() => {
        accountClient.sites
            .$get()
            .then((r) => (r.ok ? r.json() : null))
            .then((body) => body && setSites(body.data))
            .catch(() => {});
        accountClient.earnings
            .$get({ query: { days: "7" } })
            .then((r) => (r.ok ? r.json() : null))
            .then((body) => {
                if (!body) return;
                const totals: Record<string, number> = {};
                for (const row of (
                    body as { perEntity: DeveloperEarningsRow[] }
                ).perEntity) {
                    if (row.source !== "byop_markup") continue;
                    totals[row.entity_id] =
                        (totals[row.entity_id] ?? 0) + row.pollen_earned;
                }
                setEarned(totals);
            })
            .catch(() => {});
    }, []);
    return { sites, earned };
}

const Step = ({
    icon: Icon,
    label,
    done,
    children,
}: {
    icon: ComponentType<{ className?: string }>;
    label: string;
    done: boolean;
    children: ReactNode;
}) => (
    <div className="flex min-w-0 items-center gap-2 text-sm">
        <Icon className="h-4 w-4 shrink-0 text-theme-text-muted" />
        <span className="w-32 shrink-0 text-theme-text-strong">{label}</span>
        <span className="min-w-0 flex-1 truncate text-theme-text-muted">
            {children}
        </span>
        <CheckIcon
            className={
                done
                    ? "h-4 w-4 shrink-0 text-intent-success-text"
                    : "invisible h-4 w-4 shrink-0"
            }
        />
    </div>
);

function AppSummaryCard({
    app,
    earned,
}: {
    app: AppSummary;
    earned: Record<string, number>;
}) {
    const { key, listing, site } = app;
    const earningsOn = key?.metadata?.earningsEnabled === true;
    const approved = listing?.approvedDate;
    const issue = listing?.issueUrl?.match(/\/issues\/(\d+)/)?.[1];
    return (
        <Surface className="flex flex-col gap-2 p-4">
            <div className="flex min-w-0 items-baseline justify-between gap-3">
                <span className="truncate font-medium text-theme-text-strong">
                    {app.emoji ? `${app.emoji} ` : ""}
                    {app.name}
                </span>
                {app.hosts[0] && (
                    <span className="truncate text-xs text-theme-text-muted">
                        {app.hosts[0]}
                    </span>
                )}
            </div>
            <Step icon={GlobeIcon} label="Hosting" done={Boolean(site)}>
                {site ? (
                    <InlineLink href={site.url} tone="quiet">
                        Live
                    </InlineLink>
                ) : (
                    <InlineLink href={genDocsUrl("#tag/sites")}>
                        Host free
                    </InlineLink>
                )}
            </Step>
            <Step
                icon={WalletIcon}
                label="Pollinations Pay"
                done={Boolean(key)}
            >
                {key ? (
                    `${key.start ?? "App key"}…`
                ) : (
                    <InlineLink href="/keys?tab=app">Add app key</InlineLink>
                )}
            </Step>
            <Step icon={MegaphoneIcon} label="Listing" done={Boolean(listing)}>
                {listing ? (
                    approved ? (
                        "Listed"
                    ) : (
                        `#${issue} in review`
                    )
                ) : (
                    <InlineLink href={SUBMIT_APP_URL}>Submit</InlineLink>
                )}
            </Step>
            <Step icon={EarningsIcon} label="Earnings" done={earningsOn}>
                {!key ? (
                    "Needs app key"
                ) : earningsOn ? (
                    `+${formatPollen(earned[key.id] ?? 0)} this week`
                ) : (
                    <InlineLink href="/keys?tab=app">Turn on</InlineLink>
                )}
            </Step>
        </Surface>
    );
}

/** Each of your apps with its hosting, Pollinations Pay, listing and earnings. */
export function AppOverview({
    apps,
    appKeys,
    footnote,
}: {
    apps: ListedApp[];
    appKeys: ApiKey[];
    footnote: ReactNode;
}) {
    const { sites, earned } = useSitesAndEarnings();
    const summaries = summarize(appKeys, apps, sites);
    return (
        <>
            {summaries.length === 0 ? (
                <Surface className="flex flex-col gap-2 p-4">
                    {FEATURES.map(({ icon, label, text }) => (
                        <Step
                            key={label}
                            icon={icon}
                            label={label}
                            done={false}
                        >
                            {text}
                        </Step>
                    ))}
                </Surface>
            ) : (
                <div className="@container">
                    <div className="grid grid-cols-1 gap-3 @min-[48rem]:grid-cols-2">
                        {summaries.map((app) => (
                            <AppSummaryCard
                                key={app.key?.id ?? app.hosts[0] ?? app.name}
                                app={app}
                                earned={earned}
                            />
                        ))}
                    </div>
                </div>
            )}
            {footnote}
        </>
    );
}
