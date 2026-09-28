function normalized(value) {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function leaf(modelName) {
    return modelName.split("/").at(-1) ?? modelName;
}

export function matchOfficialModel(communityModel, officialModels) {
    if (!communityModel?.startsWith("community/")) return null;
    const communityLeaf = normalized(leaf(communityModel));
    if (!communityLeaf) return null;

    const exact = officialModels.find(
        (name) => normalized(leaf(name)) === communityLeaf,
    );
    if (exact) return exact;

    const candidates = officialModels
        .map((name) => ({ name, leaf: normalized(leaf(name)) }))
        .filter(
            ({ leaf: officialLeaf }) =>
                officialLeaf.length >= 6 &&
                (communityLeaf.startsWith(`${officialLeaf}-`) ||
                    officialLeaf.startsWith(`${communityLeaf}-`)),
        )
        .sort((a, b) => b.leaf.length - a.leaf.length);

    return candidates[0]?.name ?? null;
}

export function attachOfficialMatches(results) {
    const official = results.filter((row) => !row.community).map((row) => row.model);
    const byModel = new Map(results.map((row) => [row.model, row]));

    return results.map((row) => {
        if (!row.community) return { ...row, officialMatch: null, comparison: null };
        const officialMatch = matchOfficialModel(row.model, official);
        const peer = officialMatch ? byModel.get(officialMatch) : null;
        if (!peer) return { ...row, officialMatch, comparison: null };
        const gap = Math.abs(row.score - peer.score);
        const combinedMargin = Math.sqrt(
            row.marginOfError ** 2 + peer.marginOfError ** 2,
        );
        return {
            ...row,
            officialMatch,
            comparison: {
                officialScore: peer.score,
                gap,
                combinedMargin,
                significant: gap > combinedMargin,
            },
        };
    });
}
