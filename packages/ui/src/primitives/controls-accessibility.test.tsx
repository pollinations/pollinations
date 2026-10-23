import { Dialog as ArkDialog } from "@ark-ui/react/dialog";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
    AccountIdentity,
    AccountIdentityLink,
} from "../compositions/AccountIdentity.tsx";
import { AccountMenu } from "../compositions/AccountMenu.tsx";
import { ConfirmationDialog } from "../compositions/ConfirmationDialog.tsx";
import { FieldStack } from "../compositions/FieldStack.tsx";
import { MultiSelect } from "../compositions/MultiSelect.tsx";
import { PeriodPicker } from "../compositions/PeriodPicker.tsx";
import { AuthAccessItem, ErrorBanner } from "../modules/auth/AuthModal.tsx";
import { GitHubSignInButton } from "../modules/auth/GitHubSignInButton.tsx";
import { GoogleSignInButton } from "../modules/auth/GoogleSignInButton.tsx";
import { PollinationsSignInButton } from "../modules/auth/PollinationsSignInButton.tsx";
import { DialogFooter, DialogHeader } from "./Dialog.tsx";
import { Dropdown } from "./Dropdown.tsx";
import { DropdownItem } from "./DropdownItem.tsx";
import { Field } from "./Field.tsx";
import { IconButton } from "./IconButton.tsx";
import { Input } from "./Input.tsx";
import { TableHeaderCell } from "./Table.tsx";
import { Textarea } from "./Textarea.tsx";

