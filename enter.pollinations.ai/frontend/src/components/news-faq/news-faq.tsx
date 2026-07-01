import { ExternalLinkButton, GitHubIcon, Section } from "@pollinations/ui";
import type { FC } from "react";
import { FAQ } from "./faq.tsx";
import {
    Announcements,
    HIGHLIGHTS_GITHUB_URL,
    NewsBanner,
} from "./news-banner.tsx";

export const NewsFaq: FC = () => (
    <div className="flex flex-col gap-6">
        <Section title="Announcements" framed>
            <Announcements />
        </Section>
        <Section
            title="News"
            framed
            action={
                <ExternalLinkButton href={HIGHLIGHTS_GITHUB_URL}>
                    <span className="inline-flex items-center gap-1.5">
                        <GitHubIcon className="h-4 w-4 shrink-0" />
                        More on GitHub
                    </span>
                </ExternalLinkButton>
            }
        >
            <NewsBanner />
        </Section>
        <Section title="FAQ" framed>
            <FAQ showTitle={false} />
        </Section>
    </div>
);
