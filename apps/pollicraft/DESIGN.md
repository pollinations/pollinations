# Pollicraft Design Protocol

## Direction

Pollicraft should feel like an indie alchemy toy found inside a field notebook: quiet paper, hand-inked controls, tiny celestial marks, and crafted specimens that look collected rather than manufactured. The reference point is not a dashboard or SaaS tool. It is a playable workbench.

## Product Shape

- The first screen is the sandbox, not a landing page.
- The center of the table stays open for play.
- Inventory lives in one compact shelf on the right on desktop and below the table on mobile.
- Dialogs and menus are small, temporary surfaces.
- Long lore, account details, and backend diagnostics stay out of the default view.

## Visual Language

- Use an almost-white paper ground with visible ink, not polished glass panels.
- Keep the palette restrained: black ink, warm paper, one red discovery accent, one blue cached-atlas accent, and specimen colors.
- Use hand-set or bookish type. Current stack:
  - Display: `Segoe Print`, `Bradley Hand ITC`, `Comic Sans MS`, cursive fallback.
  - Body: `Iowan Old Style`, `Book Antiqua`, `Palatino Linotype`, Georgia fallback.
  - UI: Bahnschrift, Aptos, `Trebuchet MS`, sans fallback.
- Avoid generic purple gradients, rounded SaaS cards, stock hero sections, and emoji-only elements.
- Element visuals must be image/specimen driven. The placeholder orb system is temporary and maps directly to future Pollinations image URLs.

## Interaction Rules

- Tapping or pressing Enter on an inventory item places it on the table.
- Dragging an inventory item out of the shelf places that specimen under the pointer.
- Dragging two table pieces together crafts a result.
- Individual table pieces can be removed without clearing the whole workspace.
- The inventory supports Infinite Craft-style discovery order and recent-time order.
- Global cache hits and generated discoveries use the same resolver path so PocketBase and Pollinations stay replaceable by real production services.
- Every player starts with only Water, Fire, Wind, and Earth in personal inventory.
- Newly created personal items are added to the inventory immediately.

## Implementation Rules

- Core layout and visual overrides belong in `src/routes/layout.css`.
- Svelte markup should use semantic class names, not scattered utility classes for complex components.
- Lucide imports should use direct icon paths, for example:

```ts
import Camera from '@lucide/svelte/icons/camera';
```

- Production integration points must stay intact:
  - PocketBase global combination lookup before generation.
  - Pollinations text/image generation only when no cache result exists.
  - Player attribution from the BYOP account identity.

## Environment Configuration

- `PUBLIC_PB_URL` - PocketBase instance URL (required).
- `PUBLIC_POLLINATIONS_APP_KEY` - Optional publishable Pollinations App Key (`pk_...`).
  - Used as `client_id` in the BYOP authorize URL so the consent screen shows your app name.
  - Without it, the consent screen falls back to hostname attribution only.
  - Create one at https://enter.pollinations.ai -> Create New App Key.

## Tutorial / Help Panel

- Accessible from the session menu via a Guide section with a BookOpen icon.
- Rendered as a `help-panel` dialog matching the `menu-sheet` visual language.
- Sections: Crafting, Account (BYOP), Discoveries, Configuring your instance, Quick controls.
- Closed with the close button or the Escape key.

## Motion

- Motion should reward state change, not decorate everything.
- Discovery pop, synthesis ring, and toast entrance are the main moments.
- Respect `prefers-reduced-motion`.

## Responsive Behavior

- Desktop: table plus right inventory shelf.
- Tablet/mobile: table above, inventory below.
- Persistent HUD chrome should stay low. Do not cover the middle of the workspace with permanent panels.
