import { useState, useEffect } from "react";

/**
 * Hook to fetch and parse NEWS.md file
 * Returns array of news items parsed from markdown
 */
interface NewsItem {
    id: string;
    content: string;
    date: string | null;
}

interface UseNewsReturn {
    news: NewsItem[];
    loading: boolean;
    error: any;
}

/**
 * Hook to fetch and parse NEWS.md file
 * Returns array of news items parsed from markdown
 */
export function useNews(filePath: string): UseNewsReturn {
    const [news, setNews] = useState<NewsItem[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<any>(null);

    useEffect(() => {
        if (!filePath) {
            setLoading(false);
            return;
        }

        async function fetchNews() {
            try {
                const response = await fetch(filePath);
                if (!response.ok) {
                    throw new Error(
                        `Failed to fetch news: ${response.statusText}`,
                    );
                }

                const text = await response.text();

                // Parse markdown list items
                // Each line starts with "- " and contains date, title, and content
                const newsItems: NewsItem[] = text
                    .split("\n")
                    .filter((line) => line.trim().startsWith("- "))
                    .map((line, index) => {
                        // Remove leading "- "
                        const content = line.trim().substring(2);

                        // Extract date (format: **YYYY-MM-DD**)
                        const dateMatch = content.match(
                            /\*\*(\d{4}-\d{2}-\d{2})\*\*/,
                        );
                        const date = dateMatch ? dateMatch[1] : null;

                        return {
                            id: date ? `${date}-${index}` : `news-${index}`,
                            content, // Full markdown content including date
                            date,
                        };
                    });

                setNews(newsItems);
                setLoading(false);
            } catch (err) {
                console.error("Error loading news:", err);
                setError(err);
                setLoading(false);
            }
        }

        fetchNews();
    }, [filePath]);

    return { news, loading, error };
}
