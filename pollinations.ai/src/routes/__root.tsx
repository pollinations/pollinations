import { createRootRoute, HeadContent, Outlet } from "@tanstack/react-router";

export const Route = createRootRoute({
    head: () => ({
        meta: [{ title: "pollinations.ai" }],
    }),
    component: RootLayout,
});

function RootLayout() {
    return (
        <div className="flex h-full flex-col">
            <HeadContent />
            {/* Shell body is overflow-hidden; this <main> is the scroll owner. */}
            <main id="app-scroll" className="flex-1 overflow-y-auto">
                <Outlet />
            </main>
        </div>
    );
}
