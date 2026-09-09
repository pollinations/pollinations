import { Heading, Surface, Text } from "@pollinations/ui";
import { formatValue } from "../lib/format";

/**
 * One measure (people) across four stages, so the bars carry one colour and
 * the step-down percentages are labelled directly rather than encoded.
 */
export function FunnelBars({ title, stages }) {
    const top = Math.max(1, ...stages.map((stage) => stage.count || 0));

    return (
        <Surface className="flex flex-col gap-3">
            <Heading as="h3" size="card">
                {title}
            </Heading>
            <div className="flex flex-1 flex-col justify-center gap-2">
                {stages.map((stage) => {
                    const base = stages.find((s) => s.stage === stage.of);
                    const stepPct =
                        base?.count > 0
                            ? (stage.count / base.count) * 100
                            : null;
                    return (
                        <div key={stage.stage} className="flex flex-col gap-1">
                            <div className="flex items-baseline justify-between gap-2">
                                <Text as="span" size="xs" tone="base">
                                    {stage.stage}
                                </Text>
                                <span className="flex items-baseline gap-2">
                                    {stepPct != null && (
                                        <Text
                                            as="span"
                                            size="micro"
                                            tone="muted"
                                        >
                                            {stepPct < 1
                                                ? stepPct.toFixed(1)
                                                : Math.round(stepPct)}
                                            % of {base.stage.toLowerCase()}
                                        </Text>
                                    )}
                                    <Text
                                        as="span"
                                        size="sm"
                                        tone="strong"
                                        weight="semibold"
                                        className="tabular-nums"
                                    >
                                        {formatValue(stage.count)}
                                    </Text>
                                </span>
                            </div>
                            <div className="h-2.5 rounded-[4px] bg-theme-bg-subtle">
                                <div
                                    className="h-full rounded-[4px]"
                                    style={{
                                        width: `${Math.max((stage.count / top) * 100, 0.5)}%`,
                                        background: "var(--kpi-series-1)",
                                    }}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>
        </Surface>
    );
}
