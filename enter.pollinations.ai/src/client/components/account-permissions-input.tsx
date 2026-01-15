import type { FC } from "react";
import { Field } from "@ark-ui/react";

type AccountPermissionsInputProps = {
    value: string[] | null;
    onChange: (value: string[] | null) => void;
    disabled?: boolean;
};

const ACCOUNT_PERMISSIONS = [
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
            <Field.Label className="block text-sm font-medium mb-2">
                Account Permissions
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
            <p className="text-xs text-gray-500 mt-1">
                Grant read access to balance and usage data.
            </p>
        </Field.Root>
    );
};
