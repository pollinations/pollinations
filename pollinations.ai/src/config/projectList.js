// Project entries support an optional submissionDate field (format: "YYYY-MM-DD")

// Import projects from individual category files
import { vibeCodingProjects } from "./projects/vibeCoding.js";
import { creativeProjects } from "./projects/creative.js";
import { gamesProjects } from "./projects/games.js";
import { hackAndBuildProjects } from "./projects/hackAndBuild.js";
import { chatProjects } from "./projects/chat.js";
import { socialBotsProjects } from "./projects/socialBots.js";
import { learnProjects } from "./projects/learn.js";
import { hacktoberfestProjects } from "./projects/hacktoberfest.js";

// New categories based on GitHub issue #2275
export const categories = [
    {
        title: "Hacktoberfest 2025 🎃",
        key: "hacktoberfest",
        description: "Frontend-only apps built with Pollinations AI during Hacktoberfest 2025",
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
    hacktoberfest: hacktoberfestProjects,
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
        hacktoberfest: [],
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

// Create a source object with all imported project arrays
const allProjects = {
    hacktoberfest: hacktoberfestProjects,
    vibeCoding: vibeCodingProjects,
    creative: creativeProjects,
    games: gamesProjects,
    hackAndBuild: hackAndBuildProjects,
    chat: chatProjects,
    socialBots: socialBotsProjects,
    learn: learnProjects,
};

// Generate the organized projects
const organizedProjects = organizeProjects(allProjects);
// Export the final projects object
Object.keys(projects).forEach((category) => {
    projects[category] = organizedProjects[category];
});
