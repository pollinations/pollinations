// Matches a community model to the official model it's named after, e.g.
// "community/Saauf/gpt-6-luna" -> "openai/gpt-6-luna". Used to flag
// impersonating community models whose eval score diverges from the model
// they're named after.

function baseName(modelName) {
    const parts = modelName.split("/");
    return parts[parts.length - 1].toLowerCase();
}

export function findOfficialMatch(model, officialModels) {
    if (!model.community) return null;
    const target = baseName(model.name);
    return (
        officialModels.find((official) => baseName(official.name) === target) ||
        officialModels.find((official) =>
            (official.aliases || []).some(
                (alias) => baseName(alias) === target,
            ),
        ) ||
        null
    );
}
