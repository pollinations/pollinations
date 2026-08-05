import fm from "front-matter";

const documentPattern = /---\n([\s\S]*?)\n---\n([\s\S]*?)(?=\n---\n|$)/g;

export async function parseFrontmatterDocuments(url) {
    const response = await fetch(url);
    const text = await response.text();

    return Array.from(text.matchAll(documentPattern), ([, yaml, body]) => ({
        attributes: fm(`---\n${yaml}\n---\n`).attributes,
        body: body.trim(),
    }));
}
