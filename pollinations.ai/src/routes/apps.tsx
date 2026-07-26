import { createFileRoute } from "@tanstack/react-router";
import { validateAppSearch } from "./-app-search";

export const Route = createFileRoute("/apps")({
    validateSearch: validateAppSearch,
    component: AppsPage,
});

function AppsPage() {
    const { category, badge, q } = Route.useSearch();

    return (
        <div className="mx-6 mb-6 overflow-hidden rounded-[28px] bg-theme-bg-pale px-8 py-14 shadow-container md:px-18">
            <p className="font-pixel text-sm tracking-widest text-theme-text-soft uppercase">
                840 apps built on Pollinations
            </p>
            <h1 className="mt-3 font-heading text-5xl text-theme-text-strong">
                Ecosystem
            </h1>
            <p className="mt-4 max-w-xl text-lg text-theme-text-base">
                Apps, tools, and experiments from the community. Browse, try,
                ship.
            </p>
            <p className="mt-8 font-pixel text-micro text-theme-text-muted">
                filters → category: {category ?? "all"} · badge:{" "}
                {badge ?? "all"} · q: {q ?? "—"}
            </p>
        </div>
    );
}
