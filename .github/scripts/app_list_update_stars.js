#!/usr/bin/env node

/**
 * Script to fetch GitHub star counts and update the project list file
 *
 * This script can be used in two ways:
 *
 * 1. Without arguments: Updates the project list file with star counts
 *    - Imports all project data from category files
 *    - Finds all GitHub repository URLs
 *    - Fetches star counts for repositories that don't already have them
 *    - Updates the files with the star counts
 *
 * 2. With owner/repo argument: Fetches and outputs star count for a specific repository
 *    - Fetches the star count for the specified repository
 *    - Outputs the star count in various formats (plain, formatted, markdown)
 *
 * Usage:
 *   - Update project list: node app_list_update_stars.js
 *   - Get stars for repo: node app_list_update_stars.js owner/repo
 *
 */

import fs from "fs";
import path from "path";
import https from "https";

// Import all project data
import { vibeCodingProjects } from "../../pollinations.ai/src/config/projects/vibeCoding.js";
import { creativeProjects } from "../../pollinations.ai/src/config/projects/creative.js";
import { gamesProjects } from "../../pollinations.ai/src/config/projects/games.js";
import { hackAndBuildProjects } from "../../pollinations.ai/src/config/projects/hackAndBuild.js";
import { chatProjects } from "../../pollinations.ai/src/config/projects/chat.js";
import { socialBotsProjects } from "../../pollinations.ai/src/config/projects/socialBots.js";
import { learnProjects } from "../../pollinations.ai/src/config/projects/learn.js";

// Paths to project files (relative to the repository root)
const PROJECT_LIST_PATH = path.join(
    "pollinations.ai",
    "src",
    "config",
    "projectList.js",
);
const PROJECT_CATEGORY_PATHS = [
    path.join("pollinations.ai", "src", "config", "projects", "vibeCoding.js"),
    path.join("pollinations.ai", "src", "config", "projects", "creative.js"),
    path.join("pollinations.ai", "src", "config", "projects", "games.js"),
    path.join(
        "pollinations.ai",
        "src",
        "config",
        "projects",
        "hackAndBuild.js",
    ),
    path.join("pollinations.ai", "src", "config", "projects", "chat.js"),
    path.join("pollinations.ai", "src", "config", "projects", "socialBots.js"),
    path.join("pollinations.ai", "src", "config", "projects", "learn.js"),
];

// Function to extract owner and repo from GitHub URL
function extractOwnerAndRepo(url) {
    // Handle different GitHub URL formats
    const githubRegex = /github\.com\/([^\/]+)\/([^\/\s]+)/;
    const match = url.match(githubRegex);

    if (match && match.length >= 3) {
        return {
            owner: match[1],
            repo: match[2].replace(/\.git$/, ""), // Remove .git if present
        };
    }

    return null;
}

// Function to fetch star count from GitHub API
function fetchStarCount(owner, repo) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: "api.github.com",
            path: `/repos/${owner}/${repo}`,
            method: "GET",
            headers: {
                "User-Agent": "GitHub-Star-Counter",
            },
        };

        const req = https.request(options, (res) => {
            let data = "";

            res.on("data", (chunk) => {
                data += chunk;
            });

            res.on("end", () => {
                try {
                    const response = JSON.parse(data);
                    if (response.stargazers_count !== undefined) {
                        resolve({
                            stars: response.stargazers_count,
                            fullResponse: response,
                        });
                    } else if (response.message) {
                        reject(
                            new Error(`GitHub API error: ${response.message}`),
                        );
                    } else {
                        reject(new Error("Failed to get star count"));
                    }
                } catch (error) {
                    reject(error);
                }
            });
        });

        req.on("error", (error) => {
            reject(error);
        });

        req.end();
    });
}

// Function to format star count for display
function formatStarCount(stars) {
    if (stars >= 1000) {
        return (stars / 1000).toFixed(1) + "k";
    }
    return stars.toString();
}

// Function to format JavaScript object without quoted keys
function formatJavaScriptObject(obj, indent = 0) {
    const spaces = "  ".repeat(indent);
    const innerSpaces = "  ".repeat(indent + 1);

    if (Array.isArray(obj)) {
        if (obj.length === 0) return "[]";

        let result = "[\n";
        obj.forEach((item, index) => {
            result += innerSpaces + formatJavaScriptObject(item, indent + 1);
            if (index < obj.length - 1) result += ",";
            result += "\n";
        });
        result += spaces + "]";
        return result;
    }

    if (obj && typeof obj === "object") {
        const keys = Object.keys(obj);
        if (keys.length === 0) return "{}";

        let result = "{\n";
        keys.forEach((key, index) => {
            const value = obj[key];
            result += innerSpaces + key + ": ";

            if (typeof value === "string") {
                result += `"${value.replace(/"/g, '\\"')}"`;
            } else if (
                typeof value === "number" ||
                typeof value === "boolean"
            ) {
                result += value;
            } else {
                result += formatJavaScriptObject(value, indent + 1);
            }

            if (index < keys.length - 1) result += ",";
            result += "\n";
        });
        result += spaces + "}";
        return result;
    }

    return JSON.stringify(obj);
}

