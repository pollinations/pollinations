import { Section } from "@pollinations/ui";
import type { FC } from "react";
import { FAQ } from "./faq.tsx";
import { Announcements, UpcomingChanges } from "./news-banner.tsx";

export const NewsFaq: FC = () => (
    <>
        <Section title="Upcoming model changes" framed>
            <UpcomingChanges />
        </Section>
        <Section title="Recent changes" framed>
            <Announcements />
        </Section>
        <Section title="FAQ" id="faq">
            <FAQ showTitle={false} />
        </Section>
    </>
);
