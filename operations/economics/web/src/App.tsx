import {
    AccountMenu,
    Alert,
    Button,
    Chip,
    ClockIcon,
    ColorModeToggle,
    cn,
    DatabaseIcon,
    Drawer,
    EyeIcon,
    GlobeIcon,
    Heading,
    IconButton,
    InfoTip,
    MenuIcon,
    NavItem,
    RocketIcon,
    ScrollArea,
    SproutIcon,
    Text,
    UsageIcon,
    WalletIcon,
    XIcon,
} from "@pollinations/ui";
import logoUrl from "@pollinations/ui/brand/mark.svg";
import {
    type ComponentType,
    type CSSProperties,
    type ReactNode,
    type RefObject,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { ErrorBoundary } from "./components/ErrorBoundary";
import {
    FilterBar,
    FilterMultiSelect,
    MonthFilter,
    YearFilter,
} from "./components/Filters";
import {
    type FacetOption,
    type LedgerTab,
    ledgerFacets,
} from "./lib/filterFacets";
import {
    collectMonths,
    latestClosedMonth,
    WINDOW_START,
    yearsOf,
} from "./lib/months";
import type { ProvenanceCode } from "./lib/provenance";
import { fixturesMode, loadAll, TbError } from "./lib/tb";
import type { Data } from "./types";
import { CommunityTab } from "./views/CommunityTab";
import { BalancesTab } from "./views/CreditsTab";
import { GpuTab } from "./views/GpuTab";
import { OpCloudTab } from "./views/OpCloudTab";
import { OpPollenTab } from "./views/OpPollenTab";
import { OpTransactionsTab } from "./views/OpTransactionsTab";
import { ProviderCloseTab } from "./views/ProviderCloseTab";
import { RunwayTab } from "./views/RunwayTab";
import { ManagedInferenceTab, VendorsTab } from "./views/UnitEconomicsTab";

type AccountUser = {
    email: string;
    name?: string;
    picture?: string;
    preferred_username?: string;
};

const FIXTURE_ACCOUNT_USER: AccountUser = {
    email: "fixture@pollinations.ai",
    name: "Fixture User",
};

function accountName(user: AccountUser) {
    return user.preferred_username || user.name || user.email;
}

type InsightTab =
    | "close"
    | "runway"
    | "vendors"
    | "inference"
    | "community"
    | "balances"
    | "gpu";
type ActiveView = InsightTab | LedgerTab;

const logoMask: CSSProperties = {
    WebkitMask: `url(${logoUrl}) center / contain no-repeat`,
    mask: `url(${logoUrl}) center / contain no-repeat`,
};

type DrawerItem<Id extends string> = {
    id: Id;
    label: string;
    note: string;
    icon: ComponentType<{ className?: string }>;
};

const INSIGHT_TABS = [
    {
        id: "runway",
        label: "Runway",
        note: "Cash runway from the Wise-derived bank ledger plus explicit OP Forecast assumptions.",
        icon: WalletIcon,
    },
    {
        id: "vendors",
        label: "Vendors",
        note: "Direct AI-delivery economics by vendor-month across managed inference and GPU capacity; shared infrastructure is excluded.",
        icon: GlobeIcon,
    },
    {
        id: "inference",
        label: "Inference",
        note: "Managed inference model economics: Paid vs Quest, cash vs credits, cash and after-credit contribution, and vendor-month cost checks.",
        icon: UsageIcon,
    },
    {
        id: "gpu",
        label: "GPUs",
        note: "GPU capacity economics with vendor-pool results above and one direct-cost row per GPU resource below.",
        icon: RocketIcon,
    },
    {
        id: "community",
        label: "Community",
        note: "Community-model economics: cash-backed Paid Pollen, owner and BYOP shares, retained value, Quest rewards, and activity without a Pollinations vendor cost.",
        icon: SproutIcon,
    },
] satisfies readonly DrawerItem<InsightTab>[];

const LEDGER_INSIGHT_TABS = [
    {
        id: "close",
        label: "Close",
        note: "Monthly close readiness from vendor sources, account coverage, and ledger quality; tax filing confirmation remains separate.",
        icon: EyeIcon,
    },
    {
        id: "balances",
        label: "Balances",
        note: "Current cash-prepaid and free-credit vendor balances, with an expandable monthly roll-forward.",
        icon: ClockIcon,
    },
] satisfies readonly DrawerItem<InsightTab>[];

const ALL_INSIGHT_TABS = [
    ...INSIGHT_TABS,
    ...LEDGER_INSIGHT_TABS,
] satisfies readonly DrawerItem<InsightTab>[];

// note + pipe surface as a hover tooltip on the tab button — the tab body
// itself stays table-only.
type LedgerDrawerItem = DrawerItem<LedgerTab> & {
    codes: ProvenanceCode[];
    pipe: string;
    rows: (data: Data) => number;
};

const TABS = [
    {
        id: "op-transactions",
        label: "Bank",
        codes: ["WISE"],
        pipe: "economics_bank_ledger_api",
        note: "Wise-derived bank ledger in native currency: signed cash movements plus one statement-backed opening-balance anchor. Drive evidence links to transaction documents.",
        icon: DatabaseIcon,
        rows: (data) =>
            (data.opTransactions ?? []).filter(
                (row) => row.date.slice(0, 7) >= WINDOW_START,
            ).length,
    },
    {
        id: "op-cloud",
        label: "Compute & Infra",
        codes: ["API", "CLI", "BQ", "HC", "INV", "EXP", "ING", "AGT"],
        pipe: "economics_compute_ledger_api",
        note: "Compute and infrastructure usage facts, including inference, GPUs, grants, and credit burn. Paid and burn values are signed; positive credit is a grant award.",
        icon: DatabaseIcon,
        rows: (data) =>
            (data.opCloud ?? []).filter(
                (row) => row.start.slice(0, 7) >= WINDOW_START,
            ).length,
    },
    {
        id: "op-pollen",
        label: "Pollen",
        codes: ["TB"],
        pipe: "economics_pollen_usage_api",
        note: "Monthly canonical vendor and internal-model usage with Paid/Quest customer price, metered cost, ecosystem shares, and request counts.",
        icon: DatabaseIcon,
        rows: (data) =>
            (data.opPollen ?? []).filter((row) => row.month >= WINDOW_START)
                .length,
    },
] satisfies readonly LedgerDrawerItem[];

function isLedgerTab(value: ActiveView): value is LedgerTab {
    return TABS.some((item) => item.id === value);
}

function codesLabel(codes: readonly ProvenanceCode[]) {
    return codes.length ? `${codes.join(", ")} · ` : "";
}

function MobileMenuButton({
    buttonRef,
    onOpen,
}: {
    buttonRef: RefObject<HTMLButtonElement | null>;
    onOpen: () => void;
}) {
    return (
        <IconButton
            ref={buttonRef}
            size="md"
            className="fixed left-3 top-3 z-30 bg-surface-opaque text-theme-text-strong shadow-md ring-1 ring-theme-text-strong/10 hover:bg-surface-opaque md:hidden"
            onClick={onOpen}
            title="Open navigation"
        >
            <MenuIcon className="h-5 w-5" />
        </IconButton>
    );
}

function DrawerGroup({
    label,
    children,
}: {
    label: string;
    children: ReactNode;
}) {
    return (
        <div className="flex flex-col gap-1">
            <Text
                size="micro"
                tone="soft"
                weight="bold"
                className="px-3 uppercase tracking-wide"
            >
                {label}
            </Text>
            <div className="flex flex-col gap-1">{children}</div>
        </div>
    );
}

function EconomicsNav({
    activeView,
    data,
    onViewChange,
}: {
    activeView: ActiveView;
    data: Data | null;
    onViewChange: (value: ActiveView) => void;
}) {
    const insightItem = (item: DrawerItem<InsightTab>) => (
        <NavItem
            key={item.id}
            type="button"
            data-theme="accent"
            icon={item.icon}
            active={activeView === item.id}
            title={item.note}
            onClick={() => onViewChange(item.id)}
        >
            {item.label}
        </NavItem>
    );
    const rawItem = (item: (typeof TABS)[number]) => {
        const count = data ? item.rows(data) : null;
        const title = `${codesLabel(item.codes)}${item.pipe}${data ? ` · ${count} rows` : ""}\n${item.note}`;

        return (
            <NavItem
                key={item.id}
                type="button"
                data-theme="accent"
                icon={item.icon}
                active={activeView === item.id}
                title={title}
                onClick={() => onViewChange(item.id)}
            >
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {count == null ? null : (
                    <Chip
                        data-theme="neutral"
                        intent="neutral"
                        size="sm"
                        className="ml-auto bg-transparent text-theme-text-soft"
                    >
                        {count}
                    </Chip>
                )}
            </NavItem>
        );
    };

    return (
        <nav className="flex flex-col gap-5 pr-2" aria-label="Economics views">
            <DrawerGroup label="Insights">
                {INSIGHT_TABS.map(insightItem)}
            </DrawerGroup>
            <DrawerGroup label="Ledgers">
                {LEDGER_INSIGHT_TABS.map(insightItem)}
                {TABS.map(rawItem)}
            </DrawerGroup>
        </nav>
    );
}

function EconomicsDrawer({
    activeView,
    data,
    footer,
    onViewChange,
}: {
    activeView: ActiveView;
    data: Data | null;
    footer: ReactNode;
    onViewChange: (value: ActiveView) => void;
}) {
    return (
        <aside
            data-theme="neutral"
            className="flex min-h-0 flex-1 flex-col px-2 py-4 md:fixed md:inset-y-0 md:left-0 md:z-30 md:w-60 md:border-r md:border-theme-text-strong/10"
            aria-label="Economics navigation"
        >
            <div className="hidden shrink-0 border-b border-theme-text-strong/10 px-1 pb-4 text-theme-text-strong md:block">
                <EconomicsBrand size="desktop" />
            </div>
            <ScrollArea className="-mr-2 min-h-0 flex-1 pt-3">
                <EconomicsNav
                    activeView={activeView}
                    data={data}
                    onViewChange={onViewChange}
                />
            </ScrollArea>
            <div className="flex shrink-0 flex-col gap-2 border-t border-theme-text-strong/10 px-1 pt-4">
                {footer}
            </div>
        </aside>
    );
}

function EconomicsShell({
    activeView,
    children,
    data,
    footer,
    onViewChange,
}: {
    activeView: ActiveView;
    children: ReactNode;
    data: Data | null;
    footer: ReactNode;
    onViewChange: (value: ActiveView) => void;
}) {
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const menuButtonRef = useRef<HTMLButtonElement>(null);

    const closeDrawer = () => {
        setIsDrawerOpen(false);
        menuButtonRef.current?.focus({ preventScroll: true });
    };

    const handleViewChange = (value: ActiveView) => {
        onViewChange(value);
        closeDrawer();
    };

    const drawer = (
        <EconomicsDrawer
            activeView={activeView}
            data={data}
            footer={footer}
            onViewChange={handleViewChange}
        />
    );

    return (
        <div
            data-theme="amber"
            className="flex h-dvh min-h-0 overflow-hidden bg-app-bg font-body text-theme-text-strong"
        >
            <div className="hidden md:block">{drawer}</div>
            <Drawer
                open={isDrawerOpen}
                onOpenChange={(open) => {
                    if (open) setIsDrawerOpen(true);
                    else closeDrawer();
                }}
                ariaLabel="Economics navigation"
                contentClassName="md:hidden"
            >
                <div className="flex shrink-0 items-center justify-between gap-3 border-b border-theme-text-strong/10 px-4 py-3 text-theme-text-strong">
                    <EconomicsBrand size="drawer" />
                    <IconButton
                        size="md"
                        className="shrink-0 bg-surface-opaque/70 text-theme-text-strong hover:bg-surface-opaque"
                        onClick={closeDrawer}
                        title="Close navigation"
                    >
                        <XIcon className="h-5 w-5" />
                    </IconButton>
                </div>
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                    {drawer}
                </div>
            </Drawer>
            <div className="flex min-w-0 flex-1 flex-col md:ml-60">
                <MobileMenuButton
                    buttonRef={menuButtonRef}
                    onOpen={() => setIsDrawerOpen(true)}
                />
                <ScrollArea axis="y" className="min-h-0 flex-1">
                    {children}
                </ScrollArea>
            </div>
        </div>
    );
}

function EconomicsBrand({ size }: { size: "desktop" | "drawer" }) {
    return (
        <div
            className={cn(
                "flex min-w-0 items-center",
                size === "desktop" ? "gap-3" : "gap-2.5",
            )}
        >
            <span className="sr-only">Economics</span>
            <span
                aria-hidden="true"
                className={cn(
                    "block shrink-0 bg-current",
                    size === "desktop" ? "h-8 w-8" : "h-7 w-7",
                )}
                style={logoMask}
            />
            <span
                aria-hidden="true"
                className={cn(
                    "min-w-0 truncate font-subheading font-medium leading-none",
                    size === "desktop" ? "text-2xl" : "text-xl",
                )}
            >
                Economics
            </span>
        </div>
    );
}

function activeViewTitle(activeView: ActiveView) {
    if (isLedgerTab(activeView)) {
        return TABS.find((item) => item.id === activeView)?.label ?? "";
    }
    return ALL_INSIGHT_TABS.find((item) => item.id === activeView)?.label ?? "";
}

function InfoLine({ children }: { children: ReactNode }) {
    return <span className="block">• {children}</span>;
}

function viewInfoContent(activeView: ActiveView) {
    if (isLedgerTab(activeView)) {
        const active = TABS.find((item) => item.id === activeView);
        if (!active) return null;
        return (
            <span className="block max-w-72">
                <strong>{active.label}</strong>
                <InfoLine>{active.note}</InfoLine>
                <InfoLine>
                    Source: <strong>{active.pipe}</strong>
                </InfoLine>
            </span>
        );
    }

    if (activeView === "vendors") {
        return (
            <span className="block max-w-72">
                <strong>Vendors</strong>
                <InfoLine>
                    One vendor-month across managed inference and GPU capacity.
                    Shared infrastructure is excluded from unit economics.
                </InfoLine>
                <InfoLine>
                    Paid shows retained cash-backed value; Quest stays separate
                    as free usage. Gross Paid remains in the usage-mix tooltip.
                </InfoLine>
                <InfoLine>
                    Total vendor economics remain valid when a vendor supplies
                    both modes. The mode split stays unallocated until Pollen
                    records delivery mode per request.
                </InfoLine>
                <InfoLine>
                    Result and Performance use full vendor cost, including
                    consumed credits.
                </InfoLine>
            </span>
        );
    }
    if (activeView === "inference") {
        return (
            <span className="block max-w-72">
                <strong>Inference</strong>
                <InfoLine>
                    Managed-inference vendor-months only; current-month rows
                    remain partial and mixed inference/GPU months stay
                    unallocated.
                </InfoLine>
                <InfoLine>
                    Paid shows retained cash-backed value; Quest stays separate
                    as free usage. Gross Paid remains in the usage-mix tooltip.
                </InfoLine>
                <InfoLine>
                    Vendor-month totals are authoritative. Model values are
                    allocations by monthly Pollen metered-cost share, not
                    independent vendor evidence.
                </InfoLine>
                <InfoLine>
                    Result is retained Paid minus cash and consumed credits.
                    Performance divides that result by retained Paid; cost
                    checks remain at vendor level.
                </InfoLine>
            </span>
        );
    }
    if (activeView === "community") {
        return (
            <span className="block max-w-72">
                <strong>Community Models</strong>
                <InfoLine>
                    Paid Pollen is cash-backed value consumed, not Stripe or
                    Wise cash collected in this month. Quest Pollen is free
                    usage and never fiat revenue.
                </InfoLine>
                <InfoLine>
                    Paid shows only the value retained after owner and BYOP
                    payouts. Hover it for the payout breakdown.
                </InfoLine>
                <InfoLine>
                    Community authors supply the model and infrastructure, so no
                    Pollinations vendor cost is reconciled here.
                </InfoLine>
            </span>
        );
    }
    if (activeView === "close") {
        return (
            <span className="block max-w-72">
                <strong>Close</strong>
                <InfoLine>
                    Vendor rows check archived source coverage, active accounts,
                    and whether usage was cash- or credit-funded.
                </InfoLine>
                <InfoLine>
                    The month-level result also includes transaction-document,
                    vendor-mapping, row-integrity, duplicate, and FX checks
                    shown in the year-wide integrity history below.
                </InfoLine>
                <InfoLine>
                    Invoices and bank entries remain in Bank. e-MTA filing
                    confirmation is not tracked yet, so Ready means the books
                    are ready to file—not legally filed.
                </InfoLine>
            </span>
        );
    }
    if (activeView === "balances") {
        return (
            <span className="block max-w-72">
                <strong>Balances</strong>
                <InfoLine>
                    Current vendor balances; the selected period does not limit
                    this page. Open a vendor for its monthly history.
                </InfoLine>
                <InfoLine>
                    Cash prepaid is payments minus cash-funded usage. Free
                    credit is recorded grants minus credit-funded usage and
                    expired capacity.
                </InfoLine>
                <InfoLine>
                    Cash prepaid is a ledger estimate, not a live vendor wallet.
                    Individual payments and documents stay in Bank.
                </InfoLine>
            </span>
        );
    }
    if (activeView === "runway") {
        return (
            <span className="block max-w-72">
                <strong>Runway</strong>
                <InfoLine>
                    Actual cash comes from OP Transactions; future cash comes
                    from explicit OP Forecast assumptions.
                </InfoLine>
                <InfoLine>
                    The current month keeps bank movements and the authored
                    full-month plan in separate columns.
                </InfoLine>
                <InfoLine>
                    Revenue and expense-category rows are cash P&amp;L totals;
                    expand a category to see its vendor detail.
                </InfoLine>
                <InfoLine>
                    Compute &amp; Infra usage can inform the forecast, but
                    running cash remains cash-based; missing assumptions stay
                    visible as flags.
                </InfoLine>
            </span>
        );
    }
    if (activeView === "gpu") {
        return (
            <span className="block max-w-72">
                <strong>GPU Economics</strong>
                <InfoLine>
                    Cards show the selected month at vendor-pool level: retained
                    Paid, Quest usage, cash, consumed credits, and full-cost
                    result.
                </InfoLine>
                <InfoLine>
                    The table has one row per verified workload. Expand one to
                    see every billed GPU resource and its direct usage and cost.
                </InfoLine>
                <InfoLine>
                    Result is retained Paid minus the full mapped workload cost.
                    Efficiency is that result divided by retained Paid.
                </InfoLine>
                <InfoLine>
                    Pollen does not identify the serving replica, so efficiency
                    stays at workload level. Unknown short-lived resources and
                    shared overhead remain visible instead of being guessed.
                </InfoLine>
            </span>
        );
    }
    return null;
}

export default function App() {
    const fixtures = fixturesMode();
    const [accountUser, setAccountUser] = useState<AccountUser | null>(() =>
        fixtures ? FIXTURE_ACCOUNT_USER : null,
    );
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<Data | null>(null);
    const [activeView, setActiveView] = useState<ActiveView>("runway");
    const [selectedMonth, setSelectedMonth] = useState("");
    const [runwayYear, setRunwayYear] = useState("2026");
    const [selectedVendors, setSelectedVendors] = useState<string[]>([]);
    const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        if (fixtures) return;

        let cancelled = false;
        fetch("/auth/session", { headers: { Accept: "application/json" } })
            .then(async (response) =>
                response.ok
                    ? ((await response.json()) as { user?: AccountUser })
                    : null,
            )
            .then((session) => {
                if (!cancelled) setAccountUser(session?.user ?? null);
            })
            .catch(() => undefined);

        return () => {
            cancelled = true;
        };
    }, [fixtures]);

    useEffect(() => {
        const retryKey = attempt;
        let cancelled = false;
        setError(null);
        loadAll()
            .then((loaded) => {
                if (!cancelled && retryKey === attempt) setData(loaded);
            })
            .catch((caught: unknown) => {
                if (cancelled || retryKey !== attempt) return;

                if (
                    caught instanceof TbError &&
                    (caught.status === 401 || caught.status === 403)
                ) {
                    window.location.assign("/auth/login");
                } else {
                    setError(
                        caught instanceof Error
                            ? caught.message
                            : String(caught),
                    );
                }
            });

        return () => {
            cancelled = true;
        };
    }, [attempt]);

    const months = useMemo(() => (data ? collectMonths(data) : []), [data]);
    const reportingYears = useMemo(() => yearsOf(months), [months]);
    const monthFilter = months.includes(selectedMonth)
        ? selectedMonth
        : (latestClosedMonth(months) ?? "");
    const selectedYear = monthFilter.slice(0, 4) || reportingYears.at(-1) || "";
    const activeLedgerTab = isLedgerTab(activeView)
        ? activeView
        : "op-transactions";
    const rawFacets = useMemo(
        () =>
            data
                ? ledgerFacets(data, activeLedgerTab, {
                      month: monthFilter,
                      vendors: selectedVendors,
                      categories: selectedCategories,
                  })
                : {
                      vendors: [] as FacetOption[],
                      categories: [] as FacetOption[],
                  },
        [
            activeLedgerTab,
            data,
            monthFilter,
            selectedCategories,
            selectedVendors,
        ],
    );
    const showVendorFilter =
        isLedgerTab(activeView) && rawFacets.vendors.length > 0;
    const showPeriodFilter =
        activeView !== "balances" && activeView !== "runway";
    const showRunwayYearFilter = activeView === "runway";
    const showTopMonthFilter = showPeriodFilter && activeView !== "close";
    const showCategoryFilter = activeView === "op-transactions";
    const hasFilters =
        showPeriodFilter ||
        showRunwayYearFilter ||
        showVendorFilter ||
        showCategoryFilter;

    const drawerFooter = (
        <>
            {accountUser && (
                <AccountMenu
                    name={accountName(accountUser)}
                    avatarUrl={accountUser.picture}
                    onSignOut={() =>
                        window.location.assign(fixtures ? "/" : "/auth/logout")
                    }
                    className="polli:w-full"
                    side="top"
                />
            )}
            <div className="flex flex-wrap items-center gap-2">
                {fixtures && <Chip intent="alpha">fixtures</Chip>}
            </div>
            <div className="flex items-center justify-between gap-2">
                <span />
                <ColorModeToggle />
            </div>
        </>
    );
    const viewTitle = activeViewTitle(activeView);
    const viewInfo = viewInfoContent(activeView);
    const filters = hasFilters ? (
        <FilterBar>
            {(showPeriodFilter || showRunwayYearFilter) && (
                <YearFilter
                    years={
                        showRunwayYearFilter ? ["2026", "2027"] : reportingYears
                    }
                    value={showRunwayYearFilter ? runwayYear : selectedYear}
                    onChange={(year) => {
                        if (showRunwayYearFilter) {
                            setRunwayYear(year);
                            return;
                        }
                        const yearMonths = months.filter((month) =>
                            month.startsWith(year),
                        );
                        if (!monthFilter.startsWith(year)) {
                            setSelectedMonth(
                                latestClosedMonth(yearMonths) ??
                                    yearMonths.at(-1) ??
                                    "",
                            );
                        }
                    }}
                />
            )}
            {showTopMonthFilter && (
                <MonthFilter
                    months={months}
                    year={selectedYear}
                    value={monthFilter}
                    onChange={setSelectedMonth}
                />
            )}
            <div className="flex flex-wrap items-center gap-3">
                {showVendorFilter && (
                    <FilterMultiSelect
                        value={selectedVendors}
                        onChange={setSelectedVendors}
                        options={rawFacets.vendors}
                        placeholder="All vendors"
                    />
                )}
                {showCategoryFilter && (
                    <FilterMultiSelect
                        value={selectedCategories}
                        onChange={setSelectedCategories}
                        options={rawFacets.categories}
                        placeholder="All categories"
                    />
                )}
            </div>
        </FilterBar>
    ) : null;
    const content = (
        <>
            {error && (
                <Alert intent="warning" title="Load failed">
                    <div className="flex flex-wrap items-center gap-2">
                        <span>{error}</span>
                        <Button
                            size="sm"
                            onClick={() => setAttempt((n) => n + 1)}
                        >
                            Retry
                        </Button>
                    </div>
                </Alert>
            )}
            {!error && !data && <Text tone="soft">Loading pipes...</Text>}
            <ErrorBoundary
                resetKey={`${activeView}:${selectedYear}:${monthFilter}:${runwayYear}:${selectedVendors.join(",")}:${selectedCategories.join(",")}`}
            >
                {data && activeView === "op-transactions" && (
                    <OpTransactionsTab
                        category={selectedCategories}
                        data={data}
                        month={monthFilter}
                        vendor={selectedVendors}
                    />
                )}
                {data && activeView === "op-pollen" && (
                    <OpPollenTab
                        data={data}
                        month={monthFilter}
                        vendor={selectedVendors}
                    />
                )}
                {data && activeView === "op-cloud" && (
                    <OpCloudTab
                        data={data}
                        month={monthFilter}
                        vendor={selectedVendors}
                    />
                )}
                {data && activeView === "close" && (
                    <ProviderCloseTab
                        data={data}
                        month={monthFilter}
                        months={months}
                        year={selectedYear}
                        onMonthChange={setSelectedMonth}
                    />
                )}
                {data && activeView === "runway" && (
                    <RunwayTab data={data} year={runwayYear} />
                )}
                {data && activeView === "vendors" && (
                    <VendorsTab data={data} month={monthFilter} />
                )}
                {data && activeView === "inference" && (
                    <ManagedInferenceTab data={data} month={monthFilter} />
                )}
                {data && activeView === "balances" && (
                    <BalancesTab data={data} />
                )}
                {data && activeView === "community" && (
                    <CommunityTab data={data} month={monthFilter} />
                )}
                {data && activeView === "gpu" && (
                    <GpuTab data={data} month={monthFilter} />
                )}
            </ErrorBoundary>
        </>
    );

    // The shell itself computes insights (nav row counts) — a compute error
    // there must render the error state, not white-screen the app.
    return (
        <ErrorBoundary resetKey={String(attempt)}>
            <EconomicsShell
                activeView={activeView}
                data={data}
                footer={drawerFooter}
                onViewChange={(value) => {
                    setSelectedVendors([]);
                    setSelectedCategories([]);
                    setActiveView(value);
                }}
            >
                <main className="flex w-full flex-col gap-6 px-4 py-14 pb-32 sm:px-6 sm:py-10 sm:pb-32 md:py-8 lg:px-8">
                    <section className="flex flex-col gap-5">
                        <header className="flex shrink-0 justify-end px-1">
                            <div className="flex min-w-0 items-center gap-2">
                                <Heading
                                    as="h2"
                                    size="section"
                                    className="truncate text-right"
                                >
                                    {viewTitle}
                                </Heading>
                                {viewInfo && (
                                    <InfoTip
                                        content={viewInfo}
                                        label={`${viewTitle} info`}
                                    />
                                )}
                            </div>
                        </header>
                        {filters}
                        <div className="flex flex-col gap-5">{content}</div>
                    </section>
                </main>
            </EconomicsShell>
        </ErrorBoundary>
    );
}
