import { Button, Field, Input } from "@pollinations/ui";
import type { FC } from "react";
import { useState } from "react";
import {
    type MemberPermissions,
    MemberPermissionToggles,
} from "./member-permission-toggles.tsx";

type InviteMemberFormProps = {
    onInvite: (
        githubUsername: string,
        permissions: MemberPermissions,
    ) => Promise<void>;
};

const DEFAULT_PERMISSIONS: MemberPermissions = {
    canManageApiKeys: false,
    canFundOrganization: false,
};

export const InviteMemberForm: FC<InviteMemberFormProps> = ({ onInvite }) => {
    const [githubUsername, setGithubUsername] = useState("");
    const [permissions, setPermissions] =
        useState<MemberPermissions>(DEFAULT_PERMISSIONS);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleSubmit(e: React.FormEvent): Promise<void> {
        e.preventDefault();
        if (!githubUsername.trim() || isSubmitting) return;
        setIsSubmitting(true);
        setError(null);
        try {
            await onInvite(githubUsername.trim(), permissions);
            setGithubUsername("");
            setPermissions(DEFAULT_PERMISSIONS);
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Failed to invite member",
            );
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            {error && (
                <p className="text-sm text-intent-danger-text bg-intent-danger-bg-light px-3 py-2 rounded-lg">
                    {error}
                </p>
            )}
            <Field.Root className="flex flex-col gap-2">
                <Field.Label className="text-sm font-semibold">
                    GitHub username
                </Field.Label>
                <Input
                    type="text"
                    value={githubUsername}
                    onChange={(e) => setGithubUsername(e.target.value)}
                    placeholder="octocat"
                    disabled={isSubmitting}
                    required
                />
            </Field.Root>
            <MemberPermissionToggles
                value={permissions}
                onChange={setPermissions}
                disabled={isSubmitting}
            />
            <Button
                type="submit"
                className="self-start disabled:opacity-50"
                disabled={!githubUsername.trim() || isSubmitting}
            >
                {isSubmitting ? "Inviting..." : "Invite"}
            </Button>
        </form>
    );
};
