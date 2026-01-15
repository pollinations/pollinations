import { type FC, useState } from "react";
import { Field } from "@ark-ui/react";

type AccountPermissionsInputProps = {
    value: string[] | null;
    onChange: (value: string[] | null) => void;
    disabled?: boolean;
};

const ACCOUNT_PERMISSIONS = [
    {
        id: "profile",
        label: "Profile",
        description: "Read name, email, GitHub username",
    },
    {
        id: "balance",
        label: "Balance",
        description: "Read pollen balance via API",
    },
    {
        id: "usage",
        label: "Usage",
        description: "Read usage history via API",
    },
] as const;

/**
 * Account permissions input for API keys.
 * - null = no account permissions (default)
 * - string[] = list of enabled permissions (e.g., ["balance", "usage"])
 */
export const AccountPermissionsInput: FC<AccountPermissionsInputProps> = ({
    value,
    onChange,
    disabled = false,
}) => {
    const [showTooltip, setShowTooltip] = useState(false);

    const handleToggle = (permissionId: string) => {
        const currentPermissions = value ?? [];
        const hasPermission = currentPermissions.includes(permissionId);

        if (hasPermission) {
            const newPermissions = currentPermissions.filter(
                (p) => p !== permissionId,
            );
            onChange(newPermissions.length > 0 ? newPermissions : null);
        } else {
            onChange([...currentPermissions, permissionId]);
        }
    };

    return (
        <Field.Root>
            <Field.Label className="flex items-center gap-1.5 text-sm font-semibold mb-2">
                Permissions
                <button
                    type="button"
                    className="relative inline-flex items-center"
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setShowTooltip((prev) => !prev);
                    }}
                    onMouseEnter={() => setShowTooltip(true)}
                    onMouseLeave={() => setShowTooltip(false)}
                    aria-label="Permissions information"
                >
                    <span className="flex items-center justify-center w-3.5 h-3.5 rounded-full bg-pink-100 border border-pink-300 text-pink-500 hover:bg-pink-200 hover:border-pink-400 transition-colors text-[10px] font-bold cursor-pointer">
                        i
                    </span>
                    <span
                        className={`${showTooltip ? "visible" : "invisible"} absolute left-0 top-full mt-1 px-3 py-2 bg-gradient-to-r from-pink-50 to-purple-50 text-gray-800 text-xs font-normal rounded-lg shadow-lg border border-pink-200 w-max max-w-[200px] sm:max-w-none z-50 pointer-events-none`}
                    >
                        Grant this key read access to your account data
                    </span>
                </button>
            </Field.Label>
            <div className="space-y-2">
                {ACCOUNT_PERMISSIONS.map((permission) => {
                    const isChecked = value?.includes(permission.id) ?? false;
                    return (
                        <label
                            key={permission.id}
                            className={`flex items-center gap-3 p-2 rounded-lg border cursor-pointer transition-all ${
                                isChecked
                                    ? "border-green-400 bg-green-50"
                                    : "border-gray-200 hover:border-gray-300"
                            } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
                        >
                            <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleToggle(permission.id)}
                                disabled={disabled}
                                className="w-4 h-4 text-green-600 rounded"
                            />
                            <div className="flex-1">
                                <span className="text-sm font-medium">
                                    {permission.label}
                                </span>
                                <span className="text-xs text-gray-500 ml-2">
                                    {permission.description}
                                </span>
                            </div>
                        </label>
                    );
                })}
            </div>
        </Field.Root>
    );
};
