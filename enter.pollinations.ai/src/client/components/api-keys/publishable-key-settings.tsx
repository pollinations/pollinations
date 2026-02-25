import { Field } from "@ark-ui/react/field";
import type { FC } from "react";

type PublishableKeySettingsProps = {
    appUrl: string;
    onAppUrlChange: (url: string) => void;
    disabled?: boolean;
};

export const PublishableKeySettings: FC<PublishableKeySettingsProps> = ({
    appUrl,
    onAppUrlChange,
    disabled = false,
}) => {
    return (
        <Field.Root className="flex items-center gap-3">
            <Field.Label className="text-sm font-semibold shrink-0">
                App URL
                <span className="text-xs text-gray-400 font-normal ml-1">
                    (optional)
                </span>
            </Field.Label>
            <Field.Input
                type="url"
                value={appUrl}
                onChange={(e) => onAppUrlChange(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-600"
                placeholder="https://myapp.com"
                disabled={disabled}
            />
        </Field.Root>
    );
};
