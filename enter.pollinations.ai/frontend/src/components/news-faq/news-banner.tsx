import { InlineLink } from "@pollinations/ui";
import type { FC } from "react";

const UPCOMING_CHANGES = [
    {
        when: "Planned",
        model: "Qwen3 Coder 30B",
        change: "Moves to AWS Bedrock; Paid Pollen only",
        details:
            "The model ID and aliases stay unchanged. Input/output pricing becomes $0.15/$0.60 per million tokens. Responses API, seed, logprobs, and stop support are removed. Named tool choice behaves as auto; strict JSON schemas are not enforced. The change is not live yet.",
    },
    {
        when: "Oct 9, 16:00 UTC",
        model: "Qwen3 VL 235B Thinking",
        change: "Current provider route retires",
        details:
            "Alibaba retires this route on October 10 at 00:00 Beijing time. Choose another vision model before that deadline; a replacement route has not been announced.",
    },
    {
        when: "By Oct 13",
        model: "Cohere Command A+",
        change: "Current Azure route is due to retire",
        details:
            "Plan for the earliest published retirement date, October 13. A provider change is being prepared; its pricing and compatibility will be announced before it goes live.",
    },
    {
        when: "Oct 20",
        model: "Gemini 2.5 Flash Lite and Flash Lite Search",
        change: "Current Vertex AI routes retire",
        details:
            "Update apps using these models or their aliases before October 20. Browse Models for current alternatives and their search capabilities; do not assume the old IDs will redirect automatically.",
    },
    {
        when: "Nov 2",
        model: "Grok Imagine Pro",
        change: "Provider redirects to Grok Imagine Image 2.0",
        details:
            "xAI retires the image-quality route and redirects requests to Image 2.0. Check the replacement's output and pricing before the change.",
    },
];

const RECENT_CHANGES = [
    {
        when: "Oct 1",
        model: "MAI Image 2.5 Flash",
        change: "Existing ID now uses 2.6 Flash and its pricing",
        details:
            "Use microsoft/mai-image-2.6-flash for new integrations. Nova Canvas and Nova Reel retired on September 30; their IDs and aliases no longer accept requests.",
    },
    {
        when: "Sep 24",
        model: "Model provider changes",
        change: "Paid access and pricing changed for several models",
        details:
            "DeepSeek V4 Pro, DeepSeek V4 Flash Vision, Kimi K2.7 Code, GLM 5.2, and Muse Glimmer 30B now require Paid Pollen. DeepSeek V4 Flash costs $0.33/$0.99 per million input/output tokens. GLM 5.2 and Kimi K2.7 Code prices rose about 5%; DeepSeek V4 Pro and Muse Glimmer became cheaper. Kimi K2.7 Code always reasons, so forcing a tool call returns an error. Browse Models for current pricing.",
    },
];

const ChangeList: FC<{ changes: typeof UPCOMING_CHANGES }> = ({ changes }) => (
    <ul className="divide-y divide-theme-border">
        {changes.map(({ when, model, change, details }) => (
            <li key={model} className="py-3 first:pt-0 last:pb-0">
                <details>
                    <summary className="cursor-pointer text-sm text-theme-text-base">
                        <span className="mr-2 text-theme-text-muted">
                            {when}
                        </span>
                        <strong className="text-theme-text-strong">
                            {model}
                        </strong>
                        <span> — {change}</span>
                    </summary>
                    <p className="mt-2 text-sm leading-relaxed text-theme-text-soft">
                        {details}
                    </p>
                </details>
            </li>
        ))}
    </ul>
);

export const UpcomingChanges: FC = () => (
    <>
        <ChangeList changes={UPCOMING_CHANGES} />
        <InlineLink href="/models" size="sm" className="mt-3 inline-block">
            Browse models and current prices
        </InlineLink>
    </>
);

export const Announcements: FC = () => <ChangeList changes={RECENT_CHANGES} />;
