export interface GlobalAbuseUser {
    id: string;
    email: string;
    github_id: number | null;
    github_username: string;
    tier: string;
    created_at: number;
    trust_score: number | null;
}

export interface GlobalAbuseSession {
    user_id: string;
    ip_address: string | null;
    user_agent: string | null;
    created_at: number;
}

export interface UserSignalHit {
    type:
        | "shared_ip"
        | "shared_user_agent"
        | "email_pattern"
        | "github_pattern"
        | "creation_cluster";
    key: string;
    size: number;
    label: string;
}

export interface SuspiciousCohortMember extends GlobalAbuseUser {
    signal_hits: UserSignalHit[];
}

export interface SuspiciousCohort {
    id: string;
    members: SuspiciousCohortMember[];
    signal_summary: string[];
}

const MAX_SHARED_IP_GROUP = 8;
const MAX_SHARED_USER_AGENT_GROUP = 5;
const MAX_PATTERN_GROUP = 8;
const MAX_CREATION_CLUSTER_GROUP = 10;
const CREATION_CLUSTER_WINDOW_SECONDS = 60 * 60;

function slugifyPattern(value: string | null | undefined): string | null {
    if (!value) return null;
    const normalized = value
        .toLowerCase()
        .replace(/\d+/g, "#")
        .replace(/[^a-z#]+/g, "")
        .replace(/#+/g, "#");
    if (normalized.length < 4 || !/[a-z]/.test(normalized)) {
        return null;
    }
    return normalized;
}

function normalizeUserAgent(value: string | null | undefined): string | null {
    if (!value) return null;
    const normalized = value.trim().replace(/\s+/g, " ");
    if (normalized.length < 24) return null;
    return normalized;
}

function sanitizePromptField(
    value: string | number | null | undefined,
): string {
    return String(value ?? "")
        .replace(/,/g, " ")
        .replace(/\|/g, "/")
        .replace(/\s+/g, " ")
        .trim();
}

function addHit(
    hitsByUserId: Map<string, UserSignalHit[]>,
    userIds: string[],
    hit: Omit<UserSignalHit, "label">,
): void {
    const label = `${hit.type}:${hit.size}`;
    for (const userId of userIds) {
        const current = hitsByUserId.get(userId) || [];
        current.push({ ...hit, label });
        hitsByUserId.set(userId, current);
    }
}

function buildSignalGroups(
    users: GlobalAbuseUser[],
    sessions: GlobalAbuseSession[],
): Map<string, UserSignalHit[]> {
    const hitsByUserId = new Map<string, UserSignalHit[]>();
    const usersById = new Map(users.map((user) => [user.id, user]));

    const ipGroups = new Map<string, Set<string>>();
    const userAgentGroups = new Map<string, Set<string>>();
    for (const session of sessions) {
        if (!usersById.has(session.user_id)) continue;

        const ip = session.ip_address?.trim();
        if (ip) {
            const group = ipGroups.get(ip) || new Set<string>();
            group.add(session.user_id);
            ipGroups.set(ip, group);
        }

        const normalizedUserAgent = normalizeUserAgent(session.user_agent);
        if (normalizedUserAgent) {
            const group =
                userAgentGroups.get(normalizedUserAgent) || new Set<string>();
            group.add(session.user_id);
            userAgentGroups.set(normalizedUserAgent, group);
        }
    }

    for (const [ip, userIds] of ipGroups) {
        const members = Array.from(userIds);
        if (members.length < 2 || members.length > MAX_SHARED_IP_GROUP)
            continue;
        addHit(hitsByUserId, members, {
            type: "shared_ip",
            key: ip,
            size: members.length,
        });
    }

    for (const [userAgent, userIds] of userAgentGroups) {
        const members = Array.from(userIds);
        if (
            members.length < 2 ||
            members.length > MAX_SHARED_USER_AGENT_GROUP
        ) {
            continue;
        }
        addHit(hitsByUserId, members, {
            type: "shared_user_agent",
            key: userAgent,
            size: members.length,
        });
    }

    const emailPatternGroups = new Map<string, string[]>();
    const githubPatternGroups = new Map<string, string[]>();
    const creationBucketGroups = new Map<number, string[]>();

    for (const user of users) {
        const localPart = user.email.split("@")[0] || "";
        const emailPattern = slugifyPattern(localPart);
        if (emailPattern) {
            const group = emailPatternGroups.get(emailPattern) || [];
            group.push(user.id);
            emailPatternGroups.set(emailPattern, group);
        }

        const githubPattern = slugifyPattern(user.github_username);
        if (githubPattern) {
            const group = githubPatternGroups.get(githubPattern) || [];
            group.push(user.id);
            githubPatternGroups.set(githubPattern, group);
        }

        const bucket = Math.floor(
            user.created_at / CREATION_CLUSTER_WINDOW_SECONDS,
        );
        const bucketGroup = creationBucketGroups.get(bucket) || [];
        bucketGroup.push(user.id);
        creationBucketGroups.set(bucket, bucketGroup);
    }

    for (const [pattern, userIds] of emailPatternGroups) {
        if (userIds.length < 2 || userIds.length > MAX_PATTERN_GROUP) continue;
        addHit(hitsByUserId, userIds, {
            type: "email_pattern",
            key: pattern,
            size: userIds.length,
        });
    }

    for (const [pattern, userIds] of githubPatternGroups) {
        if (userIds.length < 2 || userIds.length > MAX_PATTERN_GROUP) continue;
        addHit(hitsByUserId, userIds, {
            type: "github_pattern",
            key: pattern,
            size: userIds.length,
        });
    }

    for (const [bucket, userIds] of creationBucketGroups) {
        if (userIds.length < 3 || userIds.length > MAX_CREATION_CLUSTER_GROUP) {
            continue;
        }
        addHit(hitsByUserId, userIds, {
            type: "creation_cluster",
            key: String(bucket),
            size: userIds.length,
        });
    }

    return hitsByUserId;
}

function shouldReviewUser(hits: UserSignalHit[]): boolean {
    const distinctTypes = new Set(hits.map((hit) => hit.type));
    const strongIp = hits.some(
        (hit) => hit.type === "shared_ip" && hit.size >= 3,
    );
    return distinctTypes.size >= 2 || strongIp;
}

export function buildSuspiciousCohorts(
    users: GlobalAbuseUser[],
    sessions: GlobalAbuseSession[],
): SuspiciousCohort[] {
    const usersById = new Map(users.map((user) => [user.id, user]));
    const hitsByUserId = buildSignalGroups(users, sessions);
    const candidateIds = new Set(
        Array.from(hitsByUserId.entries())
            .filter(([, hits]) => shouldReviewUser(hits))
            .map(([userId]) => userId),
    );

    if (candidateIds.size < 2) {
        return [];
    }

    const parent = new Map<string, string>();
    for (const userId of candidateIds) {
        parent.set(userId, userId);
    }

    const find = (userId: string): string => {
        const currentParent = parent.get(userId);
        if (!currentParent || currentParent === userId) {
            return userId;
        }
        const root = find(currentParent);
        parent.set(userId, root);
        return root;
    };

    const union = (left: string, right: string): void => {
        const leftRoot = find(left);
        const rightRoot = find(right);
        if (leftRoot !== rightRoot) {
            parent.set(rightRoot, leftRoot);
        }
    };

    const candidateGroups = new Map<string, string[]>();
    for (const [userId, hits] of hitsByUserId) {
        if (!candidateIds.has(userId)) continue;
        for (const hit of hits) {
            const key = `${hit.type}:${hit.key}`;
            const group = candidateGroups.get(key) || [];
            group.push(userId);
            candidateGroups.set(key, group);
        }
    }

    for (const members of candidateGroups.values()) {
        if (members.length < 2) continue;
        const [first, ...rest] = members;
        for (const member of rest) {
            union(first, member);
        }
    }

    const cohortsByRoot = new Map<string, string[]>();
    for (const userId of candidateIds) {
        const root = find(userId);
        const members = cohortsByRoot.get(root) || [];
        members.push(userId);
        cohortsByRoot.set(root, members);
    }

    const cohorts: SuspiciousCohort[] = [];
    let index = 1;
    for (const memberIds of cohortsByRoot.values()) {
        if (memberIds.length < 2) continue;
        const members = memberIds
            .map((userId) => {
                const user = usersById.get(userId);
                const signalHits = hitsByUserId.get(userId);
                if (!user || !signalHits) return null;
                return {
                    ...user,
                    signal_hits: signalHits.sort((left, right) =>
                        left.type.localeCompare(right.type),
                    ),
                } satisfies SuspiciousCohortMember;
            })
            .filter(
                (member): member is SuspiciousCohortMember => member !== null,
            )
            .sort((left, right) => left.created_at - right.created_at);
        if (members.length < 2) continue;

        const signalSummary = Array.from(
            new Set(
                members.flatMap((member) =>
                    member.signal_hits.map((hit) => `${hit.type}:${hit.size}`),
                ),
            ),
        ).sort();
        cohorts.push({
            id: `cohort-${index++}`,
            members,
            signal_summary: signalSummary,
        });
    }

    return cohorts.sort(
        (left, right) => right.members.length - left.members.length,
    );
}

export function buildGlobalAbusePrompt(cohort: SuspiciousCohort): string {
    const csvRows = cohort.members.map((member) =>
        [
            sanitizePromptField(member.email),
            sanitizePromptField(member.github_username),
            sanitizePromptField(member.tier),
            sanitizePromptField(
                new Date(member.created_at * 1000).toISOString(),
            ),
            sanitizePromptField(
                member.signal_hits
                    .map((hit) => `${hit.type}:${hit.size}`)
                    .join("|"),
            ),
        ].join(","),
    );

    return `You are reviewing a suspicious Pollinations user cohort for broad abuse enforcement.

Focus on coordinated abuse across the cohort, not isolated weak signals.
Give high scores only when the evidence suggests linked abusive accounts.
Treat shared IPs, repeated templates, synchronized creation times, and overlapping user-agent evidence as stronger together than alone.

Return CSV only with header:
email,score,signals

- score: integer 0-100 where 100 = extremely abusive and 0 = trustworthy
- signals: + separated short labels chosen from shared_ip, shared_user_agent, email_pattern, github_pattern, creation_cluster
- if clean, leave signals empty or write ok

Cohort signals:
${cohort.signal_summary.join(", ")}

Data (email,github,tier,registered,signals):
${csvRows.join("\n")}`;
}
