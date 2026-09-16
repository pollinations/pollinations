import { Button, ChevronIcon, PeriodPicker, TabButton } from "@pollinations/ui";
import type { FC } from "react";
import {
    ACTIVITY_MIN_DATE,
    type ActivityPeriod,
    activityDate,
    changeActivityPeriod,
    isActivitySelectable,
    shiftActivityPeriod,
    switchActivityView,
} from "./activity-period";

function dateLabel(value: ActivityPeriod, compact = false): string {
    return activityDate(value).toLocaleDateString("en-US", {
        timeZone: "UTC",
        month: "short",
        ...(value.granularity === "day" ? { day: "numeric" } : {}),
        ...(compact ? {} : { year: "numeric" as const }),
    });
}

export const ActivityPeriodNavigation: FC<{
    label: string;
    value: ActivityPeriod;
    onChange: (value: ActivityPeriod) => void;
}> = ({ label, value, onChange }) => {
    const now = new Date();
    const previous = shiftActivityPeriod(value, -1);
    const next = shiftActivityPeriod(value, 1);
    return (
        <nav
            aria-label={`${label} time navigation`}
            className="flex min-w-0 items-center justify-end gap-1"
        >
            <div className="flex min-w-0 items-center gap-0.5">
                <Button
                    type="button"
                    size="icon-sm"
                    className="shrink-0"
                    aria-label={`Previous ${value.granularity}`}
                    disabled={!isActivitySelectable(previous, now)}
                    onClick={() => onChange(previous)}
                >
                    <ChevronIcon className="rotate-90" />
                </Button>
                <PeriodPicker
                    value={value}
                    minDate={ACTIVITY_MIN_DATE}
                    header={
                        <div className="mb-3 grid w-full grid-cols-2 items-center gap-2">
                            {(["day", "month"] as const).map((granularity) => (
                                <TabButton
                                    key={granularity}
                                    size="lg"
                                    ariaLabel={`Show ${label.toLowerCase()} by ${granularity}`}
                                    active={value.granularity === granularity}
                                    onClick={() =>
                                        onChange(
                                            switchActivityView(
                                                value,
                                                granularity,
                                            ),
                                        )
                                    }
                                    className="min-h-12 w-full"
                                >
                                    {granularity === "day" ? "Days" : "Months"}
                                </TabButton>
                            ))}
                        </div>
                    }
                    onChange={(next) =>
                        onChange(changeActivityPeriod(value, next))
                    }
                    trigger={() => (
                        <Button
                            type="button"
                            size="md"
                            aria-label={`Choose ${label.toLowerCase()} ${value.granularity}`}
                            className="w-24 whitespace-nowrap text-center tabular-nums sm:w-36"
                            style={{ paddingInline: 0 }}
                        >
                            <span aria-live="polite">
                                <span className="sm:hidden">
                                    {dateLabel(value, true)}
                                </span>
                                <span className="hidden sm:inline">
                                    {dateLabel(value)}
                                </span>
                            </span>
                        </Button>
                    )}
                />
                <Button
                    type="button"
                    size="icon-sm"
                    className="shrink-0"
                    aria-label={`Next ${value.granularity}`}
                    disabled={!isActivitySelectable(next, now)}
                    onClick={() => onChange(next)}
                >
                    <ChevronIcon className="-rotate-90" />
                </Button>
            </div>
        </nav>
    );
};
