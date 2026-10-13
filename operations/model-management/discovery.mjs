import {
    buildDiscoveryExtraction,
    validateDiscoveryExtraction,
} from "./jev.mjs";
import { exactModelIdentity } from "./price-evidence.mjs";

export function discoveryCandidates(sources, inventory) {
    const candidates = [],
        seen = new Set();
    let omitted = 0;
    for (const source of sources) {
        if (source.status !== "fetched" || typeof source.text !== "string")
            continue;
        const names = new Set(
            [
                ...source.text.matchAll(
                    /(?<![\w:/])([A-Za-z0-9][\w.-]{1,79}\/[A-Za-z0-9][\w.-]{1,119})(?![\w/.-])/g,
                ),
            ].map((match) => match[1]),
        );
        for (const match of source.text.matchAll(
            /\b(?:released|introducing|launched|announcing)\s+([A-Z][\w.-]+(?:\s+(?:[A-Z][\w.-]+|\d[\w.-]*)){0,3})(?=[,.;\n]|\s+(?:our|is|as)\b)/g,
        ))
            names.add(match[1]);
        for (const match of source.text.matchAll(
            /\b([A-Z][\w.-]+(?:\s+[A-Z][\w.-]+){0,2})\s+(?:offers|provides|hosts|serves)\s+(?:hosted\s+|serverless\s+|managed\s+)?inference\b/g,
        ))
            names.add(match[1]);
        for (const match of source.text.matchAll(
            /^#{1,6}\s+(?:(?:Model(?: Card)?(?: for)?|Provider)\s*:?\s+)?([^\n]{2,120})$/gm,
        ))
            names.add(match[1].trim());
        for (const link of source.links ?? [])
            if (
                typeof link.text === "string" &&
                link.text.trim().length >= 3 &&
                link.text.trim().length <= 120
            )
                names.add(link.text.trim());
        let perSource = 0;
        for (const name of names) {
            const key = `${source.id}:${name.toLowerCase()}`;
            if (
                seen.has(key) ||
                /^(?:pricing|models?|embeddings?|input|output|details|documentation|read more|learn more|home|overview|introduction|api reference|terms|privacy)$/i.test(
                    name,
                ) ||
                (name.includes("/") &&
                    inventory.some((model) =>
                        [model.name, ...(model.aliases ?? [])].some(
                            (official) =>
                                exactModelIdentity(name, official) ||
                                exactModelIdentity(
                                    name,
                                    official.split("/").at(-1),
                                ),
                        ),
                    ))
            )
                continue;
            const offset = source.text.indexOf(name);
            if (offset < 0) continue;
            if (perSource >= 6 || candidates.length >= 96) {
                omitted++;
                continue;
            }
            const start = Math.max(0, offset - 140),
                end = Math.min(source.text.length, offset + name.length + 180);
            const quote = source.text.slice(start, end);
            if (quote.length < 8 || quote.length > 800) continue;
            candidates.push({
                id: `entity-${candidates.length + 1}`,
                name,
                quote,
                sourceId: source.id,
                url: source.url,
                start,
                end,
            });
            seen.add(key);
            perSource++;
        }
    }
    return { candidates, omitted };
}

export async function extractDiscoveries(sources, inventory, decision) {
    const literal = discoveryCandidates(sources, inventory);
    const extracted = {
        discoveries: [],
        grades: [],
        requestDigests: [],
        gaps: [],
    };
    const represented = new Set(
        literal.candidates.map(({ sourceId }) => sourceId),
    );
    const noLiteral = sources.filter(
        (source) => source.status === "fetched" && !represented.has(source.id),
    );
    if (noLiteral.length)
        extracted.gaps.push(
            `${noLiteral.length} fetched pages yielded no bounded literal entities; free-text identity evidence remains unresolved`,
        );
    for (let offset = 0; offset < literal.candidates.length; ) {
        let size = Math.min(8, literal.candidates.length - offset),
            payload;
        while (size) {
            try {
                payload = buildDiscoveryExtraction(
                    literal.candidates.slice(offset, offset + size),
                );
                break;
            } catch (error) {
                if (size === 1 || !/context bound/.test(error.message))
                    throw error;
                size--;
            }
        }
        const result = await decision(payload, validateDiscoveryExtraction);
        extracted.grades.push(...result.grades);
        extracted.requestDigests.push(result.requestDigest);
        for (const selected of result.selected) {
            if (
                selected.choice === "model" &&
                inventory.some((model) =>
                    [model.name, ...(model.aliases ?? [])].some(
                        (name) =>
                            exactModelIdentity(selected.name, name) ||
                            exactModelIdentity(
                                selected.name,
                                name.split("/").at(-1),
                            ),
                    ),
                )
            )
                continue;
            const candidate = literal.candidates.find(
                ({ id }) => id === selected.id,
            );
            const previous = extracted.discoveries.find(
                (item) =>
                    item.kind === selected.choice &&
                    item.name.toLowerCase() === selected.name.toLowerCase(),
            );
            if (previous) {
                if (!previous.sourceIds.includes(selected.sourceId))
                    previous.sourceIds.push(selected.sourceId);
                continue;
            }
            extracted.discoveries.push({
                name: selected.name,
                kind: selected.choice,
                reason: `Source identifies a ${selected.choice} research lead; popularity, release recency, pricing and API availability require verification.`,
                sourceIds: [selected.sourceId],
                extraction: {
                    id: selected.id,
                    quote: selected.quote,
                    start: candidate.start,
                    end: candidate.end,
                    requestDigest: result.requestDigest,
                    selectedProbability: selected.selectedProbability,
                },
            });
        }
        if (result.ambiguous.length)
            extracted.gaps.push(
                `${result.ambiguous.length} literal entities need further identity or relevance evidence`,
            );
        offset += size;
    }
    if (literal.omitted)
        extracted.gaps.push(
            `${literal.omitted} additional literal entities remain unexamined because of the bounded extraction pass`,
        );
    return extracted;
}
