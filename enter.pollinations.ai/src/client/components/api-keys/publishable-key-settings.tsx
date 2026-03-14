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
    );
};
