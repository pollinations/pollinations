import fm from "front-matter";

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
    const response = await fetch(url);
    const text = await response.text();

    // Match complete frontmatter blocks: ---\nyaml\n---\nbody
    // Each match captures: full block with frontmatter + body until next --- or end
    const regex = /---\n([\s\S]*?)\n---\n([\s\S]*?)(?=\n---\n|$)/g;
    const projects = [];

    for (const match of text.matchAll(regex)) {
        const [, yaml, body] = match;
        // Reconstruct as valid frontmatter string for fm()
        const fmString = `---\n${yaml}\n---\n${body}`;
        const { attributes } = fm(fmString);

        if (attributes.title) {
            const paragraphs = body.trim().split("\n\n").filter(Boolean);
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
