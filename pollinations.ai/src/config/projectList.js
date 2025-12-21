// Project entries support an optional submissionDate field (format: "YYYY-MM-DD")

// Import projects from individual category files
import { vibeCodingProjects } from "./projects/vibeCoding.js";
import { creativeProjects } from "./projects/creative.js";
import { gamesProjects } from "./projects/games.js";
import { hackAndBuildProjects } from "./projects/hackAndBuild.js";
import { chatProjects } from "./projects/chat.js";
import { socialBotsProjects } from "./projects/socialBots.js";
import { learnProjects } from "./projects/learn.js";
import { featuredApps } from "./projects/featured.js";

// New categories based on GitHub issue #2275
export const categories = [
    {
        title: "Featured Apps 📱",
        key: "featured",
        description: "Frontend-only apps built with Pollinations AI",
    },
    {
        title: "Vibe Coding ✨",
        key: "vibeCoding",
        description: "No-code / describe-to-code playgrounds and builders",
    },
    {
        title: "Creative 🎨",
        key: "creative",
        description: "Turn prompts into images, video, music, design, slides",
    },
    {
        title: "Games 🎲",
        key: "games",
        description:
            "AI-powered play, interactive fiction, puzzle & agent worlds",
    },
    {
        title: "Hack-&-Build 🛠️",
        key: "hackAndBuild",
        description:
            "SDKs, integration libs, extensions, dashboards, MCP servers",
    },
    {
        title: "Chat 💬",
        key: "chat",
        description: "Standalone chat UIs / multi-model playgrounds",
    },
    {
        title: "Social Bots 🤖",
        key: "socialBots",
        description: "Discord / Telegram / WhatsApp / Roblox bots & NPCs",
    },
    {
        title: "Learn 📚",
        key: "learn",
        description: "Tutorials, guides, style books & educational demos",
    },
];

// Consolidated projects object with imported categories
export const projects = {
    featured: featuredApps,
    vibeCoding: vibeCodingProjects,
    creative: creativeProjects,
    games: gamesProjects,
    hackAndBuild: hackAndBuildProjects,
    chat: chatProjects,
    socialBots: socialBotsProjects,
    learn: learnProjects,
};

// Check if a project is new (submitted within the last 15 days)
const isNewProject = (project) => {
    if (!project.submissionDate) {
        return false;
    }

    try {
        const submissionDate = new Date(project.submissionDate);
        const now = new Date();
        const diffTime = Math.abs(now - submissionDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays <= 15;
    } catch (error) {
        // If there's any error parsing the date, default to removing the emoji
        return true;
    }
};

/**
 * Sort projects by order parameter (ascending) and then by stars (descending)
 *
 * @param {Array} projects - Array of project objects to sort
 * @returns {Array} - Sorted array of projects
 */
const sortProjectsByOrderAndStars = (projects) => {
    return [...projects].sort((a, b) => {
        // First compare by order (lower order comes first)
        const orderA = typeof a.order === "number" ? a.order : 3; // Default to middle order (3) if not specified
        const orderB = typeof b.order === "number" ? b.order : 3;

        if (orderA !== orderB) {
            return orderA - orderB;
        }

        // Then compare by stars (higher stars come first)
        const starsA = a.stars || 0;
        const starsB = b.stars || 0;

        return starsB - starsA;
    });
};

/**
 * Organizes projects into categories
 *
 * @param {Object} sourceProjects - Object containing all projects by category
 * @returns {Object} - Organized projects object with populated categories
 */
const organizeProjects = (sourceProjects) => {
    const result = {
        featured: [],
        vibeCoding: [],
        creative: [],
        games: [],
        hackAndBuild: [],
        chat: [],
        socialBots: [],
        learn: [],
    };

    // Process each category
    Object.keys(sourceProjects).forEach((category) => {
        // First, collect all projects in this category
        const categoryProjects = [];

        // Find projects with order <= 1, prioritizing by stars and then recency
        const order1Projects = sourceProjects[category]
            .filter((project) => project.order <= 1 && !project.hidden)
            .sort((a, b) => {
                // First sort by stars (higher stars first)
                const starsA = a.stars || 0;
                const starsB = b.stars || 0;

                if (starsA !== starsB) {
                    return starsB - starsA;
                }

                // Then by submission date (most recent first)
                const dateA = a.submissionDate
                    ? new Date(a.submissionDate)
                    : new Date(0);
                const dateB = b.submissionDate
                    ? new Date(b.submissionDate)
                    : new Date(0);
                return dateB - dateA;
            })
            .slice(0, 5); // Take top 5

        sourceProjects[category].forEach((project) => {
            // Skip hidden projects
            if (project.hidden) {
                return;
            }

            // Check if project is new and add isNew flag
            const processedProject = {
                ...project,
                isNew: isNewProject(project),
            };

            // Get name for checking
            const normalizedName = project.name;

            // Add any additional processing if needed

            // Add to category collection
            categoryProjects.push(processedProject);
        });

        // Sort projects by order and star count
        const sortedProjects = sortProjectsByOrderAndStars(categoryProjects);

        // Add sorted projects to result
        result[category] = sortedProjects;
    });

    return result;
};

/**
 * Deduplicates projects across categories, keeping only one instance per project
 * Uses project name as the unique identifier
 *
 * @param {Object} sourceProjects - Object containing projects by category
 * @returns {Object} - Deduplicated projects object
 */
const deduplicateProjects = (sourceProjects) => {
    const seenProjects = new Set();
    const result = {};

    // Initialize result structure
    Object.keys(sourceProjects).forEach((category) => {
        result[category] = [];
    });

    // Track which projects have been seen
    Object.keys(sourceProjects).forEach((category) => {
        sourceProjects[category].forEach((project) => {
            const projectKey = project.name.toLowerCase().trim();

            // Only add if not seen before and not hidden
            if (!seenProjects.has(projectKey) && !project.hidden) {
                seenProjects.add(projectKey);
                result[category].push(project);
            }
        });
    });

    return result;
};

// Combine all projects with category tags, deduplicating by project name
const allProjects = (() => {
    const seen = new Set();
    const combined = [
        ...creativeProjects.map((p) => ({ ...p, category: "creative" })),
        ...chatProjects.map((p) => ({ ...p, category: "chat" })),
        ...gamesProjects.map((p) => ({ ...p, category: "games" })),
        ...hackAndBuildProjects.map((p) => ({ ...p, category: "devtools" })),
        ...learnProjects.map((p) => ({ ...p, category: "learn" })),
        ...socialBotsProjects.map((p) => ({ ...p, category: "socialbots" })),
        ...vibeCodingProjects.map((p) => ({ ...p, category: "vibes" })),
    ];

    return combined.filter((project) => {
        const key = project.name.toLowerCase().trim();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
})();

// Deduplicate projects first
const deduplicatedProjects = deduplicateProjects(allProjects);

// Generate the organized projects
const organizedProjects = organizeProjects(deduplicatedProjects);
// Export the final projects object
Object.keys(projects).forEach((category) => {
    projects[category] = organizedProjects[category];
});
