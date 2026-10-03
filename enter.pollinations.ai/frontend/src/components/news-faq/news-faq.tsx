import { InlineLink, Section } from "@pollinations/ui";
import type { FC } from "react";
import { FAQ } from "./faq.tsx";
import { Announcements, UpcomingChanges } from "./news-banner.tsx";

export const NewsFaq: FC = () => (
    <>
        <Section
            title="Upcoming model changes"
            actionClassName="ml-auto"
            action={
                <InlineLink href="/models" size="sm">
                    Model catalog
                </InlineLink>
            }
        >
            <UpcomingChanges />
        </Section>
        <Section title="Announcements">
            <Announcements />
        </Section>
        <Section title="FAQ" id="faq">
            <FAQ showTitle={false} />
        </Section>
    </>
);
