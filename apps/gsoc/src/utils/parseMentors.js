import fm from "front-matter";
export async function parseMentors(url = "/GSOC/MENTORS.md") {
    const response = await fetch(url);
    const text = await response.text();

    const regex = /---\n([\s\S]*?)\n---\n([\s\S]*?)(?=\n---\n|$)/g;
    const mentors = [];

    for (const match of text.matchAll(regex)) {
        const [, yaml, body] = match;
        const fmString = `---\n${yaml}\n---\n${body}`;
        const { attributes } = fm(fmString);

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
                longDescription: body.trim(),
            });
        }
    }

    return mentors;
}
