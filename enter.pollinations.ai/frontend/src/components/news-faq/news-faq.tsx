import { GitHubIcon, InlineLink, Section } from "@pollinations/ui";
import type { FC } from "react";
import { FAQ } from "./faq.tsx";
import {
    Announcements,
    HIGHLIGHTS_GITHUB_URL,
    NewsBanner,
} from "./news-banner.tsx";

export const NewsFaq: FC = () => (
    <div className="flex flex-col gap-6">
        <Section title="Announcements">
            <Announcements />
        </Section>
        <Section
            title="News"
            action={
                <InlineLink href={HIGHLIGHTS_GITHUB_URL} size="sm">
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
    </div>
);
