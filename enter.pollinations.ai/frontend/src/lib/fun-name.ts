import {
    adjectives,
    animals,
    uniqueNamesGenerator,
} from "unique-names-generator";

// A default name such as brave-otter, for new keys and sandboxes.
export function generateFunName(): string {
    return uniqueNamesGenerator({
        dictionaries: [adjectives, animals],
        separator: "-",
        length: 2,
        style: "lowerCase",
    });
}
