import { PolliProvider } from "@pollinations/sdk/react";
import {
    AppHeader,
    ColorModeToggle,
    ScrollArea,
    TabButton,
} from "@pollinations/ui";
import {
    lazy,
    type RefObject,
    Suspense,
    useEffect,
    useRef,
    useState,
} from "react";
import { APP_KEY } from "./config";
import { ColorsPage } from "./pages/colors-page";
import { CompositionsPage } from "./pages/compositions-page";
import { ModulesPage } from "./pages/modules-page";
import { PrimitivesPage } from "./pages/primitives-page";

const DesignShowcase = lazy(() =>
    import("./showcase/DesignShowcase").then((module) => ({
        default: module.DesignShowcase,
    })),
);

type PublicAppView = "primitives" | "compositions" | "modules" | "colors";
type AppView = PublicAppView | "showcase";

const PUBLIC_VIEWS: { id: PublicAppView; label: string }[] = [
    { id: "primitives", label: "Primitives" },
    { id: "compositions", label: "Compositions" },
    { id: "modules", label: "Modules" },
    { id: "colors", label: "Colors" },
];

function readAppView(): AppView {
    if (typeof window === "undefined") return "primitives";
    const view = new URLSearchParams(window.location.search).get("view");
    if (view === "showcase") return "showcase";
    if (
        view === "primitives" ||
        view === "compositions" ||
        view === "modules" ||
        view === "colors"
    ) {
        return view;
    }
    if (view === "models" || view === "react") {
        return "modules";
    }
    return "primitives";
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
        if (view === "primitives") {
            url.searchParams.delete("view");
        } else {
            url.searchParams.set("view", view);
        }
        url.hash = "";
        window.history.pushState(null, "", url);
        setActiveView(view);
    };

    return { activeView, selectView };
}

function ShellHeader({
    activeView,
    onSelectView,
    scrollTargetRef,
}: {
    activeView: AppView;
    onSelectView: (view: AppView) => void;
    scrollTargetRef?: RefObject<HTMLElement | null>;
}) {
    return (
        <AppHeader
            navLabel="React app views"
            autoHide
            scrollTargetRef={scrollTargetRef}
        >
            {PUBLIC_VIEWS.map((view) => (
                <TabButton
                    key={view.id}
                    active={activeView === view.id}
                    onClick={() => onSelectView(view.id)}
                >
                    {view.label}
                </TabButton>
            ))}
            <ColorModeToggle />
        </AppHeader>
    );
}

function AppShell({
    activeView,
    onSelectView,
}: {
    activeView: AppView;
    onSelectView: (view: AppView) => void;
}) {
    const scrollTargetRef = useRef<HTMLDivElement | null>(null);

    return (
        <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-app-bg text-theme-text-strong">
            <ScrollArea
                ref={scrollTargetRef}
                axis="y"
                className="min-h-0 flex-1"
            >
                <ShellHeader
                    activeView={activeView}
                    onSelectView={onSelectView}
                    scrollTargetRef={scrollTargetRef}
                />
                <main className="mx-auto flex w-full max-w-5xl flex-col gap-12 px-4 py-8 sm:px-6 sm:py-10">
                    {activeView === "primitives" ? (
                        <PrimitivesPage />
                    ) : activeView === "compositions" ? (
                        <CompositionsPage />
                    ) : activeView === "modules" ? (
                        <ModulesPage />
                    ) : activeView === "colors" ? (
                        <ColorsPage />
                    ) : null}
                </main>
            </ScrollArea>
        </div>
    );
}

function DebugShowcase({
    activeView,
    onSelectView,
}: {
    activeView: AppView;
    onSelectView: (view: AppView) => void;
}) {
    return (
        <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-app-bg">
            <ShellHeader activeView={activeView} onSelectView={onSelectView} />
            <Suspense fallback={null}>
                <DesignShowcase hideHeader />
            </Suspense>
        </div>
    );
}

export default function App() {
    const { activeView, selectView } = useAppView();

    if (activeView === "showcase") {
        return (
            <DebugShowcase activeView={activeView} onSelectView={selectView} />
        );
    }

    return (
        <PolliProvider appKey={APP_KEY} permissions={["profile"]}>
            <AppShell activeView={activeView} onSelectView={selectView} />
        </PolliProvider>
    );
}
