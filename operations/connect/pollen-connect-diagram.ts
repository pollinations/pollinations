import {
    accountActionEdges,
    accountActionNodes,
} from "./pollen-connect-account-actions";
import { adminEdges, adminNodes } from "./pollen-connect-admin";
import { appLoginEdges, appLoginNodes } from "./pollen-connect-app-login";
import { getDashboardFlow } from "./pollen-connect-dashboard";
import { getDeviceFlow } from "./pollen-connect-device";
import type {
    JourneyEntrance,
    JourneySection,
} from "./pollen-connect-journey-state";

export type FlowNode = {
    id: string;
    x: number;
    y: number;
    screen?: string;
    kind?: "decision" | "outcome";
    label?: string;
    note?: string;
};
type Side = "left" | "right" | "top" | "bottom";
export type FlowEdge = {
    from: string;
    to: string;
    label: string;
    action?: string;
    fromSide?: Side;
    toSide?: Side;
    via?: [number, number][];
    labelAt?: [number, number];
    alternate?: boolean;
};
export const paper = { width: 7500, height: 4950 };
export function nodeSize(node: FlowNode) {
    return node.screen
        ? { width: 220, height: 510 }
        : node.kind === "decision"
          ? { width: 170, height: 110 }
          : { width: 220, height: 80 };
}
export function edgePoints(
    edge: FlowEdge,
    nodes: FlowNode[],
): [number, number][] {
    const anchor = (id: string, side: Side): [number, number] => {
        const node = nodes.find((node) => node.id === id);
        if (!node) throw new Error(`Unknown flow node: ${id}`);
        const { width, height } = nodeSize(node);
        return [
            node.x +
                (side === "left" ? 0 : side === "right" ? width : width / 2),
            node.y +
                (side === "top" ? 0 : side === "bottom" ? height : height / 2),
        ];
    };
    const start = anchor(edge.from, edge.fromSide ?? "right");
    const end = anchor(edge.to, edge.toSide ?? "left");
    const via: [number, number][] =
        edge.via ??
        (Math.abs(start[1] - end[1]) < 2 || Math.abs(start[0] - end[0]) < 2
            ? []
            : [
                  [(start[0] + end[0]) / 2, start[1]],
                  [(start[0] + end[0]) / 2, end[1]],
              ]);
    return [start, ...via, end];
}

export function getFlowFocus(id: JourneyEntrance, section?: JourneySection) {
    const { nodes, edges } =
        id === "admin"
            ? { nodes: adminNodes, edges: adminEdges }
            : id === "account"
              ? getDashboardFlow(section)
              : id === "device"
                ? getDeviceFlow(section).map
                : section === "topup"
                  ? { nodes: accountActionNodes, edges: accountActionEdges }
                  : { nodes: appLoginNodes, edges: appLoginEdges };
    const nodeIds = new Set(nodes.map((node) => node.id));
    const points: [number, number][] = nodes.flatMap((node) => {
        const size = nodeSize(node);
        return [
            [node.x - 12, node.y - 12],
            [node.x + size.width + 12, node.y + size.height + 12],
        ];
    });
    for (const edge of edges) {
        const path = edgePoints(edge, nodes);
        points.push(...path);
        const [x, y] = edgeLabelPosition(edge, nodes);
        const halfLabel = edge.label.length * 4.5;
        points.push([x - halfLabel, y - 30], [x + halfLabel, y + 8]);
    }
    const x = Math.min(...points.map(([x]) => x));
    const y = Math.min(...points.map(([, y]) => y));
    return {
        nodeIds,
        nodes,
        edges,
        bounds: {
            x,
            y,
            width: Math.max(...points.map(([x]) => x)) - x,
            height: Math.max(...points.map(([, y]) => y)) - y,
        },
    };
}

export function edgeLabelPosition(
    edge: FlowEdge,
    nodes: FlowNode[],
): [number, number] {
    if (edge.labelAt) return edge.labelAt;
    const points = edgePoints(edge, nodes);
    const middle = Math.floor((points.length - 1) / 2);
    return [
        (points[middle][0] + points[middle + 1][0]) / 2,
        (points[middle][1] + points[middle + 1][1]) / 2,
    ];
}
