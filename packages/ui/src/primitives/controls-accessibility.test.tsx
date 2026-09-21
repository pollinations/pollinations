import { Dialog as ArkDialog } from "@ark-ui/react/dialog";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AccountIdentity } from "../compositions/AccountIdentity.tsx";
import { AccountMenu } from "../compositions/AccountMenu.tsx";
import { MultiSelect } from "../compositions/MultiSelect.tsx";
import { PeriodPicker } from "../compositions/PeriodPicker.tsx";
import { DialogFooter, DialogHeader } from "./Dialog.tsx";
import { Dropdown } from "./Dropdown.tsx";
import { DropdownItem } from "./DropdownItem.tsx";
import { IconButton } from "./IconButton.tsx";
import { TableHeaderCell } from "./Table.tsx";

describe("shared control accessibility", () => {
    it("names dropdown dialogs from their own triggers", () => {
        const markup = renderToStaticMarkup(
            <div>
                {["Models", "API keys"].map((label) => (
                    <Dropdown
                        key={label}
                        open
                        trigger={() => <button type="button">{label}</button>}
                    >
                        Options
                    </Dropdown>
                ))}
            </div>,
        );
        const buttons = [...markup.matchAll(/<button\b[^>]*>/g)].map(
            ([button]) => button,
        );
        const dialogs = [
            ...markup.matchAll(/<div\b[^>]*role="dialog"[^>]*>/g),
        ].map(([dialog]) => dialog);
        expect(dialogs).toHaveLength(2);
        const triggerIds = buttons.map(
            (button) => button.match(/\bid="([^"]+)"/)?.[1],
        );
        expect(new Set(triggerIds).size).toBe(2);
        dialogs.forEach((dialog, index) => {
            expect(triggerIds[index]).toBeTruthy();
            expect(dialog).toContain(`aria-labelledby="${triggerIds[index]}"`);
            expect(buttons[index]).toContain('aria-expanded="true"');
        });
    });

    it("exposes selected filters and preserves an external field label", () => {
        const options = [
            { value: "flux", label: "Flux" },
            { value: "gpt", label: "GPT" },
        ];
        const render = (selected: string[], disabled = false) =>
            renderToStaticMarkup(
                <MultiSelect
                    options={options}
                    selected={selected}
                    onChange={() => undefined}
                    placeholder="All"
                    ariaLabel="Filter by model"
                    disabled={disabled}
                />,
            );
        const all = render([]);
        const filtered = render(["flux"]);
        const selectedNames = (markup: string) =>
            [
                ...markup.matchAll(
                    /<button\b[^>]*aria-pressed="true"[^>]*>([\s\S]*?)<\/button>/g,
                ),
            ].map(([, content]) =>
                content
                    .replace(/<[^>]+>/g, "")
                    .replace("✓", "")
                    .trim(),
            );
        expect(selectedNames(all)).toEqual(["All"]);
        expect(selectedNames(filtered)).toEqual(["Flux"]);
        expect(filtered).toContain('aria-pressed="false"');
        expect(filtered).toMatch(/<span aria-hidden="true"[^>]*>✓<\/span>/);
        for (const markup of [all, filtered, render([], true)]) {
            expect(markup).toContain('aria-label="Filter by model"');
        }
    });

    it("announces the selected day, week and month in the calendar", () => {
        const selections = [
            { granularity: "day", period: "2026-09-16", pressedDates: 1 },
            { granularity: "week", period: "2026-W38", pressedDates: 7 },
            { granularity: "month", period: "2026-09", pressedDates: 1 },
        ] as const;
        for (const { granularity, period, pressedDates } of selections) {
            const markup = renderToStaticMarkup(
                <PeriodPicker
                    value={{ granularity, period }}
                    onChange={() => undefined}
                    maxDate={new Date("2026-09-20T00:00:00Z")}
                />,
            );
            const selectedDates = [...markup.matchAll(/<button\b[^>]*>/g)]
                .map(([button]) => button)
                .filter(
                    (button) =>
                        button.includes("aria-label=") &&
                        button.includes('aria-pressed="true"'),
                );
            expect(selectedDates).toHaveLength(pressedDates);
            expect(markup).toContain('aria-pressed="false"');
        }
    });

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
        const button = markup.match(/<button\b[^>]*>/)?.[0];
        expect(button).toContain('aria-label="Account menu for Alex Morgan"');
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
