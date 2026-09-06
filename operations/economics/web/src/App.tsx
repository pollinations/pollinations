import {
    Alert,
    Button,
    ChevronIcon,
    Chip,
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
import { providerAccountBalanceRows } from "./lib/providerBalances";
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
    // Ledger-like insight views show their row count once `source` is loaded.
    source?: DataSource;
    rows?: (data: Data) => number;
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
        label: "Providers",
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
        label: "Rev share",
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
        icon: DatabaseIcon,
        source: "opCloud",
        rows: (data) => providerAccountBalanceRows(data, new Date()).length,
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
        label: "Vendor",
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
        label: "Rev share",
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

const LEDGER_SOURCES = TABS.map((item) => item.source);

// Fill the ledger sources missing from `target` with the ones `donor` holds.
function withLedgerSources(target: Data, donor: Data | null): Data {
    if (!donor) return target;
    const filled = { ...target };
    for (const source of LEDGER_SOURCES) {
        if (filled[source] == null && donor[source] != null) {
            (filled as Record<DataSource, unknown>)[source] = donor[source];
        }
    }
    return filled;
}

function isLedgerTab(value: ActiveView): value is LedgerTab {
    return TABS.some((item) => item.id === value);
}

const NAV_COLLAPSED_KEY = "economics.nav.collapsed";

function readNavCollapsed() {
    try {
        return window.localStorage.getItem(NAV_COLLAPSED_KEY) === "1";
    } catch {
        return false;
    }
}

function writeNavCollapsed(collapsed: boolean) {
    try {
        window.localStorage.setItem(NAV_COLLAPSED_KEY, collapsed ? "1" : "0");
    } catch {
        // Storage can be unavailable; the fold then lasts for the session.
    }
}

function NavMenuButton({
    buttonRef,
    desktopVisible,
    onOpen,
}: {
    buttonRef: RefObject<HTMLButtonElement | null>;
    desktopVisible: boolean;
    onOpen: () => void;
}) {
    return (
        <IconButton
            ref={buttonRef}
            size="md"
            className={cn(
                "fixed left-3 top-3 z-30 bg-surface-opaque text-theme-text-strong shadow-md ring-1 ring-theme-text-strong/10 hover:bg-surface-opaque",
                !desktopVisible && "md:hidden",
            )}
            onClick={onOpen}
        >
            <MenuIcon className="h-5 w-5" />
            <span className="sr-only">Open navigation</span>
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
    const insightItem = (item: DrawerItem<InsightTab>) => {
        const count =
            item.rows && item.source && data?.[item.source] != null
                ? item.rows(data)
                : null;
        return (
            <NavItem
                key={item.id}
                type="button"
                data-theme="accent"
                icon={item.icon}
                active={activeView === item.id}
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
    const rawItem = (item: (typeof TABS)[number]) => {
        const count = data?.[item.source] != null ? item.rows(data) : null;

        return (
            <NavItem
                key={item.id}
                type="button"
                data-theme="accent"
                icon={item.icon}
                active={activeView === item.id}
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
    onCollapse,
    onViewChange,
}: {
    activeView: ActiveView;
    data: Data | null;
    footer: ReactNode;
    onCollapse?: () => void;
    onViewChange: (value: ActiveView) => void;
}) {
    return (
        <aside
            data-theme="neutral"
            className="flex min-h-0 flex-1 flex-col px-2 py-4 md:fixed md:inset-y-0 md:left-0 md:z-30 md:w-60 md:border-r md:border-theme-text-strong/10"
            aria-label="Economics navigation"
        >
            <div className="hidden shrink-0 items-center justify-between gap-2 border-b border-theme-text-strong/10 px-1 pb-4 text-theme-text-strong md:flex">
                <EconomicsBrand size="desktop" />
                {onCollapse && (
                    <IconButton
                        size="sm"
                        className="shrink-0 text-theme-text-soft hover:text-theme-text-strong"
                        onClick={onCollapse}
                    >
                        <ChevronIcon className="h-4 w-4 rotate-90" />
                        <span className="sr-only">Hide navigation</span>
                    </IconButton>
                )}
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
    const [collapsed, setCollapsed] = useState(readNavCollapsed);
    const menuButtonRef = useRef<HTMLButtonElement>(null);

    const setNavCollapsed = (value: boolean) => {
        setCollapsed(value);
        writeNavCollapsed(value);
    };

    const openNav = () => {
        // On desktop the floating button unfolds the sidebar; on mobile it
        // opens the overlay drawer.
        if (collapsed && window.matchMedia("(min-width: 768px)").matches) {
            setNavCollapsed(false);
            return;
        }
        setIsDrawerOpen(true);
    };

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
            <div className={collapsed ? "hidden" : "hidden md:block"}>
                <EconomicsDrawer
                    activeView={activeView}
                    data={data}
                    footer={footer}
                    onCollapse={() => setNavCollapsed(true)}
                    onViewChange={handleViewChange}
                />
            </div>
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
                    >
                        <XIcon className="h-5 w-5" />
                        <span className="sr-only">Close navigation</span>
                    </IconButton>
                </div>
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                    {drawer}
                </div>
            </Drawer>
            <div
                className={cn(
                    "flex min-w-0 flex-1 flex-col",
                    !collapsed && "md:ml-60",
                )}
            >
                <NavMenuButton
                    buttonRef={menuButtonRef}
                    desktopVisible={collapsed}
                    onOpen={openNav}
                />
                <ScrollArea
                    axis="y"
                    className={cn("min-h-0 flex-1", collapsed && "md:pt-10")}
                >
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

function InfoItem({ lead, children }: { lead: string; children: ReactNode }) {
    return (
        <span className="block leading-snug">
            <strong className="font-semibold">{lead}.</strong> {children}
        </span>
    );
}

function ViewInfo({ children }: { children: ReactNode }) {
    return (
        <span className="block w-80 max-w-[85vw] space-y-2.5 text-left">
            {children}
        </span>
    );
}

function viewInfoContent(activeView: ActiveView) {
    if (isLedgerTab(activeView)) {
        const active = TABS.find((item) => item.id === activeView);
        if (!active) return null;
        return (
            <ViewInfo>
                <InfoItem lead="Rows">{active.note}</InfoItem>
                <InfoItem lead="Source">{active.pipe}</InfoItem>
            </ViewInfo>
        );
    }
    if (activeView === "vendors") {
        return (
            <ViewInfo>
                <InfoItem lead="Scope">
                    One vendor-month across managed inference and GPU capacity.
                    Shared infrastructure is excluded.
                </InfoItem>
                <InfoItem lead="Paid and Quest">
                    Paid is retained cash-backed value; Quest is free usage and
                    stays separate. Gross Paid is in the usage-mix hover.
                </InfoItem>
                <InfoItem lead="Mixed modes">
                    Vendor totals hold when a vendor serves both modes; the
                    split stays unallocated until Pollen records delivery mode
                    per request.
                </InfoItem>
                <InfoItem lead="Result">
                    Result and Performance use full vendor cost, consumed
                    credits included.
                </InfoItem>
            </ViewInfo>
        );
    }
    if (activeView === "inference") {
        return (
            <ViewInfo>
                <InfoItem lead="Scope">
                    Managed-inference vendor-months only. The current month is
                    partial; mixed inference and GPU months stay unallocated.
                </InfoItem>
                <InfoItem lead="Paid and Quest">
                    Paid is retained cash-backed value; Quest is free usage and
                    stays separate. Gross Paid is in the usage-mix hover.
                </InfoItem>
                <InfoItem lead="Model costs">
                    Vendor-month totals are authoritative. Models use exact
                    matched provider evidence; unmatched cost stays unallocated.
                </InfoItem>
                <InfoItem lead="Result">
                    Retained Paid minus cash and consumed credits. Performance
                    divides that by retained Paid; cost checks stay at vendor
                    level.
                </InfoItem>
            </ViewInfo>
        );
    }
    if (activeView === "revenue-share") {
        return (
            <ViewInfo>
                <InfoItem lead="Rows">
                    One per creator, combining their BYOP apps and Community
                    models. A request counts for every creator whose app or
                    model took part.
                </InfoItem>
                <InfoItem lead="Profit">
                    Paid usage minus every creator earning and the external
                    model cost. The cards count each request once even when two
                    creators took part.
                </InfoItem>
                <InfoItem lead="Quest and settlements">
                    Quest earnings are not cashable. Settlements appear only
                    after a Bank movement is classified as a creator payout.
                </InfoItem>
            </ViewInfo>
        );
    }
    if (activeView === "close") {
        return (
            <ViewInfo>
                <InfoItem lead="Vendor rows">
                    Archived source coverage, active accounts, and whether usage
                    was cash- or credit-funded.
                </InfoItem>
                <InfoItem lead="Month result">
                    Adds the transaction-document, vendor-mapping,
                    row-integrity, duplicate and FX checks shown in the
                    integrity history below.
                </InfoItem>
                <InfoItem lead="Ready">
                    Means the books are ready to file, not legally filed; e-MTA
                    confirmation is not tracked. Invoices and bank entries stay
                    in Bank.
                </InfoItem>
            </ViewInfo>
        );
    }
    if (activeView === "balances") {
        return (
            <ViewInfo>
                <InfoItem lead="Scope">
                    Current vendor balances; the selected period does not limit
                    this page. Open a vendor for its monthly history.
                </InfoItem>
                <InfoItem lead="Cash prepaid">
                    Payments minus cash-funded usage: a ledger estimate, not a
                    live vendor wallet. Payments and documents stay in Bank.
                </InfoItem>
                <InfoItem lead="Free credit">
                    Recorded grants minus credit-funded usage and expired
                    capacity.
                </InfoItem>
            </ViewInfo>
        );
    }
    if (activeView === "runway") {
        return (
            <ViewInfo>
                <InfoItem lead="Cash">
                    Cash change and Cash balance are the Wise bank ledger. The
                    forecast columns and running cash stay cash-based.
                </InfoItem>
                <InfoItem lead="Revenue">
                    What entered Stripe in the month, net of Stripe fees, with
                    refunds and reversals on one line. Wise payouts are cash
                    only and are not reconciled against it.
                </InfoItem>
                <InfoItem lead="Expenses">
                    Compute and Infrastructure come from the vendor ledger by
                    service month; every other category is bank cash. Expand a
                    category for its vendors.
                </InfoItem>
                <InfoItem lead="Gray figures">
                    Usage paid with provider credits, shown in parentheses
                    beside the cash figure. Not cash, never in the sums.
                </InfoItem>
                <InfoItem lead="Not reconciled">
                    Unpaid bills, prepaid balances and the Stripe float stay out
                    of the table, so the lines do not add up to Cash change. A
                    paid vendor without ledger rows is a warning, never a cash
                    fallback.
                </InfoItem>
                <InfoItem lead="Current month">
                    Bank movements to date and the full-month plan sit in
                    separate columns.
                </InfoItem>
            </ViewInfo>
        );
    }
    if (activeView === "gpu") {
        return (
            <ViewInfo>
                <InfoItem lead="Cards">
                    The selected month at vendor-pool level: retained Paid,
                    Quest usage, cash, consumed credits, full-cost result.
                </InfoItem>
                <InfoItem lead="Table">
                    One row per verified workload. Expand one for every billed
                    GPU resource with its usage and cost.
                </InfoItem>
                <InfoItem lead="Result">
                    Retained Paid minus the full mapped workload cost.
                    Efficiency is that result divided by retained Paid.
                </InfoItem>
                <InfoItem lead="Limits">
                    Pollen does not identify the serving replica, so efficiency
                    stays at workload level. Unknown short-lived resources and
                    shared overhead stay visible instead of being guessed.
                </InfoItem>
            </ViewInfo>
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
                if (cancelled || retryKey !== attempt) return;
                // Keep the ledger sources already in memory so the row-count
                // chips stay populated across view switches.
                let merged = loaded;
                setData((current) => {
                    merged = withLedgerSources(loaded, current);
                    return merged;
                });
                setLoadedView(activeView);
                setLoading(false);
                const missing = LEDGER_SOURCES.filter(
                    (source) => merged[source] == null,
                );
                if (missing.length === 0) return;
                loadAll(missing, controller.signal)
                    .then((extra) => {
                        if (cancelled || retryKey !== attempt) return;
                        setData((current) =>
                            current
                                ? withLedgerSources(current, extra)
                                : current,
                        );
                    })
                    .catch(() => {
                        // Counts stay hidden for the sources that failed; the
                        // active view is unaffected.
                    });
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
            <div className="flex items-center justify-end gap-2">
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
