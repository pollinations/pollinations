import {
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
    Input,
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
    isMonthKey,
    latestClosedMonth,
    reportingMonths,
    WINDOW_START,
    yearsOf,
} from "./lib/months";
import type { ProvenanceCode } from "./lib/provenance";
import { type DataSource, fixturesMode, loadAll, TbError } from "./lib/tb";
import type { Data } from "./types";
import { BalancesTab } from "./views/CreditsTab";
import { GpuTab } from "./views/GpuTab";
import { OpCloudTab } from "./views/OpCloudTab";
import { OpPollenTab } from "./views/OpPollenTab";
import { OpTransactionsTab } from "./views/OpTransactionsTab";
import { ProviderCloseTab } from "./views/ProviderCloseTab";
import { RevenueShareLedgerTab } from "./views/RevenueShareLedgerTab";
import { RevenueShareTab } from "./views/RevenueShareTab";
import { RunwayTab } from "./views/RunwayTab";
import { ManagedInferenceTab, VendorsTab } from "./views/UnitEconomicsTab";

type InsightTab =
    | "close"
    | "runway"
    | "vendors"
    | "inference"
    | "revenue-share"
    | "balances"
    | "gpu";
type ActiveView = InsightTab | LedgerTab;

const VIEW_SOURCES: Record<ActiveView, readonly DataSource[]> = {
    "op-transactions": ["opTransactions"],
    "op-cloud": ["opCloud"],
    "op-pollen": ["opPollen"],
    "revenue-share-ledger": ["revenueShare"],
    "revenue-share": ["revenueShare", "opTransactions"],
    balances: ["opCloud", "opTransactions"],
    runway: [
        "opTransactions",
        "opCloud",
        "stripeSales",
        "userBalances",
        "privateConfig",
    ],
    close: ["opTransactions", "opCloud", "opPollen", "privateConfig"],
    vendors: ["opTransactions", "opCloud", "opPollen", "privateConfig"],
    inference: ["opTransactions", "opCloud", "opPollen", "privateConfig"],
    gpu: ["opTransactions", "opCloud", "opPollen", "privateConfig"],
};

function initialView(): ActiveView {
    const requested = new URLSearchParams(window.location.search).get("view");
    return requested && Object.hasOwn(VIEW_SOURCES, requested)
        ? (requested as ActiveView)
        : "runway";
}

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
        note: "Stripe sales, Wise bank cash, and forecasts derived from reviewed rules, provider usage, and checked funding.",
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
        id: "revenue-share",
        label: "Revenue Share",
        note: "Community-model and BYOP economics by creator, with Paid and Quest rewards kept separate.",
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
        note: "Checked prepaid and promotional-credit snapshots, one row per account, with access and collection status.",
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
    source: DataSource;
    codes: ProvenanceCode[];
    pipe: string;
    rows: (data: Data) => number;
};

