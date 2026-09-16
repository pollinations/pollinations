import { Dialog as ArkDialog } from "@ark-ui/react/dialog";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
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
