import { Dialog as ArkDialog } from "@ark-ui/react/dialog";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AccountIdentity } from "../compositions/AccountIdentity.tsx";
import { AccountMenu } from "../compositions/AccountMenu.tsx";
import { DialogFooter, DialogHeader } from "./Dialog.tsx";
import { DropdownItem } from "./DropdownItem.tsx";
import { IconButton } from "./IconButton.tsx";
import { TableHeaderCell } from "./Table.tsx";

describe("shared control accessibility", () => {
    it("renders an account composition without an SDK provider or implicit sign-out action", () => {
        const markup = renderToStaticMarkup(
            <AccountMenu
                name="Alex Morgan"
                secondaryContent="Dashboard session"
            >
                <DropdownItem>Account settings</DropdownItem>
            </AccountMenu>,
        );
        expect(markup).toContain('aria-label="Account menu for Alex Morgan"');
        expect(markup).toContain("AM");
        expect(markup).toContain("Dashboard session");
        expect(markup).not.toContain("Sign Out");
    });

    it("labels the empty-name fallback and accepts an explicit menu label", () => {
        const markup = renderToStaticMarkup(
            <AccountMenu name=" " menuLabel="Connected app">
                <DropdownItem>Disconnect</DropdownItem>
            </AccountMenu>,
        );
        expect(markup).toContain('aria-label="Connected app"');
        expect(markup).toContain("?");
    });
    it("keeps the dashboard link separate from the account menu trigger", () => {
        const markup = renderToStaticMarkup(
            <AccountMenu
                name="Alex Morgan"
                avatarUrl="/avatar.png"
                dashboardHref="https://dev.enter.pollinations.ai/pollen"
                secondaryContent="10 Pollen"
            >
                <DropdownItem>Disconnect</DropdownItem>
            </AccountMenu>,
        );
        const link = markup.match(/<a\b[^>]*>[\s\S]*?<\/a>/)?.[0];
        const button = markup.match(/<button\b[^>]*>[\s\S]*?<\/button>/)?.[0];
        expect(link).toContain(
            'href="https://dev.enter.pollinations.ai/pollen"',
        );
        expect(link).toContain('aria-label="Open dashboard"');
        expect(link).toContain('target="_blank"');
        expect(link).toContain('rel="noopener noreferrer"');
        expect(link).toContain('src="/avatar.png"');
        expect(button).toContain('aria-label="Account menu for Alex Morgan"');
        expect(button).not.toContain("<a ");
        const descriptionId = button?.match(/aria-describedby="([^"]+)"/)?.[1];
        expect(descriptionId).toBeTruthy();
        expect(button).toContain(`id="${descriptionId}"`);
        expect(button).toContain("10 Pollen");
    });

    it("leaves an unlinked avatar inside the menu trigger", () => {
        const markup = renderToStaticMarkup(
            <AccountMenu name="Alex Morgan">
                <DropdownItem>Disconnect</DropdownItem>
            </AccountMenu>,
        );
        expect(markup).not.toContain("<a ");
        const button = markup.match(/<button\b[^>]*>[\s\S]*?<\/button>/)?.[0];
        expect(button).toContain('aria-label="Alex Morgan avatar"');
        expect(button).not.toContain("aria-describedby");
    });

    it("uses a caller-owned dashboard destination in standalone identities", () => {
        const markup = renderToStaticMarkup(
            <AccountIdentity name="Alex Morgan" dashboardHref="/pollen" />,
        );
        expect(markup).toContain('href="/pollen"');
        expect(markup).not.toContain("https://enter.pollinations.ai");
        expect(markup).not.toContain("<button");
    });

    it("exposes the pressed state of toggle icon buttons", () => {
        const markup = renderToStaticMarkup(
            <IconButton title="Favorite" pressed onClick={() => undefined}>
                ★
            </IconButton>,
        );

        expect(markup).toContain('aria-label="Favorite"');
        expect(markup).toContain('aria-pressed="true"');
    });

    it("exposes the direction of sortable table headers", () => {
        const markup = renderToStaticMarkup(
            <table>
                <thead>
                    <tr>
                        <TableHeaderCell
                            active
                            sortDirection="desc"
                            onSort={() => undefined}
                        >
                            Requests
                        </TableHeaderCell>
                    </tr>
                </thead>
            </table>,
        );

        expect(markup).toContain('aria-sort="descending"');
    });

    it("renders dialog header and footer compositions", () => {
        const headerMarkup = renderToStaticMarkup(
            <ArkDialog.Root open>
                <ArkDialog.Content>
                    <DialogHeader
                        title={<span>Model Details</span>}
                        description="Configure endpoint settings."
                        data-testid="dialog-header"
                    />
                </ArkDialog.Content>
            </ArkDialog.Root>,
        );
        expect(headerMarkup).toContain("Model Details");
        expect(headerMarkup).toContain("Configure endpoint settings.");
        expect(headerMarkup).toContain('data-testid="dialog-header"');
        const titleId = headerMarkup.match(/<h2[^>]*id="([^"]+)"/)?.[1];
        const descriptionId = headerMarkup.match(
            /<div[^>]*id="([^"]+)"[^>]*>Configure endpoint settings\./,
        )?.[1];
        expect(titleId).toBeTruthy();
        expect(descriptionId).toBeTruthy();
        expect(headerMarkup).toContain(`aria-labelledby="${titleId}"`);
        expect(headerMarkup).toContain(`aria-describedby="${descriptionId}"`);

        const headerNoDescMarkup = renderToStaticMarkup(
            <ArkDialog.Root open>
                <DialogHeader title="Title Only" />
            </ArkDialog.Root>,
        );
        expect(headerNoDescMarkup).toContain("Title Only");

        const footerMarkup = renderToStaticMarkup(
            <DialogFooter data-testid="dialog-footer">
                <button type="button">Cancel</button>
            </DialogFooter>,
        );
        expect(footerMarkup).toContain("Cancel");
        expect(footerMarkup).toContain('data-testid="dialog-footer"');
    });
});
