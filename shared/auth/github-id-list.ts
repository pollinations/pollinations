export const COMMUNITY_MODEL_ALLOWED_GITHUB_IDS = [
    36901823, // ElliotEtag
    5099901, // voodoohop
    235942848, // thomashmyceli
    248917639, // fouchyelliot-rgb
    241978997, // pollen-router
    189873015, // sharktide
    74301576, // Circuit-Overtime
    158852059, // Itachi-1824
    84981998, // Spit-fires
    204561696, // tomdacatto
    93234024, // skullcrushercmd
    201248601, // CloudCompile
    206557620, // smplstuff
    201380514, // MarcosFRG
    88273873, // ytpk
    45744798, // Minor-fun
    178960782, // morriszdweck
    219871313, // mikl-shortcuts
    229514703, // sixfingerdev
    45357531, // cemalgnlts
    123343834, // LynxUnbanned
    244879637, // Catniti
    216855486, // Bakhshi7889
    64634725, // vendouple
] as const;

const COMMUNITY_MODEL_ALLOWED_GITHUB_ID_SET = new Set<number>(
    COMMUNITY_MODEL_ALLOWED_GITHUB_IDS,
);

export function isCommunityModelAllowedGithubId(
    githubId: number | null | undefined,
): boolean {
    return (
        typeof githubId === "number" &&
        COMMUNITY_MODEL_ALLOWED_GITHUB_ID_SET.has(githubId)
    );
}

/**
 * Parse a comma-separated list of numeric GitHub user IDs.
 * Strict: only entries matching /^\d+$/ are kept, so "123abc" is dropped
 * instead of being silently truncated to 123.
 */
export function parseGithubIdList(raw: string | undefined | null): Set<number> {
    if (!raw) return new Set();
    const ids = new Set<number>();
    for (const part of raw.split(",")) {
        const trimmed = part.trim();
        if (!/^\d+$/.test(trimmed)) continue;
        const n = Number(trimmed);
        if (n > 0) ids.add(n);
    }
    return ids;
}
