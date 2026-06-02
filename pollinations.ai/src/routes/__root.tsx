import { createRootRoute, HeadContent, Outlet } from "@tanstack/react-router";

export const Route = createRootRoute({
    head: () => ({
        meta: [{ title: "pollinations.ai" }],
    }),
    component: RootLayout,
});

function RootLayout() {
    return (
        <div className="polli:flex polli:h-full polli:flex-col">
            <HeadContent />
            {/* Shell body is overflow-hidden; this <main> is the scroll owner. */}
            <main
                id="app-scroll"
                className="polli:flex-1 polli:overflow-y-auto"
            >
                <Outlet />
            </main>
        </div>
    );
}
