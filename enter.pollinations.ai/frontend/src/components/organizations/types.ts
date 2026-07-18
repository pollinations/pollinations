export interface OrganizationSummary {
    id: string;
    name: string;
    packBalance: number;
    role: "owner" | "member";
    canManageApiKeys: boolean;
    canFundOrganization: boolean;
}

export interface PendingInvitation {
    id: string;
    organizationId: string;
    organizationName: string | null;
    invitedByName: string | null;
    createdAt: string;
}

export interface OrganizationMember {
    id: string;
    userId: string;
    name: string | null;
    image: string | null;
    githubUsername: string | null;
    status: "pending" | "active";
    canManageApiKeys: boolean;
    canFundOrganization: boolean;
    invitedByUserId: string;
    createdAt: string;
    respondedAt: string | null;
}
