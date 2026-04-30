import type { FC } from "react";
import { FAQ, FAQ_GITHUB_URL } from "../faq.tsx";
import { LinkButton } from "../ui/link-button.tsx";
import { DashboardSection } from "./dashboard-section.tsx";
import { HIGHLIGHTS_GITHUB_URL, NewsBanner } from "./news-banner.tsx";

export const UpdatesPage: FC = () => (
    <div className="flex flex-col gap-6">
        <DashboardSection
            title="News"
            theme="violet"
            framed
            action={
                <LinkButton theme="violet" href={HIGHLIGHTS_GITHUB_URL}>
                    📰 More on GitHub
                </LinkButton>
            }
        >
            <NewsBanner />
        </DashboardSection>
        <DashboardSection
            title="FAQ"
            theme="violet"
            framed
            action={
                <LinkButton theme="violet" href={FAQ_GITHUB_URL}>
                    ❓ View on GitHub
                </LinkButton>
            }
        >
            <FAQ showTitle={false} />
        </DashboardSection>
    </div>
);
