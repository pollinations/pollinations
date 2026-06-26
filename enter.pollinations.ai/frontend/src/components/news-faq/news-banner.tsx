import { Surface } from "@pollinations/ui";
import type { FC, ReactNode } from "react";

export const HIGHLIGHTS_GITHUB_URL =
    "https://github.com/pollinations/pollinations/blob/news/social/news/highlights.md";

interface Highlight {
    date?: string;
    /** Overrides the formatted date label (e.g. "Starting Jun 2"); pinned items only. */
    dateLabel?: string;
    emoji: string;
    title: string;
    description: string;
    /** Optional bullet list rendered under the description (pinned items only). */
    details?: string[];
}

const PINNED_NEWS: Highlight[] = [
    {
        date: "2026-06-02",
        dateLabel: "Starting Jun 2",
        emoji: "🌻",
        title: "Pollen pricing update",
        description: "A few changes to how Pollen works, starting today.",
        details: [
            "Big price drops — many models are now 30–50% cheaper.",
            "Bonus Pollen on purchases has ended.",
            "More price cuts coming June 22.",
        ],
    },
    {
        date: "2026-06-22",
        dateLabel: "Starting Jun 22",
        emoji: "🎯",
        title: "Tiers are going away",
        description: "Pollen rewards now come from Quests instead.",
        details: [
            "No more tiers — everyone earns Pollen the same way, through Quests.",
            "Your balance and access stay the same; what was Tier Pollen is now Quest Pollen.",
            "Earn more Pollen from the quest dashboard — new ways to earn.",
        ],
    },
];

function renderWithLinks(text: string): ReactNode[] {
    const parts: ReactNode[] = [];
    const matches = [...text.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)];
    let lastIndex = 0;
    for (const match of matches) {
        const idx = match.index ?? 0;
        if (idx > lastIndex) {
            parts.push(text.slice(lastIndex, idx));
        }
        parts.push(
            <a
                key={idx}
                href={match[2]}
                target="_blank"
                rel="noopener noreferrer"
                className="text-theme-text-soft hover:text-theme-text-strong hover:underline font-medium"
            >
                {match[1]}
            </a>,
        );
        lastIndex = idx + match[0].length;
    }
    if (lastIndex < text.length) {
        parts.push(text.slice(lastIndex));
    }
    return parts;
}

function formatNewsDate(date: string): string {
    if (!date) return "";
    const parsed = new Date(`${date}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) return date;
    return parsed.toLocaleDateString("en-US", {
        timeZone: "UTC",
        month: "short",
        day: "numeric",
        year: "numeric",
    });
}

export const Announcements: FC = () => {
    if (PINNED_NEWS.length === 0) return null;
    return (
        <div className="flex flex-col gap-3">
            {PINNED_NEWS.map((item) => (
                <PinnedNews key={item.title} item={item} />
            ))}
        </div>
    );
};

const PinnedNews: FC<{ item: Highlight }> = ({ item }) => (
    <Surface variant="card" className="min-w-0 leading-relaxed">
        {(item.dateLabel || item.date) && (
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-theme-text-muted">
                {item.dateLabel ??
                    (item.date ? formatNewsDate(item.date) : null)}
            </div>
        )}
        <div className="flex items-baseline gap-2 font-semibold text-ink-900 text-base sm:text-lg">
            {item.emoji && (
                <span aria-hidden="true" className="shrink-0">
                    {item.emoji}
                </span>
            )}
            <span>{item.title}</span>
        </div>
        {item.description && (
            <p className="mt-1 text-sm text-ink-700">
                {renderWithLinks(item.description)}
            </p>
        )}
        {item.details && item.details.length > 0 && (
            <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-ink-700 marker:text-theme-text-soft">
                {item.details.map((detail) => (
                    <li key={detail}>{renderWithLinks(detail)}</li>
                ))}
            </ul>
        )}
    </Surface>
);
