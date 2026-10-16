import {
    Alert,
    AppBrand,
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
    MenuIcon,
    NavItem,
    RocketIcon,
    ScrollArea,
    SproutIcon,
    Switch,
    Text,
    Tooltip,
    UsageIcon,
    WalletIcon,
    WarningIcon,
    XIcon,
} from "@pollinations/ui";
import { DashboardAccountMenu } from "@pollinations/ui/auth";
import {
    type ComponentType,
    type ReactNode,
    type RefObject,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { signOut } from "./auth";
import { ErrorBoundary } from "./components/ErrorBoundary";
import {
    FilterBar,
    FilterMultiSelect,
    MonthFilter,
    YearFilter,
} from "./components/Filters";
import { dataConfidence } from "./lib/dataConfidence";
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
import {
    RECONCILIATION_PAGES,
    type ReconciliationPage,
    reconciliationState,
} from "./lib/reconciliation";
import { type DataSource, fixturesMode, loadAll, TbError } from "./lib/tb";
import { trendPeriod } from "./lib/trends";
import { unitEconomicsReport } from "./lib/unitEconomics";
import type { Data } from "./types";
import { AssumptionsTab } from "./views/AssumptionsTab";
import { BalancesTab } from "./views/CreditsTab";
import { GpuTab } from "./views/GpuTab";
import { OpPollenTab } from "./views/OpPollenTab";
import { OpTransactionsTab } from "./views/OpTransactionsTab";
import { ReconciliationTab } from "./views/ReconciliationTab";
import { RevenueShareLedgerTab } from "./views/RevenueShareLedgerTab";
import { RevenueShareTab } from "./views/RevenueShareTab";
import { RunwayTab } from "./views/RunwayTab";
import { SalesLedgerTab } from "./views/SalesLedgerTab";
import { TrendsTab } from "./views/TrendsTab";
import { ManagedInferenceTab, VendorsTab } from "./views/UnitEconomicsTab";
import { VendorLedgerTab } from "./views/VendorLedgerTab";

type AccountUser = {
    email: string;
    name?: string;
    picture?: string | null;
    preferred_username?: string;
};

type InsightTab =
    | "trends"
    | "close"
    | "runway"
    | "vendors"
    | "inference"
    | "revenue-share"
    | "balances"
    | "assumptions"
    | "gpu";
type ActiveView = InsightTab | LedgerTab;

const VIEW_SOURCES: Record<ActiveView, readonly DataSource[]> = {
    sales: ["stripeSales"],
    "op-transactions": ["opTransactions"],
    "vendor-ledger": ["vendorLedger"],
    "op-pollen": ["opPollen"],
    "revenue-share-ledger": ["revenueShare"],
    "revenue-share": ["revenueShare", "opTransactions"],
    balances: ["vendorLedger", "opTransactions"],
    assumptions: ["privateConfig"],
    trends: [
        "opTransactions",
        "vendorLedger",
        "stripeSales",
        "opPollen",
        "revenueShare",
    ],
    runway: [
        "opTransactions",
        "vendorLedger",
        "stripeSales",
        "userBalances",
        "privateConfig",
    ],
    close: ["opTransactions", "vendorLedger", "opPollen", "privateConfig"],
    vendors: ["opTransactions", "vendorLedger", "opPollen", "privateConfig"],
    inference: ["opTransactions", "vendorLedger", "opPollen", "privateConfig"],
    gpu: ["opTransactions", "vendorLedger", "opPollen", "privateConfig"],
};

const RECONCILE_MODE_KEY = "economics.reconcile";

function readReconcileMode() {
    try {
        return window.localStorage.getItem(RECONCILE_MODE_KEY) === "1";
    } catch {
        return false;
    }
}

function isReconcileView(view: ActiveView) {
    return (
        isLedgerTab(view) ||
        view === "close" ||
        view === "balances" ||
        view === "assumptions"
    );
}

function initialView(): ActiveView {
    const requested = new URLSearchParams(window.location.search).get("view");
    const view =
        requested && Object.hasOwn(VIEW_SOURCES, requested)
            ? (requested as ActiveView)
            : "runway";
    return isReconcileView(view) && !readReconcileMode() ? "runway" : view;
}

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
        id: "trends",
        label: "Trends",
        note: "Monthly sales, costs and operating results with and without cloud credits.",
        icon: UsageIcon,
    },
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
    {
        id: "close",
        label: "Reconciliation",
        note: "Missing numbers, account coverage and documents, with affected months and calculations.",
        icon: EyeIcon,
    },
] satisfies readonly DrawerItem<InsightTab>[];

