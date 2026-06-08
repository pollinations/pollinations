import { ExternalLinkButton, Section } from "@pollinations/ui";
import type { FC } from "react";
import { FAQ, FAQ_GITHUB_URL } from "./faq.tsx";
import { HIGHLIGHTS_GITHUB_URL, NewsBanner } from "./news-banner.tsx";

export const NewsFaq: FC = () => (
    <div className="flex flex-col gap-6">
        <Section
            title="News"
            framed
            action={
                <ExternalLinkButton href={HIGHLIGHTS_GITHUB_URL}>
                    📰 More on GitHub
                </ExternalLinkButton>
            }
        >
            <NewsBanner />
        </Section>
        <Section
            title="FAQ"
            framed
            action={
                <ExternalLinkButton href={FAQ_GITHUB_URL}>
                    ❓ View on GitHub
                </ExternalLinkButton>
            }
        >
            <FAQ showTitle={false} />
        </Section>
    </div>
);
