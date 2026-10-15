import { AuthAccessItem } from "@pollinations/ui/auth";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { AppEarningsRow } from "../frontend/src/components/keys/app-earnings-row.tsx";
import { KeyNameField } from "../frontend/src/components/keys/key-name-field.tsx";
import {
    KeyPermissionsInputs,
    useKeyPermissions,
} from "../frontend/src/components/keys/key-permissions.tsx";

function Editor(props: {
    visiblePermissions?: ReadonlySet<string>;
    permissionsAfter?: boolean;
    withName?: boolean;
    allowedModels?: string[] | null;
    accessContext?: "app" | "device";
}) {
    const value = useKeyPermissions({ allowedModels: props.allowedModels });
    return (
        <KeyPermissionsInputs
            value={value}
            accessContext={props.accessContext}
            nameField={
                props.withName ? (
                    <KeyNameField
                        app={false}
                        publishable={false}
                        value="Example key"
                        onChange={() => {}}
                        disabled={false}
                    />
                ) : undefined
            }
            visiblePermissions={props.visiblePermissions}
            permissionsAfter={
                props.permissionsAfter ? <AppEarningsRow /> : undefined
            }
        />
    );
}

function lists(html: string) {
    return [...html.matchAll(/<ul class="([^"]*)">([\s\S]*?)<\/ul>/g)].map(
        ([, className, body]) => ({ className, body }),
    );
}

