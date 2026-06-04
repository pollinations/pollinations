import { PolliProvider, useAuthActions } from "@pollinations/sdk/react";
import {
    AppIcon,
    BookIcon,
    Button,
    ExternalLinkButton,
    LockIcon,
    Surface,
    TabButton,
    type ThemeName,
    TokensIcon,
    TrendUpIcon,
    themes,
    WalletIcon,
} from "@pollinations/ui";
import logoWordmarkUrl from "@pollinations/ui/assets/logo-wordmark.svg";
import {
    LoginButton,
    LogoutButton,
    UserAvatar,
    UserEmail,
    UserName,
    WhenLoggedIn,
    WhenLoggedOut,
} from "@pollinations/ui/auth/sdk";
import {
    Balance,
    KeyBudget,
    KeyExpiry,
    KeyModels,
    KeyPrefix,
} from "@pollinations/ui/wallet/sdk";
import {
    type ComponentType,
    type CSSProperties,
    createContext,
    lazy,
    type ReactNode,
    Suspense,
    useContext,
    useEffect,
    useState,
} from "react";

// Publishable key for this showcase (pk_* is safe to commit).
// Created via `polli keys create --type publishable` with redirect URIs
// http://localhost:5173 and https://react.pollinations.ai.
const APP_KEY = "pk_kZRl8saq8s2h9ome";

const DesignShowcase = lazy(() =>
    import("./showcase/DesignShowcase").then((module) => ({
        default: module.DesignShowcase,
    })),
);

const brandWordmarkMask: CSSProperties = {
    WebkitMask: `url(${logoWordmarkUrl}) center / contain no-repeat`,
    mask: `url(${logoWordmarkUrl}) center / contain no-repeat`,
};

const ThemeContext = createContext<ThemeName>("blue");

function useAppTheme() {
    return useContext(ThemeContext);
}

type AppView = "react" | "showcase";

const APP_VIEWS: { id: AppView; label: string }[] = [
    { id: "react", label: "React" },
    { id: "showcase", label: "Showcase" },
];

function readAppView(): AppView {
    if (typeof window === "undefined") return "react";
    const view = new URLSearchParams(window.location.search).get("view");
    return view === "showcase" || view === "primitives" ? "showcase" : "react";
}

function useAppView() {
    const [activeView, setActiveView] = useState<AppView>(readAppView);

    useEffect(() => {
        const handlePopState = () => setActiveView(readAppView());
        window.addEventListener("popstate", handlePopState);
        return () => window.removeEventListener("popstate", handlePopState);
    }, []);

    const selectView = (view: AppView) => {
        const url = new URL(window.location.href);
        if (view === "showcase") {
            url.searchParams.set("view", "showcase");
        } else {
            url.searchParams.delete("view");
        }
        url.hash = "";
        window.history.pushState(null, "", url);
        setActiveView(view);
    };

    return { activeView, selectView };
}

function ViewTabs({
    activeView,
    onSelect,
    theme,
}: {
    activeView: AppView;
    onSelect: (view: AppView) => void;
    theme: ThemeName;
}) {
    return (
        <nav
            aria-label="React app views"
            className="flex w-full min-w-0 max-w-full flex-wrap gap-2 sm:w-auto"
        >
            {APP_VIEWS.map((view) => {
                const selected = activeView === view.id;
                return (
                    <TabButton
                        key={view.id}
                        theme={theme}
                        active={selected}
                        onClick={() => onSelect(view.id)}
                    >
                        {view.label}
                    </TabButton>
                );
            })}
        </nav>
    );
}

function ThemeTabs({
    theme,
    onThemeChange,
}: {
    theme: ThemeName;
    onThemeChange: (theme: ThemeName) => void;
}) {
    return (
        <nav
            aria-label="Theme"
            className="flex max-w-full flex-wrap justify-end gap-1.5"
        >
            {themes.map((option) => (
                <TabButton
                    key={option}
                    theme={option}
                    active={theme === option}
                    onClick={() => onThemeChange(option)}
                    size="sm"
                >
                    <span className="capitalize">{option}</span>
                </TabButton>
            ))}
        </nav>
    );
}

function BrandMark() {
    return (
        <a
            href="https://pollinations.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center text-current"
            aria-label="Pollinations"
        >
            <span className="sr-only">Pollinations</span>
            <span
                aria-hidden="true"
                className="block h-7 w-[228px] max-w-full bg-current"
                style={brandWordmarkMask}
            />
        </a>
    );
}

