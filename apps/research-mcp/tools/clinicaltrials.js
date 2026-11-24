import { z } from "zod";

const API_ROOT = "https://clinicaltrials.gov/api/v2/studies";
const FIELDS = [
    "NCTId",
    "BriefTitle",
    "OverallStatus",
    "StudyType",
    "Phase",
    "Condition",
    "LeadSponsorName",
    "EnrollmentCount",
    "StartDate",
    "CompletionDate",
].join(",");

function formatStudy(entry) {
    const section = entry.protocolSection ?? {};
    const id = section.identificationModule ?? {};
    const status = section.statusModule ?? {};
    const design = section.designModule ?? {};
    return {
        nctId: id.nctId ?? null,
        title: id.briefTitle ?? null,
        status: status.overallStatus ?? null,
        studyType: design.studyType ?? null,
        phases: design.phases ?? [],
        conditions: section.conditionsModule?.conditions ?? [],
        sponsor: section.sponsorCollaboratorsModule?.leadSponsor?.name ?? null,
        enrollment: design.enrollmentInfo?.count ?? null,
        startDate: status.startDateStruct?.date ?? null,
        completionDate: status.completionDateStruct?.date ?? null,
        url: id.nctId ? `https://clinicaltrials.gov/study/${id.nctId}` : null,
    };
}

export const clinicalTrialsTools = [
    [
        "clinicaltrials_search",
        "Search ClinicalTrials.gov for registered studies by condition, drug or keyword. Returns study IDs, recruitment status, phase, sponsor, enrollment, dates and a link to each record. Registry metadata, not medical advice.",
        {
            query: z
                .string()
                .trim()
                .min(1)
                .max(500)
                .describe("Condition, intervention or keyword to search"),
            status: z
                .enum([
                    "RECRUITING",
                    "NOT_YET_RECRUITING",
                    "ENROLLING_BY_INVITATION",
                    "ACTIVE_NOT_RECRUITING",
                    "COMPLETED",
                    "SUSPENDED",
                    "TERMINATED",
                    "WITHDRAWN",
                    "UNKNOWN",
                ])
                .optional()
                .describe("Restrict results to one recruitment status"),
            limit: z
                .number()
                .int()
                .min(1)
                .max(20)
                .default(5)
                .describe("Maximum studies to return (1-20)"),
        },
        async ({ query, status, limit }, fetchJson) => {
            const url = new URL(API_ROOT);
            url.search = new URLSearchParams({
                "query.term": query,
                ...(status ? { "filter.overallStatus": status } : {}),
                pageSize: String(limit),
                format: "json",
                countTotal: "true",
                fields: FIELDS,
            }).toString();
            const data = await fetchJson(url);
            const studies = Array.isArray(data.studies) ? data.studies : [];
            return {
                totalCount: data.totalCount ?? studies.length,
                query,
                studies: studies.map(formatStudy),
                nextPageToken: data.nextPageToken ?? null,
            };
        },
    ],
];
