import fm from "front-matter";

/**
 * Parse timeline from TIMELINE.md using front-matter
 */
export async function parseTimeline(url = "/GSOC/TIMELINE.md") {
    const response = await fetch(url);
    const text = await response.text();

    const regex = /---\n([\s\S]*?)\n---/g;
    const timeline = [];

    for (const match of text.matchAll(regex)) {
        const [, yaml] = match;
        const fmString = `---\n${yaml}\n---\n`;
        const { attributes } = fm(fmString);

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