describe("shared control accessibility", () => {
    it.each([false, true])(
        "honors cancelDisabled=%s for dialog dismissal",
        (cancelDisabled) => {
            const onCancel = vi.fn();
            const dialog = ConfirmationDialog({
                open: true,
                title: "Delete item?",
                confirmLabel: "Delete",
                cancelDisabled,
                onConfirm: () => {},
                onCancel,
            });
            dialog.props.onOpenChange(true);
            expect(onCancel).not.toHaveBeenCalled();
            dialog.props.onOpenChange(false);
            expect(onCancel).toHaveBeenCalledTimes(cancelDisabled ? 0 : 1);
        },
    );

    it.each([
        ["input", Input],
        ["textarea", Textarea],
    ] as const)(
        "connects a styled %s to its field label and error state",
        (tag, Control) => {
            const markup = renderToStaticMarkup(
                <>
                    <FieldStack label="Prompt" error="Enter a prompt">
                        <Control />
                    </FieldStack>
                    <FieldStack label="Another prompt">
                        <Control />
                    </FieldStack>
                </>,
            );
            const labels = [...markup.matchAll(/<label\b[^>]*for="([^"]+)"/g)];
            const controls = [
                ...markup.matchAll(new RegExp(`<${tag}\\b[^>]*>`, "g")),
            ];
            expect(labels).toHaveLength(2);
            expect(controls).toHaveLength(2);
            expect(labels[0][1]).not.toBe(labels[1][1]);
            controls.forEach(([control], index) => {
                expect(control).toContain(`id="${labels[index][1]}"`);
            });
            expect(controls[0][0]).toContain('aria-invalid="true"');
            expect(controls[1][0]).not.toContain('aria-invalid="true"');
        },
    );

    it.each([
        ["input", Input, Field.Input],
        ["textarea", Textarea, Field.Textarea],
    ] as const)(
        "preserves wrapped and standalone %s props",
        (tag, Control, Wrapper) => {
            const wrapped = renderToStaticMarkup(
                <Field.Root id="prompt" disabled required>
                    <Field.Label>Prompt</Field.Label>
                    <Wrapper asChild>
                        <Control aria-describedby="custom-help" />
                    </Wrapper>
                </Field.Root>,
            );
            const controls = [
                ...wrapped.matchAll(new RegExp(`<${tag}\\b[^>]*>`, "g")),
            ];
            expect(controls).toHaveLength(1);
            expect(controls[0][0]).toContain('id="prompt"');
            expect(controls[0][0]).toContain('aria-describedby="custom-help"');
            expect(controls[0][0]).toContain('disabled=""');
            expect(controls[0][0]).toContain('required=""');

            const standalone = renderToStaticMarkup(
                <Control id="standalone" aria-label="Prompt" error />,
            );
            expect(standalone).toContain('id="standalone"');
            expect(standalone).toContain('aria-label="Prompt"');
            expect(standalone).toContain('aria-invalid="true"');
        },
    );

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
        const selectedButtons = (markup: string) =>
            [
                ...markup.matchAll(
                    /<button\b[^>]*aria-pressed="true"[^>]*>([\s\S]*?)<\/button>/g,
                ),
            ].map(([, content]) => content);
        expect(selectedButtons(all)).toHaveLength(1);
        expect(selectedButtons(all)[0]).toContain("All");
        expect(selectedButtons(filtered)).toHaveLength(1);
        expect(selectedButtons(filtered)[0]).toContain("Flux");
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

    it("makes the whole identity pill one external link", () => {
        const markup = renderToStaticMarkup(
            <AccountIdentityLink
                name="@alex"
                href="https://github.com/alex"
                avatarUrl="https://github.com/alex.png"
            />,
        );
        expect(markup.match(/<a\b/g)).toHaveLength(1);
        expect(markup).toContain('href="https://github.com/alex"');
        expect(markup).toContain('target="_blank"');
        expect(markup).toContain('rel="noopener noreferrer"');
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
    it("names provider sign-in actions and exposes their pending state", () => {
        const ready = renderToStaticMarkup(<PollinationsSignInButton />);
        expect(ready).toContain("Connect with Pollinations");
        expect(ready).not.toContain('aria-busy="true"');
        expect(ready).not.toContain('disabled=""');

        const pending = renderToStaticMarkup(
            <PollinationsSignInButton isPending>
                Checking sign-in…
            </PollinationsSignInButton>,
        );
        expect(pending).toContain("Checking sign-in…");
        expect(pending).toContain('aria-busy="true"');
        expect(pending).toContain('disabled=""');

        const githubReady = renderToStaticMarkup(<GitHubSignInButton />);
        expect(githubReady).toContain("Sign in with GitHub");
        expect(githubReady).not.toContain('disabled=""');
        const githubPending = renderToStaticMarkup(
            <GitHubSignInButton isSigningIn />,
        );
        expect(githubPending).toContain("Signing in…");
        expect(githubPending).toContain('aria-busy="true"');
        expect(githubPending).toContain('disabled=""');

        const googlePending = renderToStaticMarkup(
            <GoogleSignInButton isSigningIn />,
        );
        expect(renderToStaticMarkup(<GoogleSignInButton />)).toContain(
            "Sign in with Google",
        );
        expect(googlePending).toContain('aria-busy="true"');
        expect(googlePending).toContain('disabled=""');
    });

    it("announces authentication errors", () => {
        const markup = renderToStaticMarkup(
            <ErrorBanner>Sign-in failed.</ErrorBanner>,
        );
        expect(markup).toContain('role="alert"');
        expect(markup).toContain("Sign-in failed.");
    });
});

it("renders editable and required permissions as labelled native checkboxes", () => {
    const editable = renderToStaticMarkup(
        <AuthAccessItem
            checked
            onChange={() => {}}
            ariaLabel="Share account activity"
        >
            Balance and usage
        </AuthAccessItem>,
    );
    const required = renderToStaticMarkup(
        <AuthAccessItem checked>AI generation</AuthAccessItem>,
    );
    expect(editable).toContain('type="checkbox"');
    expect(editable).toContain('aria-label="Share account activity"');
    expect(editable).toContain('checked=""');
    expect(editable).not.toContain('disabled=""');
    expect(required).toContain('disabled=""');
});

it("keeps permission help outside checkbox labels with an explicit label association", () => {
    const html = renderToStaticMarkup(
        <AuthAccessItem
            checked
            onChange={() => {}}
            info={<button type="button">Help</button>}
        >
            Receive earnings
        </AuthAccessItem>,
    );
    const inputId = html.match(/<input[^>]*id="([^"]+)"/)?.[1];
    expect(inputId).toBeDefined();
    expect(html).toContain(`<label for="${inputId}"`);
    const labels = [...html.matchAll(/<label[^>]*>([\s\S]*?)<\/label>/g)].map(
        (match) => match[1],
    );
    expect(labels.some((label) => label.includes('type="checkbox"'))).toBe(
        true,
    );
    expect(labels.some((label) => label.includes("Receive earnings"))).toBe(
        true,
    );
    expect(labels.every((label) => !label.includes("<button"))).toBe(true);
});
