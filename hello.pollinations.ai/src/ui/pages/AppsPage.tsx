import { useState, useMemo } from "react";
import { Title, Body } from "../components/ui/typography";
import { Button } from "../components/ui/button";
import { PageCard } from "../components/ui/page-card";
import { PageContainer } from "../components/ui/page-container";
import { SubCard } from "../components/ui/sub-card";
import { ExternalLinkIcon } from "../assets/ExternalLinkIcon";
// @ts-ignore - External JS imports from monorepo
import { creativeProjects } from "../../../../pollinations.ai/src/config/projects/creative.js";
// @ts-ignore - External JS imports from monorepo
import { chatProjects } from "../../../../pollinations.ai/src/config/projects/chat.js";
// @ts-ignore - External JS imports from monorepo
import { gamesProjects } from "../../../../pollinations.ai/src/config/projects/games.js";
// @ts-ignore - External JS imports from monorepo
import { hackAndBuildProjects } from "../../../../pollinations.ai/src/config/projects/hackAndBuild.js";
// @ts-ignore - External JS imports from monorepo
import { learnProjects } from "../../../../pollinations.ai/src/config/projects/learn.js";
// @ts-ignore - External JS imports from monorepo
import { socialBotsProjects } from "../../../../pollinations.ai/src/config/projects/socialBots.js";
// @ts-ignore - External JS imports from monorepo
import { vibeCodingProjects } from "../../../../pollinations.ai/src/config/projects/vibeCoding.js";
import { GithubIcon } from "../assets/SocialIcons";
import { useTheme } from "../contexts/ThemeContext";

// Combine all projects with category tags
const allProjects = [
    ...creativeProjects.map((p: any) => ({ ...p, category: "creative" })),
    ...chatProjects.map((p: any) => ({ ...p, category: "chat" })),
    ...gamesProjects.map((p: any) => ({ ...p, category: "games" })),
    ...hackAndBuildProjects.map((p: any) => ({ ...p, category: "devtools" })),
    ...learnProjects.map((p: any) => ({ ...p, category: "learn" })),
    ...socialBotsProjects.map((p: any) => ({ ...p, category: "socialbots" })),
    ...vibeCodingProjects.map((p: any) => ({ ...p, category: "vibes" })),
];

interface Project {
    category: string;
    name: string;
    url: string;
    description: string;
    author: string;
    repo: string;
    submissionDate: string;
    language: string;
    order: number;
    stars?: number;
    authorEmail?: string;
    hidden?: boolean;
}

interface Category {
    id: string;
    label: string;
}

const CATEGORIES: Category[] = [
    { id: "creative", label: "Creative" },
    { id: "chat", label: "Chat" },
    { id: "games", label: "Games" },
    { id: "devtools", label: "Dev Tools" },
    { id: "learn", label: "Learn" },
    { id: "socialbots", label: "Social Bots" },
    { id: "vibes", label: "Vibes" },
];

// Helper to extract GitHub username from author field
function getGitHubUsername(author: string) {
    if (!author) return null;
    // Remove @ symbol if present
    return author.replace(/^@/, "");
}

// Helper to extract repo name from GitHub URL
function getRepoName(repoUrl: string) {
    if (!repoUrl) return null;
    const match = repoUrl.match(/github\.com\/([^/]+\/[^/]+)/);
    return match ? match[1] : null;
}

interface ProjectCardProps {
    project: Project;
}

// Project Card Component
function ProjectCard({ project }: ProjectCardProps) {
    const githubUsername = getGitHubUsername(project.author);
    const repoName = getRepoName(project.repo);

    return (
        <SubCard className="flex flex-col h-full bg-transparent">
            <div className="flex-1">
                {/* Project name as button */}
                <Button
                    as="a"
                    href={project.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    variant="primary"
                    size="sm"
                    className="self-start mb-3 w-full relative pr-10 shadow-none hover:shadow-none text-left justify-start bg-input-background hover:bg-input-background"
                >
                    <span className="font-headline text-base font-black uppercase text-left block text-text-body-main">
                        {project.name}
                    </span>
                    <ExternalLinkIcon className="w-4 h-4 absolute top-3 right-3 text-text-body-main" />
                </Button>

                {project.description && (
                    <Body className="text-sm text-text-body-secondary line-clamp-6 mb-4">
                        {project.description}
                    </Body>
                )}
            </div>
            <div className="flex flex-wrap gap-2 mt-auto">
                {/* Author Badge */}
                {githubUsername && (
                    <a
                        href={`https://github.com/${githubUsername}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono font-medium bg-input-background hover:bg-input-background border border-border-faint hover:border-border-main transition-all max-w-[200px]"
                        title={`View ${project.author} on GitHub`}
                    >
                        <GithubIcon className="w-3 h-3 text-text-body-main opacity-60 flex-shrink-0" />
                        <span className="truncate text-text-body-main">
                            {project.author}
                        </span>
                    </a>
                )}
                {!githubUsername && project.author && (
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono font-medium bg-input-background border border-border-faint max-w-[200px]">
                        <span className="truncate text-text-body-main">
                            {project.author}
                        </span>
                    </div>
                )}

                {/* Repo Badge */}
                {repoName && (
                    <a
                        href={project.repo}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono font-medium bg-input-background hover:bg-input-background border border-border-faint hover:border-border-main transition-all max-w-[200px]"
                        title={`View ${repoName} on GitHub`}
                    >
                        <GithubIcon className="w-3 h-3 text-text-body-main opacity-60 flex-shrink-0" />
                        <span className="truncate flex-1 min-w-0 text-text-body-main">
                            {repoName}
                        </span>
                        {(project.stars || 0) > 0 && (
                            <span className="text-text-body-secondary flex-shrink-0">
                                ⭐ {project.stars}
                            </span>
                        )}
                    </a>
                )}
            </div>
        </SubCard>
    );
}

export default function AppsPage() {
    const [selectedCategory, setSelectedCategory] = useState("creative");

    // Get page copy from preset
    const { presetCopy } = useTheme();
    const pageCopy = presetCopy.APPS_PAGE;

    // Filter projects by category
    const filteredProjects = useMemo(() => {
        return (allProjects as Project[]).filter((p) => {
            if (p.hidden) return false;
            return p.category === selectedCategory;
        });
    }, [selectedCategory]);

    return (
        <PageContainer>
            <PageCard>
                <Title>{pageCopy.title.text}</Title>
                <Body spacing="none" className="mb-8">
                    {pageCopy.subtitle.text}
                </Body>

                {/* Category Filters */}
                <div className="flex flex-wrap gap-2 mb-8">
                    {CATEGORIES.map((cat) => (
                        <Button
                            key={cat.id}
                            variant="toggle"
                            data-active={selectedCategory === cat.id}
                            onClick={() => setSelectedCategory(cat.id)}
                            className="px-4 py-2 text-sm"
                        >
                            {cat.label}
                        </Button>
                    ))}
                </div>

                {/* Project Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                    {filteredProjects.map((project, index) => (
                        <ProjectCard
                            key={`${project.name}-${index}`}
                            project={project}
                        />
                    ))}
                </div>

                {/* No Results */}
                {filteredProjects.length === 0 && (
                    <div className="text-center py-12">
                        <Body className="text-text-body-main">
                            No projects found in this category yet.
                        </Body>
                    </div>
                )}
            </PageCard>
        </PageContainer>
    );
}
