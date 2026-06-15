import { useColorMode } from "@pollinations/ui";
import { createRootRoute, HeadContent, Outlet } from "@tanstack/react-router";
import { Footer } from "../components/shell/Footer.tsx";
import { Header } from "../components/shell/Header.tsx";

export const Route = createRootRoute({
    head: () => ({
        meta: [{ title: "pollinations.ai" }],
    }),
    component: RootLayout,
});

function RootLayout() {
    useColorMode();

    return (
        <div className="flex h-full min-w-0 flex-col">
            <HeadContent />
            {/* Shell body is overflow-hidden; this <main> is the scroll owner. */}
            <main
                id="app-scroll"
                className="flex-1 overflow-x-hidden overflow-y-auto bg-app-bg"
            >
                <Header />
                <div className="flex min-h-full min-w-0 flex-col">
                    <div className="min-w-0 flex-1">
                        <Outlet />
                    </div>
                    <Footer />
                </div>
            </main>
        </div>
    );
}
