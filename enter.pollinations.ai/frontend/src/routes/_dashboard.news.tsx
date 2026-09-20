import { createFileRoute } from "@tanstack/react-router";
import { NewsFaq } from "../components/news-faq";

export const Route = createFileRoute("/_dashboard/news")({
    component: NewsPage,
});

function NewsPage() {
    const { user } = Route.useRouteContext();
    return <NewsFaq showWelcome={!user} />;
}
