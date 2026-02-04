import { type FC, useEffect, useState } from "react";
import { Panel } from "../ui/panel.tsx";

const HIGHLIGHTS_RAW_URL =
    "https://raw.githubusercontent.com/pollinations/pollinations/main/social/news/transformed/highlights.md";
const HIGHLIGHTS_GITHUB_URL =
    "https://github.com/pollinations/pollinations/blob/main/social/news/transformed/highlights.md";

interface Highlight {
    date: string;
    emoji: string;
    title: string;
    description: string;
}

function parseHighlights(md: string): Highlight[] {
    return md
        .split("\n")
        .filter((line) => line.startsWith("- **"))
        .map((line) => {
            const dateMatch = line.match(/^- \*\*(\d{4}-\d{2}-\d{2})\*\*/);
            const emojiTitleMatch = line.match(/– \*\*(\S+)\s+([^*]+)\*\*/);
            const descStart = line.lastIndexOf("**") + 2;
            const description = line.slice(descStart).trim();
            return {
                date: dateMatch?.[1] ?? "",
                emoji: emojiTitleMatch?.[1] ?? "",
                title: emojiTitleMatch?.[2]?.trim() ?? "",
                description,
            };
        });
}

export const NewsBanner: FC = () => {
    const [highlights, setHighlights] = useState<Highlight[]>([]);

    useEffect(() => {
        fetch(HIGHLIGHTS_RAW_URL)
            .then((res) => res.text())
            .then((md) => setHighlights(parseHighlights(md).slice(0, 3)))
            .catch((err) => console.error("Failed to fetch highlights:", err));
    }, []);

    if (highlights.length === 0) return null;

    return (
        <Panel color="violet" compact>
            <div className="flex flex-col gap-2">
                <span className="text-xs text-gray-500">What's new</span>
                <ul className="text-xs space-y-1.5">
                    {highlights.map((h) => (
                        <li key={h.date + h.title} className="text-gray-600">
                            {h.emoji} <strong>{h.title}:</strong>{" "}
                            {h.description}
                        </li>
                    ))}
                </ul>
                <a
                    href={HIGHLIGHTS_GITHUB_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-violet-600 hover:text-violet-800 hover:underline"
                >
                    More...
                </a>
            </div>
        </Panel>
    );
};
