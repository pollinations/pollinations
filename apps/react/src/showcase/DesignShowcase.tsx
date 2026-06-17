import { ScrollArea } from "@pollinations/ui";
import type { FC, ReactNode } from "react";
import {
    ButtonsDemo,
    FeedbackDemo,
    Header,
    IconsDemo,
    InputsDemo,
    LayoutDemo,
    ModuleRecipesDemo,
    OverlaysDemo,
    ProseDemo,
    SelectionDemo,
    TokensDemo,
    TypographyDemo,
} from "./sections";

/**
 * App-owned design primitive showcase.
 *
 * This demo composes public @pollinations/ui exports only; it is deliberately
 * kept outside the package so the published library stays primitive/module-only.
 */
export type DesignShowcaseProps = {
    headerSlot?: ReactNode;
    hideHeader?: boolean;
};

export const DesignShowcase: FC<DesignShowcaseProps> = ({
    headerSlot,
    hideHeader = false,
}) => {
    return (
        <ScrollArea
            className={`w-full overflow-x-hidden bg-theme-bg-pale text-theme-text-base ${
                hideHeader ? "min-h-0 flex-1" : "h-dvh"
            }`}
        >
            {hideHeader && headerSlot ? (
                <div className="mx-auto flex w-full max-w-[1220px] flex-col gap-4 px-5 pt-8">
                    {headerSlot}
                </div>
            ) : !hideHeader ? (
                <Header headerSlot={headerSlot} />
            ) : null}
            <div className="mx-auto flex w-full max-w-[1220px] flex-col gap-8 px-5 pt-8 pb-10">
                <main className="flex min-w-0 flex-col gap-10">
                    <TypographyDemo />
                    <ProseDemo />
                    <TokensDemo />
                    <IconsDemo />
                    <ButtonsDemo />
                    <InputsDemo />
                    <SelectionDemo />
                    <OverlaysDemo />
                    <LayoutDemo />
                    <FeedbackDemo />
                    <ModuleRecipesDemo />
                </main>
            </div>
        </ScrollArea>
    );
};
