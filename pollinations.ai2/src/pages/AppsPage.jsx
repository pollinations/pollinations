import { useState, useMemo } from "react";
import { TextGenerator } from "../components/TextGenerator";
import { Title, Body } from "../components/ui/typography";
import { Button } from "../components/ui/button";
import { PageCard } from "../components/ui/page-card";
import { PageContainer } from "../components/ui/page-container";
import { SubCard } from "../components/ui/sub-card";
import { ExternalLinkIcon } from "../icons/ExternalLinkIcon";
import { allProjects } from "../config/projects";
import { Colors } from "../config/colors";
import { ICONS } from "../icons/icons";
import { APPS_PAGE } from "../config/content";

const CATEGORIES = [
    { id: "all", label: "All" },
    { id: "creative", label: "Creative" },
    { id: "chat", label: "Chat" },
    { id: "games", label: "Games" },
    { id: "devtools", label: "Dev Tools" },
    { id: "learn", label: "Learn" },
    { id: "socialbots", label: "Social Bots" },
    { id: "vibes", label: "Vibes" },
];

const PROJECTS_PER_PAGE = 6;

// Helper to extract GitHub username from author field
function getGitHubUsername(author) {
    if (!author) return null;
    // Remove @ symbol if present
    return author.replace(/^@/, "");
}

// Helper to extract repo name from GitHub URL
function getRepoName(repoUrl) {
    if (!repoUrl) return null;
    const match = repoUrl.match(/github\.com\/([^/]+\/[^/]+)/);
    return match ? match[1] : null;
}

// Project Card Component
function ProjectCard({ project }) {
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
                    className="self-start mb-3 w-full relative pr-10 shadow-none hover:shadow-none text-left justify-start bg-offblack/5 hover:bg-lime/20"
                >
                    <span className="font-headline text-base font-black uppercase text-left block text-offblack">
                        {project.name}
                    </span>
                    <ExternalLinkIcon stroke={Colors.offblack} className="w-4 h-4 absolute top-2 right-2" />
                </Button>
                
                {project.description && (
                    <Body className="text-sm text-offblack/70 line-clamp-6 mb-4">
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
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono font-medium bg-offblack/5 hover:bg-offblack/10 border border-offblack/20 hover:border-offblack/40 transition-all max-w-[200px]"
                        title={`View ${project.author} on GitHub`}
                    >
                        <img src={ICONS.github} alt="GitHub" className="w-3 h-3 opacity-60 flex-shrink-0" />
                        <span className="truncate">{project.author}</span>
                    </a>
                )}
                {!githubUsername && project.author && (
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono font-medium bg-offblack/5 border border-offblack/20 max-w-[200px]">
                        <span className="truncate">{project.author}</span>
                    </div>
                )}
                
                {/* Repo Badge */}
                {repoName && (
                    <a
                        href={project.repo}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono font-medium bg-offblack/5 hover:bg-offblack/10 border border-offblack/20 hover:border-offblack/40 transition-all max-w-[200px]"
                        title={`View ${repoName} on GitHub`}
                    >
                        <img src={ICONS.github} alt="GitHub" className="w-3 h-3 opacity-60 flex-shrink-0" />
                        <span className="truncate flex-1 min-w-0">{repoName}</span>
                        {project.stars > 0 && (
                            <span className="text-offblack/70 flex-shrink-0">⭐ {project.stars}</span>
                        )}
                    </a>
                )}
            </div>
        </SubCard>
    );
}

export default function AppsPage() {
    const [selectedCategory, setSelectedCategory] = useState("all");
    const [currentPage, setCurrentPage] = useState(1);

    // Filter projects by category
    const filteredProjects = useMemo(() => {
        if (selectedCategory === "all") {
            return allProjects.filter(p => !p.hidden);
        }
        return allProjects.filter(p => {
            if (p.hidden) return false;
            return p.category === selectedCategory;
        });
    }, [selectedCategory]);

    // Pagination
    const totalPages = Math.ceil(filteredProjects.length / PROJECTS_PER_PAGE);
    const startIndex = (currentPage - 1) * PROJECTS_PER_PAGE;
    const paginatedProjects = filteredProjects.slice(startIndex, startIndex + PROJECTS_PER_PAGE);

    // Reset to page 1 when category changes
    const handleCategoryChange = (categoryId) => {
        setSelectedCategory(categoryId);
        setCurrentPage(1);
    };

    return (
        <PageContainer>
            <PageCard>
                <Title spacing="tight">
                    <TextGenerator content={APPS_PAGE.title} />
                </Title>
                <TextGenerator
                    content={APPS_PAGE.subtitle}
                    as="div"
                    className="font-body text-base text-offblack/80 leading-relaxed mb-8"
                />

                {/* Category Filters */}
                <div className="flex flex-wrap gap-2 mb-8">
                    {CATEGORIES.map((cat) => (
                        <Button
                            key={cat.id}
                            variant="toggle"
                            data-active={selectedCategory === cat.id}
                            onClick={() => handleCategoryChange(cat.id)}
                            className="px-4 py-2 text-sm"
                        >
                            {cat.label}
                        </Button>
                    ))}
                </div>

                {/* Project Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                    {paginatedProjects.map((project, index) => (
                        <ProjectCard key={`${project.name}-${index}`} project={project} />
                    ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-4">
                        <button
                            type="button"
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="px-3 py-1.5 text-xs font-mono text-offblack/60 hover:text-offblack transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                            Previous
                        </button>
                        <div className="text-xs font-mono text-offblack/60">
                            {currentPage}/{totalPages}
                        </div>
                        <button
                            type="button"
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            className="px-3 py-1.5 text-xs font-mono text-offblack/60 hover:text-offblack transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                            Next
                        </button>
                    </div>
                )}

                {/* No Results */}
                {filteredProjects.length === 0 && (
                    <div className="text-center py-12">
                        <Body className="text-offblack/60">
                            No projects found in this category yet.
                        </Body>
                    </div>
                )}
            </PageCard>
        </PageContainer>
    );
}
