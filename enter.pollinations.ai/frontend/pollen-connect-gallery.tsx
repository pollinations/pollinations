import { Button, IconButton, ScrollArea, useColorMode } from "@pollinations/ui";
import { useEffect, useRef, useState } from "react";
import {
    type CanvasScreen,
    screenVariantIndices,
} from "./pollen-connect-canvas-data";
import type { DashboardPreviewSelection } from "./pollen-connect-dashboard";
import { galleryCardsForFlow } from "./pollen-connect-gallery-data";
import type { JourneySelection } from "./pollen-connect-journey-state";
import { ScreenContent, ScreenOwnership } from "./pollen-connect-preview";

export function ScreenGallery({
    entrance,
    desktop,
    onSelect,
    selection,
    onVariantChange,
    overrides = {},
}: {
    entrance: JourneySelection;
    desktop: boolean;
    selection?: DashboardPreviewSelection;
    onVariantChange?: (screen: string, variant: number) => void;
    overrides?: Record<string, string>;
    onSelect: (
        entry: CanvasScreen,
        variant: number,
        order: CanvasScreen[],
    ) => void;
}) {
    const { mode } = useColorMode();
    const root = useRef<HTMLDivElement>(null);
    const selectionKey = `${entrance.world}:${entrance.section}`;
    const previousFlow = useRef(selectionKey);
    const [variants, setVariants] = useState<Record<string, number>>({});
    useEffect(() => {
        if (previousFlow.current === selectionKey) return;
        previousFlow.current = selectionKey;
        root.current?.scrollTo({ top: 0, left: 0 });
    }, [selectionKey]);
    const pages = galleryCardsForFlow(entrance.world, entrance.section);
    const showOwnership =
        ["device", "admin"].includes(entrance.world) ||
        (entrance.world === "app" && entrance.section === "main");
    return (
        <div className="screens-gallery">
            <ScrollArea
                ref={root}
                axis="both"
                className="screens-gallery-scroll"
            >
                <section
                    className="screens-gallery-group"
                    aria-label={entrance.world}
                >
                    <div
                        className={`screens-gallery-grid ${desktop ? "screens-gallery-desktop" : ""}`}
                        data-show-owner={showOwnership || undefined}
                    >
                        {pages.map((entry) => {
                            const indices = screenVariantIndices(
                                entry,
                                overrides.protocol,
                            );
                            const optionCount = Math.max(1, indices.length);
                            const key = `${selectionKey}:${entry.id}`;
                            const variant =
                                selection?.screen === entry.id
                                    ? selection.variant
                                    : (indices[
                                          (variants[key] ?? 0) % optionCount
                                      ] ?? 0);
                            const changeVariant = (direction: number) => {
                                const next =
                                    (variant + direction + optionCount) %
                                    optionCount;
                                setVariants((current) => ({
                                    ...current,
                                    [key]: next,
                                }));
                                onVariantChange?.(entry.id, next);
                            };
                            return (
                                <article
                                    key={entry.id}
                                    className="screens-gallery-item"
                                >
                                    <div
                                        className="screens-gallery-caption"
                                        data-show-owner={
                                            showOwnership || undefined
                                        }
                                    >
                                        {showOwnership && (
                                            <ScreenOwnership entry={entry} />
                                        )}
                                        <div className="screens-gallery-title">
                                            <strong>{entry.title}</strong>
                                        </div>
                                        <div className="screens-gallery-options">
                                            {optionCount > 1 && (
                                                <>
                                                    <IconButton
                                                        variant="ghost"
                                                        title={`Previous option for ${entry.title}`}
                                                        tooltip={false}
                                                        onClick={() =>
                                                            changeVariant(-1)
                                                        }
                                                    >
                                                        <span aria-hidden="true">
                                                            ‹
                                                        </span>
                                                    </IconButton>
                                                    <span
                                                        className="screens-gallery-option-name"
                                                        aria-live="polite"
                                                    >
                                                        {
                                                            entry.variants?.[
                                                                variant
                                                            ].label
                                                        }
                                                    </span>
                                                    <IconButton
                                                        variant="ghost"
                                                        title={`Next option for ${entry.title}`}
                                                        tooltip={false}
                                                        onClick={() =>
                                                            changeVariant(1)
                                                        }
                                                    >
                                                        <span aria-hidden="true">
                                                            ›
                                                        </span>
                                                    </IconButton>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    <Button
                                        className="screens-gallery-card"
                                        aria-label={`Inspect ${entry.title}`}
                                        onClick={() =>
                                            onSelect(entry, variant, pages)
                                        }
                                    >
                                        <span className="canvas-phone screens-gallery-preview">
                                            <ScreenContent
                                                key={`${entry.id}-${mode}-${variant}`}
                                                overrides={overrides}
                                                entry={entry}
                                                variant={variant}
                                            />
                                        </span>
                                    </Button>
                                </article>
                            );
                        })}
                    </div>
                </section>
            </ScrollArea>
        </div>
    );
}
