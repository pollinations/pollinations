# react.pollinations.ai

Local showcase for React UI surfaces and internal visual QA.

The public `react.pollinations.ai` and `react.myceli.ai` sites permanently redirect
all paths to the [UI package documentation](../../packages/ui/README.md), which
links to the SDK's React documentation. Cloudflare Pages deploys only `redirect/`;
the showcase and its SDK/UI dependencies are no longer built for deployment.

The local app is organized around:

- `Primitives` - exported building blocks from `packages/ui/src/primitives`.
- `Compositions` - exported SDK-free recipes from `packages/ui/src/compositions`.
- `Modules` - SDK-backed module flow from `packages/ui/src/modules`.
- `Colors` - light/dark design tokens and accent/neutral scopes.

The exhaustive primitive coverage page is still available for internal visual
QA at `?view=showcase`, but it is intentionally not linked from the navigation.

## Development

```bash
npm run dev
npm run typecheck
```

Run from `apps/react`.

## Accessible examples

- Use `FieldStack` for a visible label, helper, and error around one `Input` or
  `Textarea`. Clicking the label focuses the control; helper/error text becomes
  its screen-reader description. Group multiple controls separately. Standalone
  inputs and sliders need their own accessible name (`aria-label` in the demos).
- Wrap an existing button or link with `Tooltip triggerAs="span"` to avoid
  nesting buttons. Custom children must forward `aria-describedby` to their
  underlying control. For plain inline help, add `tapEnabled` and an `ariaLabel`
  so touch and keyboard users can open it. Tooltip content supplies a description,
  not the control's name.
- Import the package stylesheet once: `app.css` for this Tailwind app, or
  `styles.css` for standalone consumers. Package imports are ESM-only; use the
  documented browser bundle for script-tag pages. See the
  [UI package guide](../../packages/ui/README.md).

For a quick manual check, open Primitives and `?view=showcase` in light and dark
mode. Tab through controls to inspect focus, click field labels, focus/hover the
Tooltip example, move onto its popup, and dismiss it with Escape. Check inline
help with Enter/Space and touch. Open and close a dialog or dropdown, and confirm
closed content stays hidden. Repeat keyboard focus checks in forced-colors mode.
