import { GitHubIcon, InlineLink, Section, TabButton } from "@pollinations/ui";
import { type FC, type ReactNode, useState } from "react";
import { FAQ } from "./faq.tsx";
import {
    Announcements,
    Changelog,
    currentAnnouncements,
    NEWS_MORE_URL,
    Updates,
} from "./news-banner.tsx";
import { newsHighlights, useNewsIndex } from "./news-index.ts";

const GITHUB_LINK = (
    <InlineLink href={NEWS_MORE_URL} size="sm">
        <GitHubIcon
            aria-hidden="true"
            className="mr-1.5 inline-block h-4 w-4 align-text-bottom"
        />
        More on GitHub
    </InlineLink>
);

const CHANGELOG_LINKS = (
    <div className="flex gap-4">
        <InlineLink href="/models" size="sm">
            Browse models
        </InlineLink>
        <InlineLink href="https://gen.pollinations.ai/docs" size="sm">
            API docs
        </InlineLink>
    </div>
);

type Tab = { label: string; links?: ReactNode; panel: ReactNode };

export const NewsFaq: FC = () => {
    // Fetched on load, so the index tabs are ready when opened.
    const index = useNewsIndex();
    const today = new Date().toISOString().slice(0, 10);
    const announcements = currentAnnouncements(today);
    // Announcements lead while one is current; the index tabs always show.
    const tabs: Tab[] = [
        ...(announcements.length > 0
            ? [
                  {
                      label: "Announcements",
                      panel: <Announcements items={announcements} />,
                  },
              ]
            : []),
        {
            label: "Updates",
            links: GITHUB_LINK,
            panel: <Updates items={index ? newsHighlights(index) : []} />,
        },
        {
            label: "Changelog",
            links: CHANGELOG_LINKS,
            panel: <Changelog index={index} />,
        },
    ];
    const [active, setActive] = useState(tabs[0].label);
    const tab = tabs.find(({ label }) => label === active) ?? tabs[0];
    return (
        <>
            <Section
                title="News"
                framed
                action={tab.links}
                actionClassName="ml-auto"
            >
                <fieldset
                    className="flex min-w-0 flex-wrap gap-1.5"
                    aria-label="News type"
                >
                    {tabs.map(({ label }) => (
                        <TabButton
                            key={label}
                            active={label === tab.label}
                            onClick={() => setActive(label)}
                            size="sm"
                        >
                            {label}
                        </TabButton>
                    ))}
                </fieldset>
                {tab.panel}
            </Section>
            <Section title="FAQ" id="faq">
                <FAQ showTitle={false} />
            </Section>
        </>
    );
};
