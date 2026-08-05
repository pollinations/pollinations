import { parseFrontmatterDocuments } from "./parseFrontmatterDocuments.js";

export async function parseMentors(url = "/GSOC/MENTORS.md") {
    const mentors = [];

    for (const { attributes, body } of await parseFrontmatterDocuments(url)) {
        if (attributes.name) {
            mentors.push({
                id: attributes.id,
                name: attributes.name,
                title: attributes.title,
                bio: attributes.bio,
                expertise: attributes.expertise?.split(", ") || [],
                skills: attributes.skills?.split(", ") || [],
                yearsExperience: parseInt(attributes.yearsExperience, 10) || 0,
                projects: parseInt(attributes.projects, 10) || 0,
                imageUrl: attributes.imageUrl,
                linkedin: attributes.linkedin,
                github: attributes.github,
                email: attributes.email,
                longDescription: body,
            });
        }
    }

    return mentors;
}