const TABS = [
    {
        id: "op-transactions",
        source: "opTransactions",
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
        source: "opCloud",
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
        source: "opPollen",
        label: "Pollen",
        codes: ["TB"],
        pipe: "economics_pollen_usage_api",
        note: "Monthly canonical vendor and internal-model usage with Paid/Quest customer price, metered cost, ecosystem shares, and request counts.",
        icon: DatabaseIcon,
        rows: (data) =>
            (data.opPollen ?? []).filter((row) => row.month >= WINDOW_START)
                .length,
    },
    {
        id: "revenue-share-ledger",
        source: "revenueShare",
        label: "Revenue Share",
        codes: ["TB"],
        pipe: "economics_revenue_share_api",
        note: "Monthly creator-earning ledger by creator and App or Community Model. Paid and Quest earnings remain separate; associated usage can overlap when one request has both source types.",
        icon: DatabaseIcon,
        rows: (data) =>
            (data.revenueShare ?? []).filter(
                (row) => row.row_type === "source" && row.month >= WINDOW_START,
            ).length,
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
        const count = data?.[item.source] != null ? item.rows(data) : null;
        const title = `${codesLabel(item.codes)}${item.pipe}${count != null ? ` · ${count} rows` : ""}\n${item.note}`;

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
                    Vendor-month totals are authoritative. Model costs use exact
                    matched provider evidence; unmatched costs remain
                    unallocated.
                </InfoLine>
                <InfoLine>
                    Result is retained Paid minus cash and consumed credits.
                    Performance divides that result by retained Paid; cost
                    checks remain at vendor level.
                </InfoLine>
            </span>
        );
    }
    if (activeView === "revenue-share") {
        return (
            <span className="block max-w-72">
                <strong>Revenue Share</strong>
                <InfoLine>
                    One row per creator combines their BYOP apps and Community
                    models. Each request is associated with every creator whose
                    app or model participated.
                </InfoLine>
                <InfoLine>
                    Pollinations profit is Paid usage minus every creator
                    earning and the external model cost. The summary cards count
                    each request once even when two creators participated.
                </InfoLine>
                <InfoLine>
                    Quest creator earnings remain non-cashable. Settlements are
                    shown only after a completed Bank movement is explicitly
                    classified as a creator payout.
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
                    Cash change and balance come from the Wise-backed Bank
                    ledger. Stripe payouts affect cash, never P&amp;L revenue.
                </InfoLine>
                <InfoLine>
                    The current month keeps bank movements and the authored
                    full-month plan in separate columns.
                </InfoLine>
                <InfoLine>
                    Revenue separates Pollen and Ko-fi sales, refunds, and
                    reversals. Processing fees are an Operations expense; other
                    expense categories remain cash-based. Expand a category to
                    see its vendor detail.
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

async function checkSession() {
    const res = await fetch("/api/auth/session");
    if (!res.ok) return false;
    const body = (await res.json()) as { authenticated?: boolean };
    return body.authenticated === true;
}

async function login(password: string) {
    const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
    });
    if (!res.ok) {
        throw new Error(res.status === 401 ? "Wrong password" : "Login failed");
    }
}

function PasswordGate({
    error,
    onSubmit,
}: {
    error: string | null;
    onSubmit: (password: string) => void;
}) {
    const [value, setValue] = useState("");

    return (
        <div className="mx-auto mt-24 flex max-w-md flex-col gap-4 px-4">
            <Heading as="h1">Economics</Heading>
            <Text tone="soft">
                Enter the economics password. Tinybird tokens stay on the
                server.
            </Text>
            {error && <Alert intent="warning">{error}</Alert>}
            <form
                className="flex gap-2"
                onSubmit={(event) => {
                    event.preventDefault();
                    if (value) onSubmit(value);
                }}
            >
                <Input
                    type="password"
                    autoFocus
                    placeholder="Password"
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                    className="flex-1"
                />
                <Button type="submit" className="self-start">
                    Connect
                </Button>
            </form>
        </div>
    );
}

