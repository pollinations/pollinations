import {
    Alert,
    Button,
    Chip,
    ClockIcon,
    ColorModeToggle,
    cn,
    DatabaseIcon,
    EyeIcon,
    GlobeIcon,
    Heading,
    InfoTip,
    Input,
    MenuIcon,
    NavItem,
    RocketIcon,
    ScrollArea,
    SproutIcon,
    Text,
    UsageIcon,
    useScrollLock,
    WalletIcon,
    XIcon,
} from "@pollinations/ui";
import logoUrl from "@pollinations/ui/brand/mark.svg";
import {
    type ComponentType,
    type CSSProperties,
    type ReactNode,
    type RefObject,
    useCallback,
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
import type { ProvenanceCode } from "./components/Provenance";
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

type Tab = LedgerTab;
type EconomicsSection = "insights" | "raw";
type InsightTab =
    | "close"
    | "runway"
    | "vendors"
    | "inference"
    | "community"
    | "balances"
    | "gpu";

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

const INSIGHT_TABS: {
    id: InsightTab;
    label: string;
    note: string;
    icon: ComponentType<{ className?: string }>;
}[] = [
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

const LEDGER_INSIGHT_TABS: {
    id: InsightTab;
    label: string;
    note: string;
    icon: ComponentType<{ className?: string }>;
}[] = [
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
const TABS: {
    id: Tab;
    label: string;
    codes: ProvenanceCode[];
    pipe: string;
    note: string;
    icon: ComponentType<{ className?: string }>;
    rows: (data: Data) => number;
}[] = [
    {
        id: "op-transactions",
        label: "Bank",
        codes: ["WISE"],
        pipe: "op_transactions_api",
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
        pipe: "op_cloud_api",
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
        pipe: "op_pollen_api",
        note: "Monthly canonical vendor and internal-model usage with Paid/Quest customer price, metered cost, ecosystem shares, and request counts.",
        icon: DatabaseIcon,
        rows: (data) =>
            (data.opPollen ?? []).filter((row) => row.month >= WINDOW_START)
                .length,
    },
];

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
        <button
            ref={buttonRef}
            type="button"
            className="fixed left-3 top-3 z-30 flex h-9 w-9 items-center justify-center rounded-full bg-surface-opaque text-theme-text-strong shadow-md ring-1 ring-theme-text-strong/10 hover:bg-surface-opaque md:hidden"
            onClick={onOpen}
            aria-label="Open navigation"
        >
            <MenuIcon className="h-5 w-5" />
        </button>
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
    data,
    insightTab,
    section,
    tab,
    onInsightTabChange,
    onRawTabChange,
}: {
    data: Data | null;
    insightTab: InsightTab;
    section: EconomicsSection;
    tab: Tab;
    onInsightTabChange: (value: InsightTab) => void;
    onRawTabChange: (value: Tab) => void;
}) {
    const insightItem = (item: DrawerItem<InsightTab>) => (
        <NavItem
            key={item.id}
            type="button"
            data-theme="accent"
            icon={item.icon}
            active={section === "insights" && insightTab === item.id}
            title={item.note}
            onClick={() => onInsightTabChange(item.id)}
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
                active={section === "raw" && tab === item.id}
                title={title}
                onClick={() => onRawTabChange(item.id)}
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
    data,
    footer,
    insightTab,
    section,
    tab,
    onInsightTabChange,
    onRawTabChange,
}: {
    data: Data | null;
    footer: ReactNode;
    insightTab: InsightTab;
    section: EconomicsSection;
    tab: Tab;
    onInsightTabChange: (value: InsightTab) => void;
    onRawTabChange: (value: Tab) => void;
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
                    data={data}
                    section={section}
                    tab={tab}
                    insightTab={insightTab}
                    onRawTabChange={onRawTabChange}
                    onInsightTabChange={onInsightTabChange}
                />
            </ScrollArea>
            <div className="flex shrink-0 flex-col gap-2 border-t border-theme-text-strong/10 px-1 pt-4">
                {footer}
            </div>
        </aside>
    );
}

function EconomicsShell({
    children,
    data,
    footer,
    insightTab,
    section,
    tab,
    onInsightTabChange,
    onRawTabChange,
}: {
    children: ReactNode;
    data: Data | null;
    footer: ReactNode;
    insightTab: InsightTab;
    section: EconomicsSection;
    tab: Tab;
    onInsightTabChange: (value: InsightTab) => void;
    onRawTabChange: (value: Tab) => void;
}) {
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const drawerRef = useRef<HTMLDivElement>(null);
    const menuButtonRef = useRef<HTMLButtonElement>(null);

    useScrollLock(isDrawerOpen);

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

        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape") closeDrawer();
        }

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [closeDrawer, isDrawerOpen]);

    const handleInsightTabChange = (value: InsightTab) => {
        onInsightTabChange(value);
        closeDrawer();
    };
    const handleRawTabChange = (value: Tab) => {
        onRawTabChange(value);
        closeDrawer();
    };

    const drawer = (
        <EconomicsDrawer
            data={data}
            footer={footer}
            section={section}
            tab={tab}
            insightTab={insightTab}
            onRawTabChange={handleRawTabChange}
            onInsightTabChange={handleInsightTabChange}
        />
    );

    return (
        <div
            data-theme="amber"
            className="flex h-dvh min-h-0 overflow-hidden bg-app-bg text-theme-text-strong"
        >
            <div className="hidden md:block">{drawer}</div>
            <div
                ref={drawerRef}
                className={`fixed inset-0 z-40 transition-[visibility] md:hidden ${
                    isDrawerOpen
                        ? "pointer-events-auto visible delay-0"
                        : "pointer-events-none invisible delay-[420ms]"
                }`}
                aria-hidden={!isDrawerOpen}
                inert={!isDrawerOpen}
            >
                <button
                    type="button"
                    className={`absolute inset-0 bg-black/40 transition-opacity duration-[420ms] ease-out ${
                        isDrawerOpen ? "opacity-100" : "opacity-0"
                    }`}
                    onClick={closeDrawer}
                    aria-label="Close navigation"
                />
                <div
                    className={`absolute inset-y-0 left-0 flex w-[min(20rem,86vw)] transform-gpu flex-col overflow-hidden border-r border-theme-text-strong/10 bg-app-bg shadow-xl transition-transform duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform ${
                        isDrawerOpen ? "translate-x-0" : "-translate-x-full"
                    }`}
                >
                    <div className="flex shrink-0 items-center justify-between gap-3 border-b border-theme-text-strong/10 px-4 py-3 text-theme-text-strong">
                        <EconomicsBrand size="drawer" />
                        <button
                            type="button"
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-opaque/70 text-theme-text-strong hover:bg-surface-opaque"
                            onClick={closeDrawer}
                            aria-label="Close navigation"
                        >
                            <XIcon className="h-5 w-5" />
                        </button>
                    </div>
                    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                        {drawer}
                    </div>
                </div>
            </div>
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

function activeViewTitle(
    section: EconomicsSection,
    tab: Tab,
    insightTab: InsightTab,
) {
    if (section === "insights") {
        return (
            ALL_INSIGHT_TABS.find((item) => item.id === insightTab)?.label ?? ""
        );
    }
    return TABS.find((item) => item.id === tab)?.label ?? "";
}

function InfoLine({ children }: { children: ReactNode }) {
    return <span className="block">• {children}</span>;
}

function viewInfoContent(
    section: EconomicsSection,
    tab: Tab,
    insightTab: InsightTab,
) {
    if (section === "raw") {
        const active = TABS.find((item) => item.id === tab);
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

    if (insightTab === "vendors") {
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
    if (insightTab === "inference") {
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
    if (insightTab === "community") {
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
    if (insightTab === "close") {
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
    if (insightTab === "balances") {
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
    if (insightTab === "runway") {
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
    if (insightTab === "gpu") {
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
    const [tab, setTab] = useState<Tab>("op-transactions");
    const [section, setSection] = useState<EconomicsSection>("insights");
    const [insightTab, setInsightTab] = useState<InsightTab>("runway");
    const [selectedYear, setSelectedYear] = useState("");
    const [selectedMonth, setSelectedMonth] = useState("");
    const [runwayYear, setRunwayYear] = useState("2026");
    const [selectedVendors, setSelectedVendors] = useState<string[]>([]);
    const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
    const [attempt, setAttempt] = useState(0);
    const monthFilterInitialized = useRef(false);
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
                    setAuthenticated(false);
                    setSessionChecked(true);
                    setAuthError(
                        `Session rejected (${caught.message}) - enter the password again.`,
                    );
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
    }, [ready, attempt]);

    const months = useMemo(() => (data ? collectMonths(data) : []), [data]);
    const reportingYears = useMemo(() => yearsOf(months), [months]);
    const monthFilter = selectedMonth;
    const rawFacets = useMemo(
        () =>
            data
                ? ledgerFacets(data, tab, {
                      month: monthFilter,
                      vendors: selectedVendors,
                      categories: selectedCategories,
                  })
                : {
                      vendors: [] as FacetOption[],
                      categories: [] as FacetOption[],
                  },
        [data, monthFilter, selectedCategories, selectedVendors, tab],
    );
    const showVendorFilter = section === "raw" && rawFacets.vendors.length > 0;
    const showPeriodFilter =
        (section === "insights" &&
            insightTab !== "balances" &&
            insightTab !== "runway") ||
        section === "raw";
    const showRunwayYearFilter =
        section === "insights" && insightTab === "runway";
    const showTopMonthFilter =
        showPeriodFilter && !(section === "insights" && insightTab === "close");
    const showCategoryFilter = section === "raw" && tab === "op-transactions";
    const hasFilters =
        showPeriodFilter ||
        showRunwayYearFilter ||
        showVendorFilter ||
        showCategoryFilter;
    const categoryOptions = rawFacets.categories;

    useEffect(() => {
        if (!monthFilterInitialized.current && months.length > 0) {
            monthFilterInitialized.current = true;
            const initialMonth = latestClosedMonth(months);
            setSelectedMonth(initialMonth ?? "");
            setSelectedYear(initialMonth?.slice(0, 4) ?? "");
            return;
        }
        if (selectedMonth && !months.includes(selectedMonth)) {
            const fallback = latestClosedMonth(months);
            setSelectedMonth(fallback ?? "");
            setSelectedYear(fallback?.slice(0, 4) ?? "");
        }
    }, [months, selectedMonth]);

    if (!sessionChecked) {
        return (
            <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-app-bg text-theme-text-strong">
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
            <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-app-bg text-theme-text-strong">
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
                <span />
                <ColorModeToggle />
            </div>
        </>
    );
    const viewTitle = activeViewTitle(section, tab, insightTab);
    const viewInfo = viewInfoContent(section, tab, insightTab);
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
                        setSelectedYear(year);
                        const yearMonths = months.filter((month) =>
                            month.startsWith(year),
                        );
                        if (!selectedMonth.startsWith(year)) {
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
                    value={selectedMonth}
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
                        options={categoryOptions}
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
                resetKey={`${section}:${tab}:${insightTab}:${selectedYear}:${selectedMonth}:${runwayYear}:${selectedVendors.join(",")}:${selectedCategories.join(",")}`}
            >
                {data && section === "raw" && tab === "op-transactions" && (
                    <OpTransactionsTab
                        category={selectedCategories}
                        data={data}
                        month={monthFilter}
                        vendor={selectedVendors}
                    />
                )}
                {data && section === "raw" && tab === "op-pollen" && (
                    <OpPollenTab
                        data={data}
                        month={monthFilter}
                        vendor={selectedVendors}
                    />
                )}
                {data && section === "raw" && tab === "op-cloud" && (
                    <OpCloudTab
                        data={data}
                        month={monthFilter}
                        vendor={selectedVendors}
                    />
                )}
                {data && section === "insights" && insightTab === "close" && (
                    <ProviderCloseTab
                        data={data}
                        month={monthFilter}
                        months={months}
                        year={selectedYear}
                        onMonthChange={setSelectedMonth}
                    />
                )}
                {data && section === "insights" && insightTab === "runway" && (
                    <RunwayTab data={data} year={runwayYear} />
                )}
                {data && section === "insights" && insightTab === "vendors" && (
                    <VendorsTab data={data} month={monthFilter} />
                )}
                {data &&
                    section === "insights" &&
                    insightTab === "inference" && (
                        <ManagedInferenceTab data={data} month={monthFilter} />
                    )}
                {data &&
                    section === "insights" &&
                    insightTab === "balances" && <BalancesTab data={data} />}
                {data &&
                    section === "insights" &&
                    insightTab === "community" && (
                        <CommunityTab data={data} month={monthFilter} />
                    )}
                {data && section === "insights" && insightTab === "gpu" && (
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
                data={data}
                footer={drawerFooter}
                section={section}
                tab={tab}
                insightTab={insightTab}
                onRawTabChange={(value) => {
                    setSelectedVendors([]);
                    setSelectedCategories([]);
                    setSection("raw");
                    setTab(value);
                }}
                onInsightTabChange={(value) => {
                    setSelectedVendors([]);
                    setSelectedCategories([]);
                    setSection("insights");
                    setInsightTab(value);
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
