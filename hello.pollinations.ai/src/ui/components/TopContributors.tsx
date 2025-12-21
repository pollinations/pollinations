import { useState, useEffect } from "react";
import { Heading, Body } from "./ui/typography";
import { Divider } from "./ui/divider";

interface Contributor {
    login: string;
    avatar_url: string;
    profile_url: string;
    contributions: number;
}


export function TopContributors() {
    const [contributors, setContributors] = useState<Contributor[]>([]);
    const [loadingContributors, setLoadingContributors] = useState(true);

    useEffect(() => {
        const fetchContributors = async () => {
            try {
                const response = await fetch(
                    "https://api.github.com/repos/pollinations/pollinations/contributors?per_page=15&sort=contributions"
                );
                const data = await response.json();
                if (Array.isArray(data)) {
                    // Filter out bots and take top 12 users
                    const userContributors = data
                        .filter((contrib: any) => !contrib.login.includes("[bot]") && !contrib.login.endsWith("-bot"))
                        .slice(0, 12)
                        .map((contrib: any) => ({
                            login: contrib.login,
                            avatar_url: contrib.avatar_url,
                            profile_url: contrib.html_url,
                            contributions: contrib.contributions,
                        }));
                    setContributors(userContributors);
                }
            } catch (error) {
                console.error("Failed to fetch contributors:", error);
            } finally {
                setLoadingContributors(false);
            }
        };

        fetchContributors();
    }, []);

    if (loadingContributors && contributors.length === 0) {
        return null;
    }

    if (!loadingContributors && contributors.length === 0) {
        return null;
    }

    return (
        <>
            <style>{`
                @keyframes glow {
                    0%, 100% {
                        box-shadow: 0 0 10px rgba(250, 204, 21, 0.4);
                    }
                    50% {
                        box-shadow: 0 0 20px rgba(250, 204, 21, 0.8);
                    }
                }
                @keyframes bounce-subtle {
                    0%, 100% {
                        transform: translateY(0);
                    }
                    50% {
                        transform: translateY(-4px);
                    }
                }
                @keyframes shine {
                    0% {
                        background-position: -1000px 0;
                    }
                    100% {
                        background-position: 1000px 0;
                    }
                }
                .top-contributor {
                    animation: glow 2s ease-in-out infinite, bounce-subtle 2s ease-in-out infinite;
                }
                .medal-badge {
                    animation: bounce-subtle 1.5s ease-in-out infinite;
                }
            `}</style>
            <div className="mb-12">
                <Heading variant="section">
                     Most Active Contributors
                </Heading>
                <Body size="sm" spacing="comfortable">
                    These amazing humans keep Pollinations thriving. Check them out!
                </Body>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {contributors.map((contributor, index) => {
                        const isTopThree = index < 3;
                        return (
                            <a
                                key={contributor.login}
                                href={contributor.profile_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`group flex flex-col items-center text-center ${
                                    isTopThree ? "relative" : ""
                                } hover:opacity-70 transition-opacity`}
                            >
                                <div
                                    className={`w-16 h-16 mb-2 overflow-hidden rounded-full border-2 ${
                                        isTopThree
                                            ? "border-yellow-400 top-contributor"
                                            : "border-border-brand group-hover:border-border-highlight"
                                    } transition-colors`}
                                >
                                    <img
                                        src={contributor.avatar_url}
                                        alt={contributor.login}
                                        className="w-full h-full object-cover"
                                    />
                                </div>
                                <p className={`font-headline text-xs font-black ${
                                    isTopThree
                                        ? "text-text-body-main"
                                        : "text-text-body-main"
                                } mb-1`}>
                                    {contributor.login}
                                </p>
                                <p className="font-body text-[10px] text-text-body-tertiary">
                                    {contributor.contributions}{" "}
                                    {contributor.contributions === 1
                                        ? "commit"
                                        : "commits"}
                                </p>
                            </a>
                        );
                    })}
                </div>
            </div>
            <Divider />
        </>
    );
}
