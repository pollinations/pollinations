import { createFileRoute } from "@tanstack/react-router";
import { NewsFaq } from "../components/news-faq";

export const Route = createFileRoute("/_dashboard/news")({
    component: NewsFaq,
});
