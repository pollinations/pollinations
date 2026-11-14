import { z } from "zod";

const API_ROOT = "https://clinicaltrials.gov/api/v2/studies";
const TEXT_LIMIT = 2_000;

// The fields= param is load-bearing: the unfiltered list response is ~26 KB
// for 2 studies, the filtered one ~1.3 KB. The API returns no total count,
// only a nextPageToken, so search reports hasMore instead of totalResults.
const SEARCH_FIELDS =
    "NCTId,BriefTitle,OverallStatus,Phase,LeadSponsorName,Condition,StartDate,PrimaryCompletionDate,LocationCountry";
const STUDY_FIELDS = `${SEARCH_FIELDS},BriefSummary,StudyType,InterventionName,EligibilityCriteria`;

const STATUS_VALUES = [
    "RECRUITING",
    "NOT_YET_RECRUITING",
    "ENROLLING_BY_INVITATION",
    "ACTIVE_NOT_RECRUITING",
    "COMPLETED",
    "TERMINATED",
    "WITHDRAWN",
    "SUSPENDED",
    "UNKNOWN",
];

function cleanString(val) {
    if (!val) return "";
    return String(val)
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function formatStudy(section) {
    const id = section.identificationModule ?? {};
    const status = section.statusModule ?? {};
    const sponsor = section.sponsorCollaboratorsModule ?? {};
    const design = section.designModule ?? {};
    const conditions = section.conditionsModule?.conditions ?? [];
    const countries = [
        ...new Set(
            (section.contactsLocationsModule?.locations ?? [])
                .map((loc) => loc.country)
                .filter(Boolean),
        ),
    ];
    const nctId = id.nctId ?? null;
    return {
        nctId,
        title: cleanString(id.briefTitle) || null,
        status: status.overallStatus ?? null,
        phases: design.phases ?? [],
        studyType: design.studyType ?? null,
        sponsor: sponsor.leadSponsor?.name ?? null,
        conditions: conditions.slice(0, 10),
        startDate: status.startDateStruct?.date ?? null,
        primaryCompletionDate: status.primaryCompletionDateStruct?.date ?? null,
        countries: countries.slice(0, 10),
        url: nctId ? `https://clinicaltrials.gov/study/${nctId}` : null,
    };
}

function formatStudyDetail(section) {
    const summary = section.descriptionModule?.briefSummary
        ? cleanString(section.descriptionModule.briefSummary)
        : null;
    const eligibility = section.eligibilityModule?.eligibilityCriteria
        ? cleanString(section.eligibilityModule.eligibilityCriteria)
        : null;
    const interventions = (section.armsInterventionsModule?.interventions ?? [])
        .map((i) => i.name)
        .filter(Boolean);
    return {
        ...formatStudy(section),
        summary: summary ? summary.slice(0, TEXT_LIMIT) : null,
        interventions: [...new Set(interventions)].slice(0, 10),
        eligibility: eligibility ? eligibility.slice(0, TEXT_LIMIT) : null,
    };
}

export const clinicalTrialsTools = [
    [
        "clinicaltrials_search",
        "Search ClinicalTrials.gov for clinical studies by keyword, condition, or intervention, with an optional recruitment-status filter.",
        {
            query: z
                .string()
                .min(1)
                .max(500)
                .describe("Search query (condition, intervention, or keyword)"),
            overallStatus: z
                .enum(STATUS_VALUES)
                .optional()
                .describe(
                    "Only return studies with this recruitment status (e.g. RECRUITING)",
                ),
            limit: z
                .number()
                .int()
                .min(1)
                .max(50)
                .default(10)
                .describe(
                    "Maximum number of results to return (1-50, default 10)",
                ),
        },
        async ({ query, overallStatus, limit }, fetchJson) => {
            const params = new URLSearchParams({
                "query.term": query.trim(),
                pageSize: String(limit),
                fields: SEARCH_FIELDS,
            });
            if (overallStatus)
                params.set("filter.overallStatus", overallStatus);
            const data = await fetchJson(`${API_ROOT}?${params}`);
            const studies = data?.studies ?? [];
            return {
                query: query.trim(),
                results: studies.map((s) =>
                    formatStudy(s.protocolSection ?? {}),
                ),
                hasMore: Boolean(data?.nextPageToken),
            };
        },
    ],
    [
        "clinicaltrials_study",
        "Retrieve details for a specific ClinicalTrials.gov study by NCT number, including summary, interventions, and eligibility criteria.",
        {
            nctId: z
                .string()
                .min(1)
                .max(100)
                .describe(
                    "NCT number (e.g. 'NCT06819371') or a clinicaltrials.gov study URL",
                ),
        },
        async ({ nctId }, fetchJson) => {
            const normalized = nctId
                .trim()
                .replace(/^https?:\/\/clinicaltrials\.gov\/study\//i, "")
                .replace(/\/$/, "")
                .toUpperCase();
            if (!/^NCT\d{8}$/.test(normalized))
                throw new Error("Use an NCT number like 'NCT06819371'.");
            const data = await fetchJson(
                `${API_ROOT}/${normalized}?fields=${STUDY_FIELDS}`,
            );
            return {
                study: formatStudyDetail(data.protocolSection ?? {}),
            };
        },
    ],
];