const LEDGER_INSIGHT_TABS = [
    {
        id: "assumptions",
        label: "Planning & review",
        note: "Planning assumptions and source review notes. Financial facts live in the ledgers; reconciliation is derived.",
        icon: DatabaseIcon,
        source: "privateConfig",
    },
    {
        id: "balances",
        label: "Balances",
        note: "Checked prepaid and promotional-credit snapshots, one row per account, with access and collection status.",
        icon: DatabaseIcon,
        source: "vendorLedger",
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
        id: "sales",
        source: "stripeSales",
        label: "Sales",
        codes: ["ST"],
        pipe: "economics_stripe_sales_api",
        note: "Monthly Stripe sales by stream and settlement currency. Net after fees subtracts refunds, reversals and fees from gross sales; bank payouts remain in Bank. Coverage is confirmed only when all required accounts cover the full month. Fraud classifications are attached to their original Stripe transactions; they do not change actual deductions.",
        icon: DatabaseIcon,
        rows: (data) =>
            (data.stripeSales ?? []).filter((row) => row.month >= WINDOW_START)
                .length,
    },
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
        id: "vendor-ledger",
        source: "vendorLedger",
        label: "Vendor",
        codes: ["API", "CLI", "BQ", "HC", "INV", "EXP", "ING", "AGT"],
        pipe: "economics_vendor_ledger_api",
        note: "Compute and infrastructure usage facts, including inference, GPUs, grants, and credit burn. Paid and burn values are signed; positive credit is a grant award.",
        icon: DatabaseIcon,
        rows: (data) =>
            [
                ...(data.vendorLedger ?? []),
                ...(data.vendorStatements ?? []),
                ...(data.vendorPlans ?? []),
            ].filter(
                (row) =>
                    row.type === "planned" ||
                    row.start.slice(0, 7) >= WINDOW_START,
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
                "fixed left-3 top-3 z-30 bg-surface-menu/80 text-theme-text-strong backdrop-blur-md hover:bg-surface-menu",
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
    reconcileMode,
    activeView,
    data,
    onViewChange,
}: {
    reconcileMode: boolean;
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
                {INSIGHT_TABS.filter(
                    (item) => reconcileMode || !isReconcileView(item.id),
                ).map(insightItem)}
            </DrawerGroup>
            {reconcileMode && (
                <DrawerGroup label="Ledgers">
                    {LEDGER_INSIGHT_TABS.map(insightItem)}
                    {TABS.map(rawItem)}
                </DrawerGroup>
            )}
        </nav>
    );
}

function EconomicsDrawer({
    reconcileMode,
    activeView,
    data,
    footer,
    onCollapse,
    onViewChange,
}: {
    reconcileMode: boolean;
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
                <AppBrand appName="Economics" />
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
                    reconcileMode={reconcileMode}
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
    reconcileMode,
    activeView,
    children,
    data,
    footer,
    onViewChange,
}: {
    reconcileMode: boolean;
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
            reconcileMode={reconcileMode}
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
                    reconcileMode={reconcileMode}
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
                    <AppBrand appName="Economics" size="sm" />
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
        <span className="block max-w-full space-y-2.5 text-left">
            {children}
        </span>
    );
}

