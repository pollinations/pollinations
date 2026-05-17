import { useEffect, useState } from "react";

const useGitHubStars = () => {
    const [stars, setStars] = useState<string>("3.8K");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchStars = async () => {
            try {
                const response = await fetch(
                    "https://api.github.com/repos/pollinations/pollinations",
                    {
                        headers: {
                            Accept: "application/vnd.github.v3+json",
                        },
                    },
                );

                if (!response.ok) {
                    throw new Error(`API error: ${response.status}`);
                }

                const data = await response.json();
                const starCount = data.stargazers_count;
                const formatted =
                    starCount >= 1000
                        ? `${(starCount / 1000).toFixed(1)}K`
                        : starCount.toString();

                setStars(formatted);
                setError(null);
            } catch (err) {
                console.error("Error fetching GitHub stars:", err);
                setError(err instanceof Error ? err.message : "Unknown error");
                // Keep fallback value on error
            } finally {
                setLoading(false);
            }
        };

        fetchStars();
    }, []);

    return { stars, loading, error };
};

export default useGitHubStars;
