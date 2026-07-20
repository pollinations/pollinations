import { cn } from "@pollinations/ui";
import type { FC } from "react";

export type MemberPermissions = {
    canManageApiKeys: boolean;
    canFundOrganization: boolean;
};

type MemberPermissionTogglesProps = {
    value: MemberPermissions;
    onChange: (value: MemberPermissions) => void;
    disabled?: boolean;
};

const TOGGLES: readonly {
    key: keyof MemberPermissions;
    label: string;
    hint: string;
}[] = [
    {
        key: "canManageApiKeys",
        label: "Manage API keys",
        hint: "create, edit, and delete the organization's keys",
    },
    {
        key: "canFundOrganization",
        label: "Fund organization",
        hint: "add paid Pollen to the organization's balance",
    },
];

/** Every member can already view the org (balance, keys, roster) — these are the only two grantable permissions. */
export const MemberPermissionToggles: FC<MemberPermissionTogglesProps> = ({
    value,
    onChange,
    disabled = false,
}) => (
    <div className="flex flex-col gap-2">
        {TOGGLES.map((toggle) => {
            const isChecked = value[toggle.key];
            return (
                <button
                    key={toggle.key}
                    type="button"
                    disabled={disabled}
                    aria-pressed={isChecked}
                    onClick={() =>
                        onChange({ ...value, [toggle.key]: !isChecked })
                    }
                    className={cn(
                        "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
                        isChecked
                            ? "border-theme-border bg-theme-bg-active"
                            : "border-theme-border",
                        !disabled && "hover:bg-theme-bg-hover cursor-pointer",
                        disabled && "opacity-50 cursor-not-allowed",
                    )}
                >
                    <div className="flex flex-1 items-baseline gap-1">
                        <span className="text-sm font-medium text-theme-text-strong">
                            {toggle.label}
                        </span>
                        <span className="text-sm text-theme-text-muted">
                            – {toggle.hint}
                        </span>
                    </div>
                </button>
            );
        })}
    </div>
);
