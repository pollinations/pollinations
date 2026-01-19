import { useEffect, useState } from "react";

const useContribCount = () => {
    const [contribs, setContribs] = useState<string>("250+");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchContributorCount = async () => {
            try {
                const response = await fetch(
                    "https://api.github.com/repos/pollinations/pollinations/contributors?per_page=300",
                    {
                        headers: {
                            Accept: "application/vnd.github.v3+json",
                        },
                    },
                );

                if (!response.ok) {
                    throw new Error(`API error: ${response.status}`);
                }

                const linkHeader = response.headers.get("link");
                let totalCount = 0;

                if (linkHeader) {
                    const lastMatch = linkHeader.match(/page=(\d+)>;\s*rel="last"/);
                    if (lastMatch) {
                        totalCount = parseInt(lastMatch[1], 10);
                    }
                } else {
                    const data = await response.json();
                    totalCount = Array.isArray(data) ? data.length : 0;
                }

                const formatted = totalCount > 0 ? `${totalCount}+` : "250+";
                setContribs(formatted);
                setError(null);
            } catch (err) {
                console.error("Error fetching contributor count:", err);
                setError(err instanceof Error ? err.message : "Unknown error");
            } finally {
                setLoading(false);
            }
        };

        fetchContributorCount();
    }, []);

    return { contribs, loading, error };
};

export default useContribCount;
