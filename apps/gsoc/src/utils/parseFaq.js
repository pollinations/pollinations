import fm from "front-matter";

/**
 * Parse FAQ from FAQ.md using front-matter
 */
export async function parseFaq(url = "/GSOC/FAQ.md") {
    const response = await fetch(url);
    const text = await response.text();

    const regex = /---\n([\s\S]*?)\n---\n([\s\S]*?)(?=\n---\n|$)/g;
    const faq = [];

    for (const match of text.matchAll(regex)) {
        const [, yaml, body] = match;
        const fmString = `---\n${yaml}\n---\n${body}`;
        const { attributes } = fm(fmString);

        if (attributes.question) {
            faq.push({
                id: parseInt(attributes.id, 10) || faq.length + 1,
                category: attributes.category,
                question: attributes.question,
                answer: body.trim(),
            });
        }
    }

    return faq;
}
