import { Chip, IconButton, Surface, XIcon } from "@pollinations/ui";
import type { FC } from "react";
import {
    type MemberPermissions,
    MemberPermissionToggles,
} from "./member-permission-toggles.tsx";
import type { OrganizationMember } from "./types.ts";

type MemberListProps = {
    members: readonly OrganizationMember[];
    /** Whether the current viewer is the owner — gates edit/remove controls. */
    isOwner: boolean;
    onUpdatePermissions: (
        memberId: string,
        permissions: MemberPermissions,
    ) => Promise<void>;
    onRemoveMember: (memberId: string) => Promise<void>;
};

export const MemberList: FC<MemberListProps> = ({
    members,
    isOwner,
    onUpdatePermissions,
    onRemoveMember,
}) => {
    if (members.length === 0) {
        return (
            <Surface className="p-6 text-center">
                <p className="text-sm text-theme-text-muted">
                    No members yet — invite someone by their GitHub username.
                </p>
            </Surface>
        );
    }

    return (
        <div className="flex flex-col gap-3">
            {members.map((member) => (
                <Surface key={member.id} className="flex flex-col gap-3 p-4">
                    <div className="flex items-center gap-3">
                        {member.image ? (
                            <img
                                src={member.image}
                                alt=""
                                className="h-8 w-8 shrink-0 rounded-full"
                            />
                        ) : (
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-theme-bg-active text-xs font-semibold text-theme-text-muted">
                                {(member.githubUsername ?? member.name ?? "?")
                                    .slice(0, 1)
                                    .toUpperCase()}
                            </span>
                        )}
                        <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-theme-text-strong">
                                {member.name ??
                                    member.githubUsername ??
                                    "Unknown"}
                            </div>
                            {member.githubUsername && (
                                <div className="truncate text-xs text-theme-text-muted">
                                    @{member.githubUsername}
                                </div>
                            )}
                        </div>
                        <Chip
                            size="sm"
                            intent={
                                member.status === "active"
                                    ? "neutral"
                                    : undefined
                            }
                        >
                            {member.status === "active" ? "Active" : "Pending"}
                        </Chip>
                        {isOwner && (
                            <IconButton
                                intent="danger"
                                title="Remove member"
                                tooltip="Remove member"
                                onClick={() => onRemoveMember(member.id)}
                            >
                                <XIcon className="h-4 w-4" />
                            </IconButton>
                        )}
                    </div>
                    {isOwner ? (
                        <MemberPermissionToggles
                            value={{
                                canManageApiKeys: member.canManageApiKeys,
                                canFundOrganization: member.canFundOrganization,
                            }}
                            onChange={(permissions) =>
                                onUpdatePermissions(member.id, permissions)
                            }
                        />
                    ) : (
                        <div className="flex flex-wrap gap-2 text-xs text-theme-text-muted">
                            {member.canManageApiKeys && (
                                <Chip size="sm">Can manage API keys</Chip>
                            )}
                            {member.canFundOrganization && (
                                <Chip size="sm">Can fund organization</Chip>
                            )}
                            {!member.canManageApiKeys &&
                                !member.canFundOrganization && (
                                    <span>Read-only</span>
                                )}
                        </div>
                    )}
                </Surface>
            ))}
        </div>
    );
};
