import { createFileRoute, redirect } from "@tanstack/react-router";
import { NewsFaq } from "../components/news-faq";
import { isFaqAnchor } from "../components/news-faq/faq.tsx";

type NewsSearch = { view?: "faq" };

export const Route = createFileRoute("/_dashboard/news")({
    validateSearch: (search: Record<string, unknown>): NewsSearch => ({
        view: search.view === "faq" ? "faq" : undefined,
    }),
    beforeLoad: ({ search, location }) => {
        // Links to the FAQ (/news#faq) or one answer (/news#how-do-quests-work)
        // open the FAQ.
        if (
            search.view !== "faq" &&
            (location.hash === "faq" || isFaqAnchor(location.hash))
        ) {
            throw redirect({
                to: "/news",
                search: { view: "faq" },
                hash: location.hash,
                replace: true,
            });
        }
    },
    component: NewsFaq,
});