describe("key permissions layout", () => {
    it("restores the previous categories after switching Generate off or deselecting the last category", async () => {
        vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
        let renderer: ReturnType<typeof create>;
        await act(async () => {
            renderer = create(<Editor allowedModels={["text", "image"]} />);
        });
        const generate = () =>
            renderer.root.find(
                (row) =>
                    row.type === AuthAccessItem &&
                    row.props.children === "Generate",
            );
        const category = (name: string) =>
            renderer.root.find(
                (button) =>
                    button.type === "button" && button.children.includes(name),
            );
        try {
            await act(async () => generate().props.onChange(false));
            expect(generate().props.checked).toBe(false);
            expect(category("Text").props.disabled).toBe(true);
            expect(category("Text").props["aria-pressed"]).toBe(false);
            await act(async () => generate().props.onChange(true));
            expect(category("Text").props["aria-pressed"]).toBe(true);
            expect(category("Image").props["aria-pressed"]).toBe(true);
            expect(category("Video").props["aria-pressed"]).toBe(false);
            await act(async () => category("Image").props.onClick());
            await act(async () => category("Text").props.onClick());
            expect(generate().props.checked).toBe(false);
            expect(category("Text").props.disabled).toBe(true);
            await act(async () => generate().props.onChange(true));
            expect(category("Text").props["aria-pressed"]).toBe(true);
            expect(category("Image").props["aria-pressed"]).toBe(false);
        } finally {
            await act(async () => renderer.unmount());
            vi.unstubAllGlobals();
        }
    });

    it("keeps a key's model IDs when categories change and only lets the user remove them", async () => {
        vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
        let renderer: ReturnType<typeof create>;
        await act(async () => {
            renderer = create(<Editor allowedModels={["text", "flux"]} />);
        });
        const buttons = (name: string) =>
            renderer.root.findAll(
                (button) =>
                    button.type === "button" && button.children.includes(name),
            );
        try {
            expect(buttons("Text")[0].props["aria-pressed"]).toBe(true);
            expect(buttons("Image")[0].props["aria-pressed"]).toBe(false);
            await act(async () => buttons("Image")[0].props.onClick());
            expect(buttons("Image")[0].props["aria-pressed"]).toBe(true);
            expect(buttons("flux")).toHaveLength(1);
            await act(async () => buttons("flux")[0].props.onClick());
            expect(buttons("flux")).toHaveLength(0);
        } finally {
            await act(async () => renderer.unmount());
            vi.unstubAllGlobals();
        }
    });

    it("links to the CLI and API for limiting a key to specific models", () => {
        const html = renderToStaticMarkup(<Editor accessContext="app" />);
        expect(html).toContain("to specific models");
        expect(html).toContain("packages/polli-cli#account");
        expect(html).toContain(
            "APIDOCS.md#patch-accountkeysid--update-api-key",
        );
    });

    it.each([undefined, "app", "device"] as const)(
        "uses the %s context in the identity tooltip",
        (accessContext) => {
            const html = renderToStaticMarkup(
                <Editor accessContext={accessContext} />,
            );
            expect(html).toContain(
                `This ${accessContext ?? "key"} can access your username`,
            );
            expect(html).not.toContain("Anyone using this key");
        },
    );

    it("explains earnings to the reader of each screen", () => {
        const consent = renderToStaticMarkup(<AppEarningsRow />);
        const owner = renderToStaticMarkup(
            <AppEarningsRow checked onChange={() => {}} />,
        );
        expect(consent).toContain("You pay 25% above the base rate");
        expect(consent).not.toContain("When enabled");
        expect(owner).toContain("You receive that markup");
    });

    it("disables category selectors when generation is off and has no All control", () => {
        for (const allowedModels of [null, []]) {
            const html = renderToStaticMarkup(
                <Editor allowedModels={allowedModels} />,
            );
            expect(html).not.toContain(">All<");
            const textButton = html.match(/<button[^>]*>Text<\/button>/)?.[0];
            expect(textButton).toBeDefined();
            expect(textButton?.includes('disabled=""')).toBe(
                allowedModels !== null,
            );
            expect(textButton).toContain(
                `aria-pressed="${allowedModels === null}"`,
            );
        }
    });
    it("keeps the key name and limits in the same first card", () => {
        const html = renderToStaticMarkup(<Editor withName />);
        const cards = [...html.matchAll(/polli-surface-card/g)];
        expect(cards).toHaveLength(2);
        expect(html).toContain(">Settings<");
        expect(html).toContain(">Permissions<");
        expect(html).not.toContain(">Limits<");
        expect(html.indexOf("Example key")).toBeLessThan(
            html.indexOf("Expiry"),
        );
        expect(html.indexOf("Quest pollen only")).toBeLessThan(cards[1].index);
        expect(html).not.toContain("paid Pollen");
        expect(html).not.toContain("Quest Pollen");
    });
    it("stacks limits above account grants at every width", () => {
        const html = renderToStaticMarkup(<Editor />);
        expect(html.match(/polli-surface-card/g)).toHaveLength(2);

        const [limits, grants] = lists(html);
        expect(limits.className).toContain("grid-cols-1");
        expect(limits.className).not.toContain("sm:");
        expect(limits.body).toContain("Expiry");
        expect(limits.body).toContain("Budget");
        expect(limits.body).toContain("Quest pollen only");
        expect(limits.body).not.toContain("See your username and picture");

        expect(grants.className).toContain("grid-cols-1");
        expect(grants.className).not.toContain("sm:");
        expect(grants.body).toContain("See your username and picture");
        expect(grants.body).toContain("See your name and email");
    });

    it("keeps identity first without responsive reordering", () => {
        const [limits, grants] = lists(renderToStaticMarkup(<Editor />));
        expect(
            grants.body.indexOf("See your username and picture"),
        ).toBeLessThan(grants.body.indexOf("See your name and email"));
        expect(grants.className).not.toContain("order-");
        expect(limits.className).not.toContain("order-");
        expect(limits.body).toContain("Expiry");
    });

    it("keeps the consent earnings disclosure last, after generation", () => {
        const html = renderToStaticMarkup(
            <Editor
                visiblePermissions={new Set(["profile"])}
                permissionsAfter
            />,
        );
        expect(html.match(/polli-surface-card/g)).toHaveLength(2);
        expect(html).toContain(">Limits<");
        expect(html).toContain(">Permissions<");
        expect(html).not.toContain(">Settings<");
        expect(html).not.toContain("Manage keys, agents and models");
        expect(html).not.toContain("Run hosted sandboxes");
        expect(html.indexOf("Generate")).toBeLessThan(
            html.indexOf("20% of the pollen"),
        );
    });

    it("groups sandbox execution with generation and keeps administration in account access", () => {
        const html = renderToStaticMarkup(<Editor />);
        const [, account, models, sandboxes] = lists(html);
        expect(account.body).toContain("Manage keys, agents and models");
        expect(account.body).not.toContain("Run hosted sandboxes");
        expect(models.body).toContain("Generate");
        expect(sandboxes.body).toContain("Run hosted sandboxes");
        expect(sandboxes.body).toContain("Sandboxes are in alpha");
        expect(sandboxes.body).not.toContain("Manage keys, agents and models");
        expect(html).not.toContain(">Account access<");
        expect(html).not.toContain(">AI &amp; tools<");
        const cards = [...html.matchAll(/polli-surface-card/g)];
        expect(cards).toHaveLength(2);
        expect(html.indexOf("See your username and picture")).toBeGreaterThan(
            cards[1].index,
        );
        expect(html.indexOf("Generate")).toBeGreaterThan(cards[1].index);
        expect(html.indexOf("Run hosted sandboxes")).toBeGreaterThan(
            cards[1].index,
        );
    });

    it("shows requested sandbox access without adding unrequested account grants", () => {
        const html = renderToStaticMarkup(
            <Editor visiblePermissions={new Set(["machines"])} />,
        );
        expect(html).toContain("Run hosted sandboxes");
        expect(html).not.toContain("See your name and email");
        expect(html).not.toContain("Manage keys, agents and models");
    });
});
