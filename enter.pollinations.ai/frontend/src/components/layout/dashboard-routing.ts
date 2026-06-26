import { type DashboardPage, isDashboardPage } from "./dashboard-theme.ts";

type DashboardHashAliases = Readonly<Partial<Record<string, DashboardPage>>>;

const COMMON_DASHBOARD_HASH_ALIASES = {
    news: "news-faq",
    faq: "news-faq",
    updates: "news-faq",
    pricing: "models",
} as const satisfies DashboardHashAliases;

export const AUTHENTICATED_DASHBOARD_HASH_ALIASES = {
    ...COMMON_DASHBOARD_HASH_ALIASES,
    "buy-pollen": "pollen",
    earnings: "activity",
    usage: "activity",
    "activity-table": "activity",
} as const satisfies DashboardHashAliases;

const FAQ_ANCHOR_HASH_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)+$/;

type DashboardPageFromHashOptions = {
    allowedPages?: ReadonlySet<DashboardPage>;
    aliases?: DashboardHashAliases;
    fallbackPage: DashboardPage;
    faqAnchorPage?: DashboardPage;
};

export function dashboardPageFromHash(
    hash: string,
    {
        allowedPages,
        aliases = COMMON_DASHBOARD_HASH_ALIASES,
        fallbackPage,
        faqAnchorPage,
    }: DashboardPageFromHashOptions,
): DashboardPage {
    const slug = hash.replace(/^#/, "");
    const page = isDashboardPage(slug) ? slug : aliases[slug];

    if (page && (!allowedPages || allowedPages.has(page))) return page;
    if (
        faqAnchorPage &&
        slug &&
        FAQ_ANCHOR_HASH_PATTERN.test(slug) &&
        (!allowedPages || allowedPages.has(faqAnchorPage))
    ) {
        return faqAnchorPage;
    }

    return fallbackPage;
}
