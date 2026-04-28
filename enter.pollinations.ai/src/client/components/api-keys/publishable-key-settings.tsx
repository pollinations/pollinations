import { Field } from "@ark-ui/react/field";
import type { FC } from "react";

type PublishableKeySettingsProps = {
    appUrl: string;
    onAppUrlChange: (url: string) => void;
    byopEnabled?: boolean;
    onByopEnabledChange?: (enabled: boolean) => void;
    disabled?: boolean;
};

export const PublishableKeySettings: FC<PublishableKeySettingsProps> = ({
    appUrl,
    onAppUrlChange,
    byopEnabled = false,
    onByopEnabledChange,
    disabled = false,
}) => {
    return (
        <div className="space-y-3">
            <Field.Root className="flex items-center gap-3">
                <Field.Label className="text-sm font-semibold shrink-0">
                    App URL
                </Field.Label>
                <Field.Input
                    type="text"
                    value={appUrl}
                    onChange={(e) => onAppUrlChange(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-green-100 focus:outline-none focus:ring-2 focus:ring-green-600 autofill:shadow-[inset_0_0_0px_1000px_#dcfce7]"
                    placeholder="https://myapp.com"
                    disabled={disabled}
                    required
                />
            </Field.Root>
            {onByopEnabledChange && (
                <label className="flex items-center gap-3 text-sm">
                    <input
                        type="checkbox"
                        checked={byopEnabled}
                        onChange={(e) => onByopEnabledChange(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-green-700 focus:ring-green-600"
                        disabled={disabled}
                    />
                    <span className="font-semibold">Creator earnings</span>
                    <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                        {byopEnabled ? "On" : "Off"}
                    </span>
                </label>
            )}
        </div>
    );
};
