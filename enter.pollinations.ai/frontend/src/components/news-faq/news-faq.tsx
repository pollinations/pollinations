import { GitHubIcon, InlineLink, Section } from "@pollinations/ui";
import { useLoaderData } from "@tanstack/react-router";
import type { FC } from "react";
import { FAQ } from "./faq.tsx";
import { Announcements, NEWS_MORE_URL, NewsBanner } from "./news-banner.tsx";

export const NewsFaq: FC = () => {
    const { user } = useLoaderData({ from: "/_dashboard" });
    return (
        <>
            {user && <Announcements />}
            <Section
                title="News"
                framed
                action={
                    <InlineLink href={NEWS_MORE_URL} size="sm">
                        <GitHubIcon
                            aria-hidden="true"
                            className="mr-1.5 inline-block h-4 w-4 align-text-bottom"
                        />
                        More on GitHub
                    </InlineLink>
                }
            >
                <NewsBanner />
            </Section>
            <Section title="FAQ" id="faq">
                <FAQ showTitle={false} />
            </Section>
        </>
    );
};
