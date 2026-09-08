import {
    Heading,
    Surface,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
    Text,
} from "@pollinations/ui";
import { weekLabel } from "../lib/format";

const WEEK_KEYS = ["w1", "w2", "w3", "w4"];

/**
 * Retention is a magnitude, so the cells run one hue light→dark rather than a
 * red/amber/green scale — the number is printed either way.
 */
function cellStyle(value) {
    const mix = Math.min(Math.max(value, 0), 60) / 60;
    return {
        background: `color-mix(in oklab, var(--kpi-series-1) ${Math.round(mix * 70)}%, transparent)`,
        color: mix > 0.55 ? "var(--polli-color-surface-opaque)" : undefined,
    };
}

export function RetentionTable({ data }) {
    return (
        <Surface className="flex flex-col gap-3">
            <Heading as="h3" size="card">
                Weekly cohort retention
            </Heading>
            <div className="min-w-0 overflow-x-auto">
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableHeaderCell>Cohort</TableHeaderCell>
                            <TableHeaderCell align="right">
                                Users
                            </TableHeaderCell>
                            {WEEK_KEYS.map((key) => (
                                <TableHeaderCell key={key} align="right">
                                    {key.toUpperCase()}
                                </TableHeaderCell>
                            ))}
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {data.map((row) => (
                            <TableRow key={row.cohort}>
                                <TableCell className="font-medium text-theme-text-strong">
                                    {weekLabel(row.cohort)}
                                </TableCell>
                                <TableCell align="right" numeric muted>
                                    {row.users?.toLocaleString() ?? "—"}
                                </TableCell>
                                {WEEK_KEYS.map((key) => {
                                    const value = row[key];
                                    return (
                                        <TableCell
                                            key={key}
                                            align="right"
                                            numeric
                                        >
                                            {Number.isFinite(value) ? (
                                                <span
                                                    className="inline-block min-w-11 rounded-[4px] px-2 py-0.5 font-medium"
                                                    style={cellStyle(value)}
                                                >
                                                    {value.toFixed(0)}%
                                                </span>
                                            ) : (
                                                <span className="text-theme-text-muted">
                                                    —
                                                </span>
                                            )}
                                        </TableCell>
                                    );
                                })}
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
            <Text as="p" size="micro" tone="muted">
                Share of each signup cohort still making requests N weeks later.
            </Text>
        </Surface>
    );
}