function CopyButton({
    text,
    children = "Copy module",
}: {
    text: string;
    children?: ReactNode;
}) {
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!copied) return;
        const timer = setTimeout(() => setCopied(false), 1500);
        return () => clearTimeout(timer);
    }, [copied]);

    return (
        <Button
            type="button"
            theme="teal"
            size="sm"
            onClick={() => {
                void navigator.clipboard.writeText(text).then(() => {
                    setCopied(true);
                });
            }}
        >
            {copied ? "Copied" : children}
        </Button>
    );
}

function DashboardLink() {
    const { enterUrl } = useAuthActions();
    const theme = useAppTheme();
    return (
        <ExternalLinkButton theme={theme} href={enterUrl}>
            Dashboard
        </ExternalLinkButton>
    );
}

function Metric({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="w-24 shrink-0 text-xs font-semibold uppercase tracking-wide text-theme-text-soft">
                {label}
            </span>
            {children}
        </div>
    );
}

const SNIPPETS = {
    provider: `import "@pollinations/ui/styles.css";
import { PolliProvider } from "@pollinations/sdk/react";

const APP_KEY = "pk_your_key_here";

export function App() {
    return (
        <PolliProvider appKey={APP_KEY} permissions={["profile"]}>
            <YourApp />
        </PolliProvider>
    );
}`,
    auth: `import { useAuthActions } from "@pollinations/sdk/react";
import { ExternalLinkButton } from "@pollinations/ui";
import {
    LoginButton,
    LogoutButton,
    WhenLoggedIn,
    WhenLoggedOut,
} from "@pollinations/ui/auth/sdk";

function DashboardLink() {
    const { enterUrl } = useAuthActions();
    return (
        <ExternalLinkButton theme="blue" href={enterUrl}>
            Dashboard
        </ExternalLinkButton>
    );
}

export function AuthActions() {
    return (
        <>
            <WhenLoggedOut>
                <LoginButton>Log in with Pollinations</LoginButton>
            </WhenLoggedOut>
            <WhenLoggedIn>
                <DashboardLink />
                <LogoutButton intent="danger">Log out</LogoutButton>
            </WhenLoggedIn>
        </>
    );
}`,
    identity: `import {
    UserAvatar,
    UserEmail,
    UserName,
    WhenLoggedIn,
} from "@pollinations/ui/auth/sdk";

export function UserIdentity() {
    return (
        <WhenLoggedIn>
            <UserAvatar size="md" />
            <UserName />
            <UserEmail />
        </WhenLoggedIn>
    );
}`,
    balance: `import { WhenLoggedIn } from "@pollinations/ui/auth/sdk";
import { Balance } from "@pollinations/ui/wallet/sdk";

export function WalletBalance() {
    return (
        <WhenLoggedIn>
            <Balance />
        </WhenLoggedIn>
    );
}`,
    key: `import { WhenLoggedIn } from "@pollinations/ui/auth/sdk";
import {
    KeyBudget,
    KeyExpiry,
    KeyPrefix,
} from "@pollinations/ui/wallet/sdk";

export function AccountKeySummary() {
    return (
        <WhenLoggedIn>
            <KeyPrefix />
            <KeyExpiry />
            <KeyBudget />
        </WhenLoggedIn>
    );
}`,
    models: `import { WhenLoggedIn } from "@pollinations/ui/auth/sdk";
import { KeyModels } from "@pollinations/ui/wallet/sdk";

export function AllowedModels() {
    return (
        <WhenLoggedIn>
            <KeyModels />
        </WhenLoggedIn>
    );
}`,
} as const;

type ModuleItem = {
    id: keyof typeof SNIPPETS;
    eyebrow: string;
    title: string;
    description: string;
    Icon: ComponentType<{ className?: string }>;
    preview: ReactNode;
};

function SignedOutPreview({ children }: { children: ReactNode }) {
    return (
        <WhenLoggedOut>
            <span className="text-sm text-theme-text-soft">{children}</span>
        </WhenLoggedOut>
    );
}

