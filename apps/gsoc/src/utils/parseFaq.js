import { parseFrontmatterDocuments } from "./parseFrontmatterDocuments.js";

/**
 * Parse FAQ from FAQ.md using front-matter
 */
export async function parseFaq(url = "/GSOC/FAQ.md") {
    const faq = [];

    for (const { attributes, body } of await parseFrontmatterDocuments(url)) {
        if (attributes.question) {
            faq.push({
                id: parseInt(attributes.id, 10) || faq.length + 1,
                category: attributes.category,
                question: attributes.question,
                answer: body,
            });
        }
    }

    return faq;
}