export default function App() {
    const fixtures = fixturesMode();
    const [authenticated, setAuthenticated] = useState(fixtures);
    const [sessionChecked, setSessionChecked] = useState(fixtures);
    const [authError, setAuthError] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<Data | null>(null);
    const [activeView, setActiveView] = useState<ActiveView>(initialView);
    const [loadedView, setLoadedView] = useState<ActiveView | null>(null);
    const [loading, setLoading] = useState(false);
    const [selectedMonth, setSelectedMonth] = useState(() => {
        const month =
            new URLSearchParams(window.location.search).get("month") ?? "";
        return isMonthKey(month) ? month : "";
    });
    const [runwayYear, setRunwayYear] = useState("2026");
    const [selectedVendors, setSelectedVendors] = useState<string[]>([]);
    const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
    const [attempt, setAttempt] = useState(0);
    const ready = fixtures || (sessionChecked && authenticated);

    useEffect(() => {
        if (fixtures) return;

        let cancelled = false;
        checkSession()
            .then((ok) => {
                if (!cancelled) {
                    setAuthenticated(ok);
                    setSessionChecked(true);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setAuthenticated(false);
                    setSessionChecked(true);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [fixtures]);

    useEffect(() => {
        if (!ready) return;

        const retryKey = attempt;
        let cancelled = false;
        const controller = new AbortController();
        setError(null);
        setLoading(true);
        setLoadedView(null);
        loadAll(VIEW_SOURCES[activeView], controller.signal)
            .then((loaded) => {
                if (!cancelled && retryKey === attempt) {
                    setData(loaded);
                    setLoadedView(activeView);
                    setLoading(false);
                }
            })
            .catch((caught: unknown) => {
                if (cancelled || retryKey !== attempt) return;
                setLoading(false);

                if (caught instanceof TbError && caught.status === 401) {
                    checkSession()
                        .then((valid) => {
                            if (cancelled) return;
                            if (valid)
                                setError(
                                    `${caught.message}. Tinybird access failed; the Economics session is still valid.`,
                                );
                            else {
                                setAuthenticated(false);
                                setSessionChecked(true);
                                setAuthError(
                                    "Your Economics session expired. Sign in again.",
                                );
                            }
                        })
                        .catch(() => {
                            if (!cancelled)
                                setError(
                                    "Unable to verify the Economics session. Retry when the connection is available.",
                                );
                        });
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
            controller.abort();
        };
    }, [ready, attempt, activeView]);

    useEffect(() => {
        const url = new URL(window.location.href);
        url.searchParams.set("view", activeView);
        if (selectedMonth) url.searchParams.set("month", selectedMonth);
        window.history.replaceState(null, "", url);
    }, [activeView, selectedMonth]);

    const viewData =
        !error && loadedView === activeView && !loading ? data : null;

    const months = reportingMonths();
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

    if (!sessionChecked) {
        return (
            <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-app-bg font-body text-theme-text-strong">
                <ScrollArea axis="y" className="min-h-0 flex-1">
                    <div className="mx-auto mt-24 max-w-md px-4">
                        <Text tone="soft">Checking session...</Text>
                    </div>
                </ScrollArea>
            </div>
        );
    }

    if (!ready) {
        return (
            <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-app-bg font-body text-theme-text-strong">
                <ScrollArea axis="y" className="min-h-0 flex-1">
                    <PasswordGate
                        error={authError}
                        onSubmit={(password) => {
                            login(password)
                                .then(() => {
                                    setAuthError(null);
                                    setAuthenticated(true);
                                    setSessionChecked(true);
                                    setAttempt((current) => current + 1);
                                })
                                .catch((caught: unknown) => {
                                    setAuthError(
                                        caught instanceof Error
                                            ? caught.message
                                            : String(caught),
                                    );
                                });
                        }}
                    />
                </ScrollArea>
            </div>
        );
    }

    const drawerFooter = (
        <>
            <div className="flex flex-wrap items-center gap-2">
                {fixtures && <Chip intent="alpha">fixtures</Chip>}
            </div>
            <div className="flex items-center justify-between gap-2">
                <Button
                    size="sm"
                    disabled={loading}
                    onClick={() => setAttempt((value) => value + 1)}
                >
                    {loading ? "Refreshing…" : "Refresh"}
                </Button>
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
            {!error && !viewData && <Text tone="soft">Loading this view…</Text>}
            <ErrorBoundary
                resetKey={`${activeView}:${selectedYear}:${monthFilter}:${runwayYear}:${selectedVendors.join(",")}:${selectedCategories.join(",")}`}
            >
                {viewData && activeView === "op-transactions" && (
                    <OpTransactionsTab
                        category={selectedCategories}
                        data={viewData}
                        month={monthFilter}
                        vendor={selectedVendors}
                    />
                )}
                {viewData && activeView === "op-pollen" && (
                    <OpPollenTab
                        data={viewData}
                        month={monthFilter}
                        vendor={selectedVendors}
                    />
                )}
                {viewData && activeView === "op-cloud" && (
                    <OpCloudTab
                        data={viewData}
                        month={monthFilter}
                        vendor={selectedVendors}
                    />
                )}
                {viewData && activeView === "revenue-share-ledger" && (
                    <RevenueShareLedgerTab
                        data={viewData}
                        month={monthFilter}
                    />
                )}
                {viewData && activeView === "close" && (
                    <ProviderCloseTab
                        data={viewData}
                        month={monthFilter}
                        months={months}
                        year={selectedYear}
                        onMonthChange={setSelectedMonth}
                    />
                )}
                {viewData && activeView === "runway" && (
                    <RunwayTab data={viewData} year={runwayYear} />
                )}
                {viewData && activeView === "vendors" && (
                    <VendorsTab data={viewData} month={monthFilter} />
                )}
                {viewData && activeView === "inference" && (
                    <ManagedInferenceTab data={viewData} month={monthFilter} />
                )}
                {viewData && activeView === "balances" && (
                    <BalancesTab data={viewData} />
                )}
                {viewData && activeView === "revenue-share" && (
                    <RevenueShareTab data={viewData} month={monthFilter} />
                )}
                {viewData && activeView === "gpu" && (
                    <GpuTab data={viewData} month={monthFilter} />
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
