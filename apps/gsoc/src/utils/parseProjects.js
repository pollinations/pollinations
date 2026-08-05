import { parseFrontmatterDocuments } from "./parseFrontmatterDocuments.js";

/**
 * Parse projects from PROJECTS.md using front-matter for YAML frontmatter
 *
 * Format: Each project is a complete frontmatter document:
 * ---
 * title: Project Name
 * category: Category
 * ---
 * Description content here.
 */
export async function parseProjects(url = "/GSOC/PROJECTS.md") {
    const projects = [];

    for (const { attributes, body } of await parseFrontmatterDocuments(url)) {
        if (attributes.title) {
            const paragraphs = body.split("\n\n").filter(Boolean);
            projects.push({
                ...attributes,
                technologies: attributes.technologies?.split(", ") || [],
                description: paragraphs[0] || "",
                longDescription:
                    paragraphs.slice(1).join("\n\n") || paragraphs[0] || "",
            });
        }
    }

    return projects;
}