function ProviderPreview() {
    return (
        <div className="flex flex-col gap-3">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-lg bg-theme-bg-pale px-3 py-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-theme-text-soft">
                    Provider
                </span>
                <span className="rounded-full bg-theme-bg-active px-2 py-1 font-mono text-xs text-theme-text-strong">
                    pk_...
                </span>
            </div>
            <p className="text-sm leading-6 text-theme-text-base">
                Wrap once, then render auth and wallet modules below it.
            </p>
        </div>
    );
}

function AuthPreview() {
    return (
        <div className="flex flex-wrap items-center gap-2">
            <WhenLoggedOut>
                <LoginButton>Log in with Pollinations</LoginButton>
            </WhenLoggedOut>
            <WhenLoggedIn>
                <DashboardLink />
                <LogoutButton intent="danger">Log out</LogoutButton>
            </WhenLoggedIn>
        </div>
    );
}

function IdentityPreview() {
    return (
        <>
            <SignedOutPreview>
                User identity appears here after sign in.
            </SignedOutPreview>
            <WhenLoggedIn>
                <div className="flex min-w-0 items-center gap-3">
                    <UserAvatar size="md" />
                    <div className="flex min-w-0 flex-col">
                        <UserName />
                        <UserEmail />
                    </div>
                </div>
            </WhenLoggedIn>
        </>
    );
}

function BalancePreview() {
    return (
        <div className="flex min-w-0 flex-col gap-3">
            <SignedOutPreview>
                Wallet balance appears here after sign in.
            </SignedOutPreview>
            <WhenLoggedIn>
                <Metric label="Balance">
                    <Balance />
                </Metric>
            </WhenLoggedIn>
        </div>
    );
}

function KeyPreview() {
    return (
        <div className="flex min-w-0 flex-col gap-3">
            <SignedOutPreview>
                Account key details appear here after sign in.
            </SignedOutPreview>
            <WhenLoggedIn>
                <Metric label="Key">
                    <KeyPrefix />
                </Metric>
                <Metric label="Expires">
                    <KeyExpiry />
                </Metric>
                <Metric label="Remaining">
                    <KeyBudget />
                </Metric>
            </WhenLoggedIn>
        </div>
    );
}

function ModelsPreview() {
    return (
        <div className="flex min-w-0 flex-col gap-3">
            <SignedOutPreview>
                Model access appears here after sign in.
            </SignedOutPreview>
            <WhenLoggedIn>
                <Metric label="Models">
                    <KeyModels />
                </Metric>
            </WhenLoggedIn>
        </div>
    );
}

const MODULES: ModuleItem[] = [
    {
        id: "provider",
        eyebrow: "Setup",
        title: "Provider",
        description: "Mount the SDK context once with a publishable key.",
        Icon: AppIcon,
        preview: <ProviderPreview />,
    },
    {
        id: "auth",
        eyebrow: "Auth",
        title: "Login and session actions",
        description: "Show login when signed out and actions after sign in.",
        Icon: LockIcon,
        preview: <AuthPreview />,
    },
    {
        id: "identity",
        eyebrow: "Auth",
        title: "User identity",
        description: "Render avatar, display name, and email from SDK state.",
        Icon: BookIcon,
        preview: <IdentityPreview />,
    },
    {
        id: "balance",
        eyebrow: "Wallet",
        title: "Balance",
        description:
            "Display the account pollen balance with package formatting.",
        Icon: WalletIcon,
        preview: <BalancePreview />,
    },
    {
        id: "key",
        eyebrow: "Wallet",
        title: "Account key summary",
        description: "Expose key prefix, expiration, and remaining budget.",
        Icon: TokensIcon,
        preview: <KeyPreview />,
    },
    {
        id: "models",
        eyebrow: "Access",
        title: "Allowed models",
        description: "Show models available to the signed-in account key.",
        Icon: TrendUpIcon,
        preview: <ModelsPreview />,
    },
];

function FloatingThemeControls({
    theme,
    onThemeChange,
}: {
    theme: ThemeName;
    onThemeChange: (theme: ThemeName) => void;
}) {
    return (
        <div
            data-theme={theme}
            className="sticky top-[141px] z-20 shrink-0 px-5 pt-3 sm:top-[84px]"
        >
            <div className="mx-auto flex w-full max-w-[1220px] justify-end">
                <Surface
                    theme={theme}
                    variant="panel"
                    className="flex w-max max-w-full p-2 backdrop-blur"
                >
                    <ThemeTabs theme={theme} onThemeChange={onThemeChange} />
                </Surface>
            </div>
        </div>
    );
}