// The one explanatory hover per page: the "i" next to the title. Wider than
// the default tooltip and clamped to the viewport, since it sits at the
// right edge of the page.
function PageTip({ content, label }: { content: ReactNode; label: string }) {
    return (
        <Tooltip content={content} ariaLabel={label} maxWidth={380}>
            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-theme-border bg-theme-bg-active font-bold text-[10px] text-theme-text-strong leading-none transition-colors hover:bg-theme-bg-hover">
                i
            </span>
        </Tooltip>
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
                    Cards show consumed Paid and Quest value. Retained is after
                    creator shares; Quest is free usage.
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
                    Cards show consumed Paid and Quest value. Retained is after
                    creator shares; Quest is free usage.
                </InfoItem>
                <InfoItem lead="Model costs">
                    Vendor-month totals are authoritative. Models use exact
                    matched provider evidence; unmatched cost stays unallocated.
                </InfoItem>
                <InfoItem lead="Result">
                    Retained minus cash and consumed credits. Performance
                    divides that by retained; cost checks stay at vendor level.
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
                <InfoItem lead="Items">
                    One item per provider and month across the selected year,
                    grouped by issue type with links to the affected pages.
                </InfoItem>
                <InfoItem lead="Order">
                    Issue groups keep each item in one place. Headers sort
                    within each group. Related amounts help prioritize; they are
                    not a measured error in profit.
                </InfoItem>
                <InfoItem lead="Scope">
                    Potential changes to totals, validation of recorded amounts,
                    and model/GPU allocation are separate. Unresolved amounts
                    are sorted largest first; unknowns remain explicit. Billing
                    estimates are shown on Runway.
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
    if (activeView === "trends") {
        return (
            <ul className="list-disc space-y-1 pl-4 text-left">
                <li>
                    Completed months · USD unless marked Pollen. Revenue is
                    after deductions.
                </li>
                <li>
                    Product: sales less Compute and Infrastructure. Whole
                    company: the same sales less every expense, including
                    Compute and Infrastructure. Credits apply in both views.
                </li>
                <li>
                    Expense curves: full costs before credits. Click a legend
                    label to hide or show a category.
                </li>
                <li>
                    Percentages: change in recorded amounts from the previous
                    month, divided by its absolute value. Blue means an
                    increase; red means a decrease. No percentage when the
                    previous value is zero or missing.
                </li>
                <li>Sales: customer payments before and after deductions.</li>
                <li>Pollen consumed is usage, not sales or provider cost.</li>
                <li>
                    Quest costs: known allocation by metered usage; part of
                    Compute, not an extra expense. Unallocated and missing costs
                    are excluded.
                </li>
                <li>
                    Bars: actual results. Diamonds: results excluding identified
                    fraud losses and dispute fees from earlier sales; breakdown
                    in Sales.
                </li>
                <li>
                    Gaps represent unavailable figures. Details are in
                    Reconciliation.
                </li>
            </ul>
        );
    }
    if (activeView === "runway") {
        return (
            <ul className="list-disc space-y-1 pl-4 text-left">
                <li>All amounts are in USD.</li>
                <li>Revenue: Stripe sales, counted by calendar month.</li>
                <li>
                    Fees, refunds and reversals: deducted in the month recorded.
                </li>
                <li>
                    Cash balance: month-end; “To date” uses imported bank
                    entries.
                </li>
                <li>Plan: future estimates. Parentheses: provider credits.</li>
            </ul>
        );
    }
    if (activeView === "gpu") {
        return (
            <ViewInfo>
                <InfoItem lead="Cards">
                    The selected month at vendor-pool level: retained, Quest
                    usage, cash, consumed credits, full-cost result.
                </InfoItem>
                <InfoItem lead="Table">
                    One row per verified workload. Expand one for every billed
                    GPU resource with its usage and cost.
                </InfoItem>
                <InfoItem lead="Result">
                    Retained minus the full mapped workload cost. Efficiency is
                    that result divided by retained.
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

export default function App({ accountUser }: { accountUser: AccountUser }) {
    return <Dashboard accountUser={accountUser} />;
}

function Dashboard({ accountUser }: { accountUser: AccountUser }) {
    const fixtures = fixturesMode();
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<Data | null>(null);
    const [reconcileMode, setReconcileMode] = useState(readReconcileMode);
    const [activeView, setActiveView] = useState<ActiveView>(initialView);
    const toggleReconcileMode = (enabled: boolean) => {
        setReconcileMode(enabled);
        if (!enabled && isReconcileView(activeView)) setActiveView("runway");
        try {
            window.localStorage.setItem(
                RECONCILE_MODE_KEY,
                enabled ? "1" : "0",
            );
        } catch {
            // The toggle still works when browser storage is unavailable.
        }
    };
    const [loadedView, setLoadedView] = useState<ActiveView | null>(null);
    const [loading, setLoading] = useState(false);
    const [selectedMonth, setSelectedMonth] = useState(() => {
        const month =
            new URLSearchParams(window.location.search).get("month") ?? "";
        return isMonthKey(month) ? month : "";
    });
    const [runwayYear, setRunwayYear] = useState("2026");
    const [trendMonths, setTrendMonths] = useState<3 | 6 | 12>(6);
    const [selectedVendors, setSelectedVendors] = useState<string[]>([]);
    const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
    const [attempt, setAttempt] = useState(0);
    const [reconciliationFrom, setReconciliationFrom] =
        useState<ReconciliationPage | null>(null);

    useEffect(() => {
        const retryKey = attempt;
        let cancelled = false;
        const controller = new AbortController();
        setError(null);
        setLoading(true);
        setLoadedView(null);
        loadAll(
            [
                ...new Set([
                    ...VIEW_SOURCES[activeView],
                    "opTransactions",
                    "vendorLedger",
                    "opPollen",
                    "stripeSales",
                    "privateConfig",
                ]),
            ] as DataSource[],
            controller.signal,
        )
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
                    window.location.reload();
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
    }, [attempt, activeView]);

    useEffect(() => {
        const url = new URL(window.location.href);
        url.searchParams.set("view", activeView);
        if (selectedMonth) url.searchParams.set("month", selectedMonth);
        window.history.replaceState(null, "", url);
    }, [activeView, selectedMonth]);

    const viewData =
        !error && loadedView === activeView && !loading ? data : null;

    const reconciliation = useMemo(
        () => (viewData ? reconciliationState(viewData) : null),
        [viewData],
    );
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
        activeView !== "balances" &&
        activeView !== "assumptions" &&
        activeView !== "runway" &&
        activeView !== "trends" &&
        activeView !== "close";
    const showRunwayYearFilter = activeView === "runway";
    const showTopMonthFilter = showPeriodFilter;
    const showCategoryFilter = activeView === "op-transactions";
    const hasFilters =
        showPeriodFilter ||
        showRunwayYearFilter ||
        showVendorFilter ||
        showCategoryFilter;

    const drawerFooter = (
        <>
            <div className="flex items-center justify-between gap-3 px-2 text-sm text-theme-text-soft">
                <span>Reconcile mode</span>
                <Switch
                    size="sm"
                    ariaLabel="Reconcile mode"
                    checked={reconcileMode}
                    onChange={toggleReconcileMode}
                />
            </div>
            {accountUser && (
                <DashboardAccountMenu
                    user={accountUser}
                    onSignOut={signOut}
                    className="polli:w-full"
                    side="top"
                />
            )}
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
    const trendWindow = trendPeriod(trendMonths);
    const relevantIssues =
        reconciliation?.issues.filter(
            (row) =>
                row.affects.includes(activeView as ReconciliationPage) &&
                (activeView === "balances"
                    ? true
                    : activeView === "runway"
                      ? row.month.startsWith(runwayYear)
                      : activeView === "trends"
                        ? row.month >= trendWindow.start &&
                          row.month <= trendWindow.end
                        : row.month === monthFilter),
        ) ?? [];
    const confidenceReport = useMemo(
        () =>
            viewData && (activeView === "inference" || activeView === "vendors")
                ? unitEconomicsReport(viewData, monthFilter, activeView)
                : null,
        [viewData, activeView, monthFilter],
    );
    const confidence = dataConfidence(relevantIssues, confidenceReport);
    const confidencePeriod =
        activeView === "balances"
            ? "Latest balances"
            : activeView === "runway"
              ? runwayYear
              : activeView === "trends"
                ? `${trendWindow.start} – ${trendWindow.end}`
                : monthFilter;
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
                {viewData && activeView === "sales" && (
                    <SalesLedgerTab data={viewData} month={monthFilter} />
                )}
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
                {viewData && activeView === "vendor-ledger" && (
                    <VendorLedgerTab
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
                    <ReconciliationTab
                        key={`${selectedYear}:${reconciliationFrom}`}
                        issues={reconciliation?.issues ?? []}
                        acceptedExceptions={
                            reconciliation?.acceptedExceptions ?? []
                        }
                        year={selectedYear}
                        initialPage={reconciliationFrom}
                        onOpen={(page, month) => {
                            setSelectedMonth(month);
                            if (page === "runway")
                                setRunwayYear(month.slice(0, 4));
                            if (page === "trends") setTrendMonths(12);
                            setActiveView(page);
                        }}
                    />
                )}
                {viewData && activeView === "trends" && (
                    <TrendsTab
                        data={viewData}
                        period={trendMonths}
                        initialMonth={monthFilter}
                        issues={reconciliation?.issues ?? []}
                        onPeriodChange={setTrendMonths}
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
                {viewData && activeView === "assumptions" && (
                    <AssumptionsTab config={viewData.privateConfig} />
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
                reconcileMode={reconcileMode}
                activeView={activeView}
                data={data}
                footer={drawerFooter}
                onViewChange={(value) => {
                    setReconciliationFrom(null);
                    setSelectedVendors([]);
                    setSelectedCategories([]);
                    setActiveView(value);
                }}
            >
                <main className="flex w-full flex-col gap-6 px-4 py-14 pb-32 sm:px-6 sm:py-10 sm:pb-32 md:py-8 lg:px-8">
                    <section className="flex flex-col gap-5">
                        <header className="flex shrink-0 justify-end px-1">
                            <div className="flex min-w-0 flex-wrap items-center justify-end gap-3">
                                {reconcileMode &&
                                    viewData &&
                                    Object.hasOwn(
                                        RECONCILIATION_PAGES,
                                        activeView,
                                    ) && (
                                        <button
                                            type="button"
                                            className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-theme-text-muted underline-offset-4 hover:text-theme-text-strong hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
                                            title={`${confidencePeriod} · ${confidence.detail}`}
                                            aria-label={`${relevantIssues.length} reconciliation items. ${confidencePeriod}. Data confidence: ${confidence.status}. Open reconciliation`}
                                            onClick={() => {
                                                setReconciliationFrom(
                                                    activeView as ReconciliationPage,
                                                );
                                                setActiveView("close");
                                            }}
                                        >
                                            {relevantIssues.length > 0 && (
                                                <WarningIcon className="h-3.5 w-3.5" />
                                            )}
                                            {relevantIssues.length
                                                ? relevantIssues.length
                                                : confidence.status}
                                        </button>
                                    )}
                                <Heading
                                    as="h2"
                                    size="section"
                                    className="truncate text-right"
                                >
                                    {viewTitle}
                                </Heading>
                                {viewInfo && (
                                    <PageTip
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
