import { describe, expect, it } from "vitest";
import { canvasScreenUrl } from "../pollen-connect-canvas-data";
import { getDeviceFlow } from "../pollen-connect-device";
import { getFlowFocus } from "../pollen-connect-diagram";
import {
    galleryCardsForFlow,
    galleryPagesForFlow,
} from "../pollen-connect-gallery-data";

describe("one device inventory", () => {
    it.each([
        "main",
        "link",
    ] as const)("uses identical variant URLs in Screens, Map and Journey for %s", (section) => {
        const { screens: deviceScreens, map: deviceMap } =
            getDeviceFlow(section);
        const map = getFlowFocus("device", section);
        expect(map.nodes).toEqual(deviceMap.nodes);
        expect(map.edges).toEqual(deviceMap.edges);
        const pages = galleryPagesForFlow("device", section);
        const galleryUrls = pages
            .filter((entry) => !entry.illustration)
            .map((entry) => canvasScreenUrl(entry))
            .sort();
        const stateUrls = [...deviceScreens.values()]
            .filter((entry) => !entry.illustration)
            .flatMap((entry) =>
                (entry.variants ?? [{}]).map((_, i) =>
                    canvasScreenUrl(entry, i),
                ),
            )
            .sort();
        expect(galleryUrls).toEqual(stateUrls);
        const mapUrls = [...deviceMap.screens.values()]
            .filter((entry) => !entry.illustration)
            .flatMap((entry) =>
                (entry.variants ?? [{}]).map((_, i) =>
                    canvasScreenUrl(entry, i),
                ),
            )
            .sort();
        expect(mapUrls).toEqual(stateUrls);
        expect(new Set(galleryUrls).size).toBe(galleryUrls.length);
        expect(
            galleryCardsForFlow("device", section)
                .filter((entry) => entry.owner === "Pollinations")
                .map((entry) => entry.title),
        ).toEqual([
            "Sign in to Pollinations",
            "Pollinations sign-in error",
            section === "link" ? "Enter another code" : "Enter device code",
            "Allow access",
            "Device connection error",
            "Device approval result",
        ]);
        for (const node of map.nodes) {
            const entry = deviceMap.screens.get(node.id);
            if (node.screen) expect(entry?.id).toBe(node.screen);
            if (node.kind === "decision") expect(entry?.screen).toBeDefined();
        }
    });
    it.each([
        "main",
        "link",
    ] as const)("groups map errors without adding recovery actions for %s", (section) => {
        const flow = getDeviceFlow(section);
        expect(flow.map.nodes).toHaveLength(flow.nodes.length - 5);
        const ids = new Set(flow.map.nodes.map((node) => node.id));
        for (const edge of flow.map.edges) {
            expect(ids.has(edge.from) && ids.has(edge.to)).toBe(true);
        }
        for (const id of [
            "device-code-invalid",
            "device-code-expired",
            "device-code-used",
            "device-request-invalid",
            "device-request-expired",
            "device-request-used",
            "device-submit-key",
            "device-submit-approve",
        ]) {
            const sourceActions = flow.edges
                .filter((edge) => edge.from === id)
                .map((edge) => [edge.to, edge.label]);
            const mapActions = flow.map.edges
                .filter((edge) => edge.from === flow.map.nodeForState(id))
                .map((edge) => [edge.to, edge.label]);
            expect(mapActions, id).toEqual(sourceActions);
        }
        // An unavailable request has no verified app to cancel; app lookup does.
        expect(flow.map.nodeForState("device-request-unavailable")).not.toBe(
            flow.map.nodeForState("device-request-lookup"),
        );
        expect(flow.map.nodeForState("device-submit-deny")).not.toBe(
            flow.map.nodeForState("device-submit-key"),
        );
    });
    it.each([
        "main",
        "link",
    ] as const)("has no dangling or unreachable routes and one GitHub handoff for %s", (section) => {
        const { nodes: deviceNodes, edges: deviceEdges } =
            getDeviceFlow(section);
        const ids = new Set(deviceNodes.map((node) => node.id));
        expect(ids.size).toBe(deviceNodes.length);
        const reachable = new Set(["device-start"]);
        for (let pass = 0; pass < deviceNodes.length; pass++)
            for (const edge of deviceEdges) {
                expect(ids.has(edge.from) && ids.has(edge.to)).toBe(true);
                if (reachable.has(edge.from)) reachable.add(edge.to);
            }
        expect([...reachable].sort()).toEqual([...ids].sort());
        for (const node of deviceNodes)
            if (!node.id.endsWith("-exit") && node.id !== "device-done")
                expect(
                    deviceEdges.some((edge) => edge.from === node.id),
                    node.id,
                ).toBe(true);
        expect(
            deviceNodes
                .filter((node) => node.id.startsWith("github-"))
                .map((node) => node.id),
        ).toEqual(["github-handoff"]);
    });
    it("offers only the selected entry and reuses consent and errors", () => {
        const manual = getDeviceFlow("main");
        const linked = getDeviceFlow("link");
        for (const section of ["main", "link"] as const) {
            const signIn = getDeviceFlow(section).screens.get("sign-in");
            if (!signIn) throw new Error("Missing device sign-in");
            expect(signIn.variants).toHaveLength(1);
            const url = new URL(canvasScreenUrl(signIn), "http://preview.test");
            expect(url.searchParams.get("user_code")).toBe(
                section === "link" ? "ABCD-EFGH" : "",
            );
        }
        for (const id of [
            "consent",
            "device-submit-session",
            "device-request-expired",
            "device-result",
        ])
            expect(manual.screens.get(id)).toBe(linked.screens.get(id));
    });
});
