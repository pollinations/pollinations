#!/usr/bin/env node

/**
 * Script to update broken links table with search results
 *
 * This script updates the BROKEN_LINKS.md file with search results
 * and status information for projects with broken links.
 */

import fs from "fs/promises";
import path from "path";

// Search results and status updates based on web searches
const searchResults = {
    WebGeniusAI: {
        status: "❌ REMOVED",
        note: "Netlify deployment removed, no active GitHub repo found",
        action: "Consider removal from project list",
    },
    "Pollinations Feed": {
        status: "❌ REMOVED",
        note: "Vercel deployment removed, appears to be temporary demo",
        action: "Consider removal from project list",
    },
    "AI 文本转音频 🇨🇳": {
        status: "❌ REMOVED",
        note: "Vercel deployment removed, likely temporary demo",
        action: "Consider removal from project list",
    },
    BlackWave: {
        status: "❌ REMOVED",
        note: "blackwave.studio domain not found, no active presence",
        action: "Consider removal from project list",
    },
    "Snapgen.io": {
        status: "❌ REMOVED",
        note: "Domain snapgen.io not accessible, no GitHub repo found",
        action: "Consider removal from project list",
    },
    "Pollinations AI Video Generator": {
        status: "❌ REMOVED",
        note: "Vercel deployment removed, likely demo/prototype",
        action: "Consider removal - video generation may be available through main Pollinations API",
    },
    "Pollinations AI Image Generator": {
        status: "❌ REMOVED",
        note: "Vercel deployment removed, redundant with main Pollinations.ai",
        action: "Consider removal - functionality available at pollinations.ai",
    },
    "Anime AI Generation": {
        status: "❌ REMOVED",
        note: "Vercel deployment removed, appears to be temporary demo",
        action: "Consider removal from project list",
    },
    "Pollinations Gallery": {
        status: "❌ REMOVED",
        note: "Netlify deployment removed, likely prototype",
        action: "Consider removal from project list",
    },
    "AI PPT Maker": {
        status: "❓ DOMAIN DOWN",
        note: "ppt.monsterstudio.org not accessible, may be temporary",
        action: "Monitor - could be temporary server issues",
    },
};

async function updateBrokenLinksTable() {
    try {
        const brokenLinksPath = path.join(
            process.cwd(),
            "..",
            "BROKEN_LINKS.md",
        );
        let content = await fs.readFile(brokenLinksPath, "utf8");

        // Add search results section
        const searchResultsSection = `
## 🔍 Search Results & Status Updates

> **Last Updated:** ${new Date().toLocaleString()}

The following projects have been investigated through web search to determine their current status:

| Project | Original Status | Updated Status | Notes | Recommended Action |
|---------|----------------|----------------|-------|-------------------|
`;

        let tableRows = "";
        for (const [project, result] of Object.entries(searchResults)) {
            tableRows += `| ${project} | Broken Link | ${result.status} | ${result.note} | ${result.action} |\n`;
        }

        const fullSearchSection =
            searchResultsSection +
            tableRows +
            `

### 📊 Search Summary
- **Total Investigated:** ${Object.keys(searchResults).length} projects
- **Confirmed Dead:** ${Object.values(searchResults).filter((r) => r.status.includes("REMOVED")).length} projects
- **Domain Issues:** ${Object.values(searchResults).filter((r) => r.status.includes("DOMAIN DOWN")).length} projects
- **Recommendation:** Remove ${Object.values(searchResults).filter((r) => r.action.includes("removal")).length} confirmed dead projects

### 🚨 High Priority Actions Needed

**Projects Recommended for Immediate Removal:**
${Object.entries(searchResults)
    .filter(([_, result]) => result.action.includes("removal"))
    .map(([project, _]) => `- ${project}`)
    .join("\n")}

**Projects to Monitor:**
${Object.entries(searchResults)
    .filter(([_, result]) => result.action.includes("Monitor"))
    .map(([project, result]) => `- ${project} - ${result.note}`)
    .join("\n")}

`;

        // Insert the search results section before the "How to Update This Report" section
        const insertPoint = content.indexOf("## 🔄 How to Update This Report");
        if (insertPoint !== -1) {
            content =
                content.slice(0, insertPoint) +
                fullSearchSection +
                content.slice(insertPoint);
        } else {
            // If not found, append at the end
            content += fullSearchSection;
        }

        // Save the updated content
        await fs.writeFile(brokenLinksPath, content);

        console.log("✅ Updated BROKEN_LINKS.md with search results");
        console.log(
            `📊 Investigated ${Object.keys(searchResults).length} projects`,
        );
        console.log(
            `❌ Found ${Object.values(searchResults).filter((r) => r.status.includes("REMOVED")).length} confirmed dead projects`,
        );

        return true;
    } catch (error) {
        console.error(`Error updating broken links table: ${error.message}`);
        return false;
    }
}

// Additional function to create a cleanup script
async function generateCleanupScript() {
    const deadProjects = Object.entries(searchResults)
        .filter(([_, result]) => result.action.includes("removal"))
        .map(([project, _]) => project);

    const cleanupScript = `#!/usr/bin/env node

/**
 * Script to remove confirmed dead projects from project lists
 * 
 * Based on search results, these projects should be removed:
 * ${deadProjects.map((p) => `- ${p}`).join("\n * ")}
 */

const DEAD_PROJECTS = ${JSON.stringify(deadProjects, null, 2)};

console.log('🗑️ Projects recommended for removal:');
DEAD_PROJECTS.forEach(project => {
  console.log(\`  - \${project}\`);
});

console.log('\\n📝 Manual cleanup required in:');
console.log('  - pollinations.ai/src/config/projects/*.js files');
console.log('  - Remove project entries matching the names above');

export { DEAD_PROJECTS };
`;

    await fs.writeFile(
        path.join(process.cwd(), "cleanup-dead-projects.js"),
        cleanupScript,
    );
    console.log("📝 Generated cleanup-dead-projects.js script");
}

// Run the updates
updateBrokenLinksTable()
    .then(() => generateCleanupScript())
    .catch(console.error);
