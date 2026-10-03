import { InlineLink, Surface } from "@pollinations/ui";
import type { FC } from "react";

const UPCOMING_CHANGES = [
    {
        when: "Planned",
        model: "Qwen3 Coder 30B",
        change: "Bedrock; Paid Pollen; $0.15/$0.60 per 1M input/output tokens. IDs unchanged.",
        note: "No Responses API, seed, logprobs or stop. Named tool choice uses auto; schemas are not enforced.",
    },
    {
        when: "Oct 9, 16:00 UTC",
        model: "Qwen3 VL 235B Thinking",
        change: "Alibaba route retires. Choose another vision model.",
    },
    {
        when: "By Oct 13",
        model: "Cohere Command A+",
        change: "Azure route is due to retire. Replacement details to follow.",
    },
    {
        when: "Oct 20",
        model: "Gemini 2.5 Flash Lite + Search",
        change: "Vertex AI routes retire. Update apps using these models or their aliases.",
    },
    {
        when: "Nov 2",
        model: "Grok Imagine Pro",
        change: "Redirects to Image 2.0. Output and pricing change.",
    },
];

export const UpcomingChanges: FC = () => (
    <ul className="flex flex-col gap-3 text-sm text-theme-text-base">
        {UPCOMING_CHANGES.map(({ when, model, change, note }) => (
            <li key={model}>
                <span className="mr-2 text-theme-text-muted">{when}</span>
                <strong className="text-theme-text-strong">{model}</strong>
                <span> — {change}</span>
                {note && <p className="mt-1">{note}</p>}
            </li>
        ))}
    </ul>
);

export const Announcements: FC = () => (
    <div className="flex flex-col gap-4">
        <Surface>
            <h3 className="font-sans text-sm font-semibold text-theme-text-strong">
                Code agents · Alpha
            </h3>
            <p className="mt-1 text-sm text-theme-text-base">
                Run your agent.ts from a GitHub repository. Callers pay for
                usage.{" "}
                <InlineLink
                    href="https://gen.pollinations.ai/docs#tag/publish-an-agent"
                    size="sm"
                >
                    Guide
                </InlineLink>
            </p>
        </Surface>
        <Surface>
            <h3 className="font-sans text-sm font-semibold text-theme-text-strong">
                Community IDs
            </h3>
            <p className="mt-1 text-sm text-theme-text-base">
                Community and agent IDs now use community/username/name.
                Existing IDs keep working.
            </p>
        </Surface>
    </div>
);
