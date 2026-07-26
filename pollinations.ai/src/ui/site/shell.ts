/**
 * One horizontal grid for the whole site.
 *
 * `SHELL` caps the layout and centres it — without it the sheet grew with the
 * viewport, and on a wide monitor the page read as a very large expanse rather
 * than a card on a desk. Capping means a big screen shows more desk, which is
 * what the metaphor wanted all along.
 *
 * `GUTTER` is the inner inset. Header, sheet and footer all use both, so the
 * logo, the page title and the footer columns land on the same left edge —
 * previously the header sat at 48px while page content started at 96px.
 *
 * They must sit on SEPARATE nested elements. On one element `px-6` and
 * `md:px-18` are the same property, the breakpoint wins, and the outer inset
 * silently vanishes.
 */
export const SHELL = "mx-auto w-full max-w-[1240px] px-6";
export const GUTTER = "px-8 md:px-18";