// Function to fetch and display stars for a specific repository
async function fetchAndDisplayStars(ownerRepo) {
    try {
        const [owner, repo] = ownerRepo.split("/");

        if (!owner || !repo) {
            console.error('Invalid repository format. Please use "owner/repo"');
            console.error(
                "Example: node app_list_update_stars.js pollinations/pollinations",
            );
            process.exit(1);
        }

        console.log(`Fetching star count for ${owner}/${repo}...`);
        const result = await fetchStarCount(owner, repo);
        const stars = result.stars;

        console.log("\nResults:");
        console.log("-------------------------------------");
        console.log(`Repository:    ${owner}/${repo}`);
        console.log(`Stars:         ${stars}`);
        console.log(`Formatted:     ⭐ ${formatStarCount(stars)}`);
        console.log(
            `Markdown:      [${owner}/${repo}](https://github.com/${owner}/${repo}) - ⭐ ${formatStarCount(stars)}`,
        );
        console.log("-------------------------------------");

        // Output just the number for easy parsing
        console.log("\nStar count (raw number):");
        console.log(stars);
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
}

// All project categories with their file paths
const projectCategories = {
    vibeCoding: {
        data: vibeCodingProjects,
        filePath: path.join(
            "pollinations.ai",
            "src",
            "config",
            "projects",
            "vibeCoding.js",
        ),
    },
    creative: {
        data: creativeProjects,
        filePath: path.join(
            "pollinations.ai",
            "src",
            "config",
            "projects",
            "creative.js",
        ),
    },
    games: {
        data: gamesProjects,
        filePath: path.join(
            "pollinations.ai",
            "src",
            "config",
            "projects",
            "games.js",
        ),
    },
    hackAndBuild: {
        data: hackAndBuildProjects,
        filePath: path.join(
            "pollinations.ai",
            "src",
            "config",
            "projects",
            "hackAndBuild.js",
        ),
    },
    chat: {
        data: chatProjects,
        filePath: path.join(
            "pollinations.ai",
            "src",
            "config",
            "projects",
            "chat.js",
        ),
    },
    socialBots: {
        data: socialBotsProjects,
        filePath: path.join(
            "pollinations.ai",
            "src",
            "config",
            "projects",
            "socialBots.js",
        ),
    },
    learn: {
        data: learnProjects,
        filePath: path.join(
            "pollinations.ai",
            "src",
            "config",
            "projects",
            "learn.js",
        ),
    },
};

// Function to process all project files
async function processProjectList() {
    try {
        let totalUpdates = 0;
        let totalSkipped = 0;

        // Process each category
        for (const [categoryName, category] of Object.entries(
            projectCategories,
        )) {
            console.log(`\nProcessing ${categoryName} projects...`);

            const projectsToUpdate = [];
            const promises = [];

            // Find projects with GitHub URLs
            category.data.forEach((project, index) => {
                const githubUrl = project.url || project.repo;
                if (githubUrl && githubUrl.includes("github.com")) {
                    const ownerRepo = extractOwnerAndRepo(githubUrl);
                    if (ownerRepo) {
                        projectsToUpdate.push({
                            project,
                            index,
                            url: githubUrl,
                            owner: ownerRepo.owner,
                            repo: ownerRepo.repo,
                        });
                        promises.push(
                            fetchStarCount(ownerRepo.owner, ownerRepo.repo),
                        );
                    }
                }
            });

            if (projectsToUpdate.length === 0) {
                console.log(`  No GitHub projects found in ${categoryName}`);
                continue;
            }

            // Wait for all API calls to complete
            const results = await Promise.allSettled(promises);
            let categoryUpdates = 0;

            // Process results and update project data
            for (let i = 0; i < projectsToUpdate.length; i++) {
                const result = results[i];
                const projectInfo = projectsToUpdate[i];

                if (result.status === "fulfilled") {
                    const starCount = result.value.stars;
                    const currentStars = projectInfo.project.stars;

                    console.log(
                        `${projectInfo.owner}/${projectInfo.repo}: ${starCount} stars`,
                    );

                    if (currentStars !== starCount) {
                        // Update the project data with new star count
                        category.data[projectInfo.index].stars = starCount;
                        categoryUpdates++;

                        if (currentStars) {
                            console.log(
                                `  Updated from ${currentStars} to ${starCount} stars`,
                            );
                        } else {
                            console.log(
                                `  Added new stars field: ${starCount}`,
                            );
                        }
                    } else {
                        console.log(`  Stars unchanged: ${starCount}`);
                        totalSkipped++;
                    }
                } else {
                    console.error(
                        `Failed to fetch stars for ${projectInfo.owner}/${projectInfo.repo}: ${result.reason}`,
                    );
                }
            }

            // Write updated file if there were changes
            if (categoryUpdates > 0) {
                const fileContent = fs.readFileSync(category.filePath, "utf8");

                // Create updated content by regenerating the export
                const exportName = categoryName + "Projects";
                const formattedData = formatJavaScriptObject(category.data);
                const updatedFileContent = fileContent.replace(
                    new RegExp(
                        `export const ${exportName} = \\[[\\s\\S]*?\\];`,
                        "m",
                    ),
                    `export const ${exportName} = ${formattedData};`,
                );

                fs.writeFileSync(category.filePath, updatedFileContent, "utf8");
                console.log(
                    `  Updated ${categoryUpdates} projects in ${categoryName}`,
                );
                totalUpdates += categoryUpdates;
            } else {
                console.log(`  No updates needed for ${categoryName}`);
            }
        }

        console.log(
            `\nSummary: ${totalUpdates} updated, ${totalSkipped} skipped`,
        );
    } catch (error) {
        console.error("Error processing file:", error);
        process.exit(1);
    }
}

// Main function
async function main() {
    // Check if a repository is provided as an argument
    if (process.argv.length > 2) {
        // If an argument is provided, fetch and display stars for that repository
        await fetchAndDisplayStars(process.argv[2]);
    } else {
        // Otherwise, process the project list file
        await processProjectList();
    }
}

// Run the script
main();