function AppHeader({
    activeView,
    onSelectView,
    theme,
}: {
    activeView: AppView;
    onSelectView: (view: AppView) => void;
    theme: ThemeName;
}) {
    return (
        <header
            data-theme={theme}
            className="sticky top-0 z-30 shrink-0 border-b border-green-950/10 bg-emerald-100 px-5 py-4 text-green-950 backdrop-blur"
        >
            <div className="mx-auto flex w-full max-w-[1220px] min-w-0 flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
                <h1 className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-green-950">
                    <BrandMark />
                </h1>
                <ViewTabs
                    activeView={activeView}
                    onSelect={onSelectView}
                    theme={theme}
                />
            </div>
        </header>
    );
}

function SdkIntro() {
    return (
        <section className="flex flex-col gap-1">
            <h2 className="font-serif text-2xl font-black text-theme-text-strong">
                Modules
            </h2>
            <p className="max-w-3xl text-sm leading-6 text-theme-text-soft">
                React-ready auth, wallet, and access modules with copyable
                snippets and live package components.
            </p>
        </section>
    );
}

function ModuleCard({ item }: { item: ModuleItem }) {
    const Icon = item.Icon;
    return (
        <Surface
            variant="panel"
            className="flex min-h-[300px] max-w-full flex-col gap-5 overflow-hidden"
        >
            <div className="flex min-w-0 items-start gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-theme-bg-pale text-theme-text-strong">
                    <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold uppercase tracking-wide text-theme-text-soft">
                        {item.eyebrow}
                    </p>
                    <h3 className="mt-1 break-words text-xl font-bold tracking-tight text-theme-text-strong">
                        {item.title}
                    </h3>
                    <p className="mt-2 break-words text-sm leading-6 text-theme-text-base">
                        {item.description}
                    </p>
                </div>
            </div>
            <div className="mt-auto min-w-0 rounded-xl border border-theme-border bg-surface-white p-4">
                {item.preview}
            </div>
            <div className="flex justify-end">
                <CopyButton text={SNIPPETS[item.id]} />
            </div>
        </Surface>
    );
}

function SdkModules() {
    return (
        <section className="grid gap-4 lg:grid-cols-2">
            {MODULES.map((item) => (
                <ModuleCard key={item.id} item={item} />
            ))}
        </section>
    );
}

function SdkDemo({
    activeView,
    onSelectView,
    theme,
    onThemeChange,
}: {
    activeView: AppView;
    onSelectView: (view: AppView) => void;
    theme: ThemeName;
    onThemeChange: (theme: ThemeName) => void;
}) {
    return (
        <div
            data-theme={theme}
            className="min-h-screen overflow-x-hidden bg-emerald-100 text-theme-text-strong"
        >
            <AppHeader
                activeView={activeView}
                onSelectView={onSelectView}
                theme={theme}
            />
            <FloatingThemeControls
                theme={theme}
                onThemeChange={onThemeChange}
            />
            <main className="mx-auto box-border flex w-full max-w-full flex-col gap-10 px-5 pt-8 pb-12 sm:max-w-[1220px]">
                <ThemeContext.Provider value={theme}>
                    <PolliProvider appKey={APP_KEY} permissions={["profile"]}>
                        <SdkIntro />
                        <SdkModules />
                    </PolliProvider>
                </ThemeContext.Provider>
            </main>
        </div>
    );
}

export default function App() {
    const { activeView, selectView } = useAppView();
    const [theme, setTheme] = useState<ThemeName>("blue");

    if (activeView === "showcase") {
        return (
            <div
                data-theme={theme}
                className="flex h-dvh min-h-0 flex-col overflow-hidden bg-emerald-100"
            >
                <AppHeader
                    activeView={activeView}
                    onSelectView={selectView}
                    theme={theme}
                />
                <FloatingThemeControls theme={theme} onThemeChange={setTheme} />
                <Suspense fallback={null}>
                    <DesignShowcase
                        hideHeader
                        hideThemeTabs
                        theme={theme}
                        onThemeChange={setTheme}
                    />
                </Suspense>
            </div>
        );
    }

    return (
        <SdkDemo
            activeView={activeView}
            onSelectView={selectView}
            theme={theme}
            onThemeChange={setTheme}
        />
    );
}
