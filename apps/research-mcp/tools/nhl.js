import { z } from "zod";

const API_ROOT = "https://api-web.nhle.com/v1/player";

function localized(value) {
    if (typeof value === "string") return value;
    return value?.default ?? null;
}

function formatStats(stats) {
    if (!stats) return null;
    return {
        games_played: stats.gamesPlayed ?? null,
        goals: stats.goals ?? null,
        assists: stats.assists ?? null,
        points: stats.points ?? null,
        plus_minus: stats.plusMinus ?? null,
        pim: stats.pim ?? null,
        shots: stats.shots ?? null,
        wins: stats.wins ?? null,
        losses: stats.losses ?? null,
        ot_losses: stats.otLosses ?? null,
        save_pct: stats.savePctg ?? null,
        goals_against_avg: stats.goalsAgainstAvg ?? null,
        shutouts: stats.shutouts ?? null,
    };
}

function latestNhlSeason(seasonTotals) {
    const nhl = (seasonTotals ?? []).filter(
        (s) => s.leagueAbbrev === "NHL" && s.gameTypeId === 2,
    );
    if (nhl.length === 0) return null;
    const latest = nhl.reduce((a, b) => (b.season > a.season ? b : a));
    return {
        season: latest.season,
        team: localized(latest.teamName),
        ...formatStats(latest),
    };
}

export const nhlTools = [
    [
        "nhl_player",
        "Look up an NHL player by numeric player ID (e.g. 8478402 for Connor McDavid) and return their team, position, bio and current-season plus career regular-season stats. There is no name search — a name alone cannot be resolved to an ID.",
        {
            player_id: z
                .number()
                .int()
                .positive()
                .describe(
                    "Numeric NHL player ID, e.g. 8478402 for Connor McDavid",
                ),
        },
        async ({ player_id }, fetchJson) => {
            if (!Number.isInteger(player_id) || player_id <= 0)
                throw new Error("player_id must be a positive integer.");
            let data;
            try {
                data = await fetchJson(`${API_ROOT}/${player_id}/landing`);
            } catch (error) {
                if (/HTTP 404/.test(error.message))
                    throw new Error(`Player not found: ${player_id}`);
                throw error;
            }
            const birthPlace = [
                localized(data.birthCity),
                localized(data.birthStateProvince),
                data.birthCountry,
            ]
                .filter(Boolean)
                .join(", ");
            return {
                player_id: data.playerId ?? player_id,
                name: [localized(data.firstName), localized(data.lastName)]
                    .filter(Boolean)
                    .join(" "),
                position: data.position ?? null,
                team: localized(data.fullTeamName),
                team_abbrev: data.currentTeamAbbrev ?? null,
                sweater_number: data.sweaterNumber ?? null,
                shoots_catches: data.shootsCatches ?? null,
                height_cm: data.heightInCentimeters ?? null,
                weight_kg: data.weightInKilograms ?? null,
                birth_date: data.birthDate ?? null,
                birth_place: birthPlace || null,
                draft: data.draftDetails
                    ? {
                          year: data.draftDetails.year ?? null,
                          team: data.draftDetails.teamAbbrev ?? null,
                          round: data.draftDetails.round ?? null,
                          overall_pick: data.draftDetails.overallPick ?? null,
                      }
                    : null,
                active: data.isActive ?? null,
                current_season: latestNhlSeason(data.seasonTotals),
                career_regular_season: formatStats(
                    data.careerTotals?.regularSeason,
                ),
            };
        },
    ],
];
