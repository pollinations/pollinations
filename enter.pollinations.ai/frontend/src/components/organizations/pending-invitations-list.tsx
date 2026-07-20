import { Alert, Button } from "@pollinations/ui";
import type { FC } from "react";
import { useState } from "react";
import type { PendingInvitation } from "./types.ts";

type PendingInvitationsListProps = {
    invitations: readonly PendingInvitation[];
    onAccept: (invitationId: string) => Promise<void>;
    onDecline: (invitationId: string) => Promise<void>;
};

export const PendingInvitationsList: FC<PendingInvitationsListProps> = ({
    invitations,
    onAccept,
    onDecline,
}) => {
    const [pendingActionId, setPendingActionId] = useState<string | null>(null);

    if (invitations.length === 0) return null;

    async function handle(
        invitation: PendingInvitation,
        action: (invitationId: string) => Promise<void>,
    ): Promise<void> {
        setPendingActionId(invitation.id);
        try {
            await action(invitation.id);
        } finally {
            setPendingActionId(null);
        }
    }

    return (
        <div className="flex flex-col gap-2">
            {invitations.map((invitation) => (
                <Alert key={invitation.id} intent="info" title="Invitation">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <span>
                            {invitation.invitedByName ?? "Someone"} invited you
                            to join{" "}
                            <strong>
                                {invitation.organizationName ??
                                    "an organization"}
                            </strong>
                            .
                        </span>
                        <div className="flex gap-2">
                            <Button
                                type="button"
                                intent="danger"
                                disabled={pendingActionId === invitation.id}
                                onClick={() => handle(invitation, onDecline)}
                            >
                                Decline
                            </Button>
                            <Button
                                type="button"
                                disabled={pendingActionId === invitation.id}
                                onClick={() => handle(invitation, onAccept)}
                            >
                                Accept
                            </Button>
                        </div>
                    </div>
                </Alert>
            ))}
        </div>
    );
};
