import {
    GitHubIcon,
    Heading,
    InlineLink,
    Section,
    Text,
} from "@pollinations/ui";
import type { FC } from "react";
import { DashboardSignInTrigger } from "../auth/dashboard-sign-in-trigger.tsx";
import { FAQ } from "./faq.tsx";
import {
    Announcements,
    HIGHLIGHTS_GITHUB_URL,
    NewsBanner,
} from "./news-banner.tsx";

export const NewsFaq: FC<{ showWelcome?: boolean }> = ({
    showWelcome = false,
}) => (
    <div className="flex flex-col gap-6">
        <Section
            title={showWelcome ? "Welcome to Pollinations" : "Announcements"}
        >
            {showWelcome && (
                <>
                    <Text>
                        Explore models, build with AI, and manage your
                        Pollinations account.
                    </Text>
                    <DashboardSignInTrigger variant="page" />
                    <Heading as="h2" size="section" className="polli:pt-4">
                        Announcements
                    </Heading>
                </>
            )}
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
