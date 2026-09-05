# react.pollinations.ai

Public showcase for React UI surfaces.

The public app is organized around:

- `Primitives` - exported building blocks from `packages/ui/src/primitives`.
- `Compositions` - exported SDK-free recipes from `packages/ui/src/compositions`.
- `Modules` - domain UI, explicit SDK integrations, and live delegated app data.
- `Colors` - shared palette and semantic theme tokens.

Modules includes interactive, fictional previews of the Enter owner account,
delegated app connection and identity-only operations session. Preview actions
never sign in, buy Pollen, create a key or change a real session. The separately
labelled live AppUserMenu connects the showcase only when the user chooses.

The reference includes account-menu composition, auth surfaces, wallet display,
SDK auth wrappers, model catalog, drawer and editable-field examples. It explains
which layer owns authentication and the difference between a key allowance and
the full account wallet. Existing tabs, theme controls and layout are preserved.

The exhaustive primitive coverage page is still available for internal visual
QA at `?view=showcase`, but it is intentionally not linked from the public UI.

## Development

```bash
npm run dev
npm run typecheck
```

Run from `apps/react`.
