import { parseFrontmatterDocuments } from "./parseFrontmatterDocuments.js";

/**
 * Parse timeline from TIMELINE.md using front-matter
 */
export async function parseTimeline(url = "/GSOC/TIMELINE.md") {
    const timeline = [];

    for (const { attributes } of await parseFrontmatterDocuments(url)) {
        if (attributes.title) {
            timeline.push({
                title: attributes.title,
                description: attributes.description,
                startDate: attributes.startDate,
                endDate: attributes.endDate,
                isCurrent: attributes.isCurrent || false,
            });
        }
    }

    return timeline;
}
