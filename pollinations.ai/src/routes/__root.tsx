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
    return (
        <div data-theme="green" className="flex h-full flex-col">
            <HeadContent />
            {/* Shell body is overflow-hidden; this <main> is the scroll owner. */}
            <main id="app-scroll" className="flex-1 overflow-y-auto">
                <Header />
                <div className="flex min-h-full flex-col">
                    <div className="flex-1">
                        <Outlet />
                    </div>
                    <Footer />
                </div>
            </main>
        </div>
    );
}
