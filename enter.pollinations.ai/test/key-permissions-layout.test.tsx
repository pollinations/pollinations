import { AuthAccessItem } from "@pollinations/ui/auth";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
    KeyPermissionsInputs,
    useKeyPermissions,
} from "../frontend/src/components/keys/key-permissions.tsx";

function Editor(props: {
    visiblePermissions?: ReadonlySet<string>;
    accountAfter?: boolean;
}) {
    const value = useKeyPermissions();
    return (
        <KeyPermissionsInputs
            value={value}
            visiblePermissions={props.visiblePermissions}
            lead={
                <AuthAccessItem icon={<span />}>
                    Username and picture
                </AuthAccessItem>
            }
            accountAfter={
                props.accountAfter ? (
                    <AuthAccessItem icon={<span />}>
                        Developer share
                    </AuthAccessItem>
                ) : undefined
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
    it("puts the limits on one wrapping row and the grants in the same card", () => {
        const html = renderToStaticMarkup(<Editor />);
        // One card for limits and account grants, one for model access.
        expect(html.match(/polli-surface-card/g)).toHaveLength(2);

        const [limits, grants] = lists(html);
        expect(limits.className).toContain("flex-wrap");
        expect(limits.body).toContain("Expiry");
        expect(limits.body).toContain("Budget");
        expect(limits.body).toContain("Quest Pollen only");
        expect(limits.body).not.toContain("Username and picture");

        expect(grants.className).toContain("sm:grid-cols-2");
        expect(grants.body).toContain("Username and picture");
        expect(grants.body).toContain("See your name and email.");
    });

    it("keeps the consent screen's fixed developer row after the grants", () => {
        const html = renderToStaticMarkup(
            <Editor visiblePermissions={new Set(["profile"])} accountAfter />,
        );
        expect(html.match(/polli-surface-card/g)).toHaveLength(2);
        expect(html).not.toContain("Manage keys, agents and models.");
        expect(html.indexOf("See your name and email.")).toBeLessThan(
            html.indexOf("Developer share"),
        );
    });
});
