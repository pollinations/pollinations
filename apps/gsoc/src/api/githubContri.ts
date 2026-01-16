import { useEffect, useState } from "react";

const useTopContributors = () => {
    const [contributors, setContributors] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchContributors = async () => {
            try {
                const response = await fetch(
                    "https://api.github.com/repos/pollinations/pollinations/contributors?per_page=10",
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
                const filtered = Array.isArray(data)
                    ? data
                          .filter(
                              (c: any) =>
                                  !c.login.includes("[bot]") &&
                                  !c.login.includes("dependabot"),
                          )
                          .slice(0, 10)
                    : [];
                setContributors(filtered);
                setError(null);
            } catch (err) {
                console.error("Error fetching contributors:", err);
                setError((err as any).message);
                setContributors([]);
            } finally {
                setLoading(false);
            }
        };

        fetchContributors();
    }, []);

    return { contributors, loading, error };
};

export default useTopContributors;
