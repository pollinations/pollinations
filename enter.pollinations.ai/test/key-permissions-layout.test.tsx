import { AuthAccessItem } from "@pollinations/ui/auth";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
    KeyPermissionsInputs,
    useKeyPermissions,
} from "../frontend/src/components/keys/key-permissions.tsx";

function Editor(props: { accountAfter?: boolean }) {
    const value = useKeyPermissions();
    return (
        <KeyPermissionsInputs
            value={value}
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

describe("key permissions layout", () => {
    it("puts Expiry, Budget and Quest Pollen only on one shared line", () => {
        const html = renderToStaticMarkup(<Editor />);
        // The limits live in a single wrapping row...
        const limitsRow = html.match(
            /<li class="([^"]*flex-wrap[^"]*)">([\s\S]*?)<\/li>/,
        );
        expect(limitsRow).not.toBeNull();
        expect(limitsRow?.[1]).toContain("min-h-8");
        const row = limitsRow?.[2] ?? "";
        expect(row).toContain("Expiry");
        expect(row).toContain("Budget");
        expect(row).toContain("Quest Pollen only");
        // ...without the identity lead row.
        expect(row).not.toContain("Username and picture");
        // Control groups wrap as whole units and go full-width on phones;
        // assert the tokens independently of class order.
        const groups = [...row.matchAll(/<span class="([^"]*)"/g)].filter(
            ([, c]) => c.split(/\s+/).includes("w-full"),
        );
        expect(groups).toHaveLength(3);
        for (const [, className] of groups) {
            const tokens = className.split(/\s+/);
            expect(tokens).toContain("shrink-0");
            expect(tokens).toContain("sm:w-auto");
        }
    });

    it("keeps the quest checkbox labelled, with the info tip outside its label", () => {
        const html = renderToStaticMarkup(<Editor />);
        const input = html.match(/<input[^>]*type="checkbox"[^>]*>/);
        expect(input).not.toBeNull();
        const id = input?.[0].match(/\bid="([^"]+)"/)?.[1];
        expect(id).toBeTruthy();
        const label = html.match(
            new RegExp(`<label for="${id}"[^>]*>([\\s\\S]*?)</label>`),
        );
        expect(label).not.toBeNull();
        // The InfoTip trigger lives outside the label, so opening it cannot
        // toggle the checkbox.
        expect(label?.[1]).not.toContain("Quest Pollen only information");
        expect(label?.[1]).not.toContain("<button");
        expect(html).toContain("Quest Pollen only information");
    });

    it("renders the consent-only developer row after the grants", () => {
        const html = renderToStaticMarkup(<Editor accountAfter />);
        expect(html).toContain("Developer share");
        expect(html.indexOf("Developer share")).toBeGreaterThan(
            html.indexOf("Quest Pollen only"),
        );
    });
});
