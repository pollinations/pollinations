#!/usr/bin/env node

/**
 * Process pending project submissions from .github/pending-projects/
 * Adds them to the appropriate category JS files and deletes the queue files.
 */

import fs from "fs";
import path from "path";

const QUEUE_DIR = ".github/pending-projects";
const PROJECTS_DIR = "pollinations.ai/src/config/projects";

const CATEGORY_FILES = {
    chat: "chat.js",
    creative: "creative.js",
    games: "games.js",
    hackAndBuild: "hackAndBuild.js",
    learn: "learn.js",
    socialBots: "socialBots.js",
    vibeCoding: "vibeCoding.js",
};

function getQueueFiles() {
    if (!fs.existsSync(QUEUE_DIR)) return [];
    return fs
        .readdirSync(QUEUE_DIR)
        .filter((f) => f.endsWith(".json"))
        .map((f) => path.join(QUEUE_DIR, f));
}

function readProject(filePath) {
    const content = fs.readFileSync(filePath, "utf8");
    return JSON.parse(content);
}

function addProjectToCategory(project, category) {
    const fileName = CATEGORY_FILES[category];
    if (!fileName) {
        console.error(`Unknown category: ${category}`);
        return false;
    }

    const filePath = path.join(PROJECTS_DIR, fileName);
    let content = fs.readFileSync(filePath, "utf8");

    // Format the project entry
    const entry = JSON.stringify(project, null, 2).replace(/^/gm, "  ");

    // Insert before final ];
    content = content.replace(/(\}),?(\s*\n];?\s*$)/, `$1,\n${entry}$2`);

    fs.writeFileSync(filePath, content);
    console.log(`Added ${project.name} to ${category}`);
    return true;
}

function main() {
    const queueFiles = getQueueFiles();

    if (queueFiles.length === 0) {
        console.log("No pending projects to process");
        process.exit(0);
    }

    console.log(`Processing ${queueFiles.length} pending project(s)...`);

    let processed = 0;
    for (const file of queueFiles) {
        try {
            const project = readProject(file);
            const category = project.category;
            delete project.category; // Remove category from the stored object

            if (addProjectToCategory(project, category)) {
                fs.unlinkSync(file);
                processed++;
            }
        } catch (err) {
            console.error(`Error processing ${file}:`, err.message);
        }
    }

    console.log(`Processed ${processed} project(s)`);
    process.exit(processed > 0 ? 0 : 1);
}

main();
