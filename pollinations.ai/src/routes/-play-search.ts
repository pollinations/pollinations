/**
 * Search-param contract for /play.
 *
 * The URL holds the visible tab's inputs, so a reload or the Connect
 * round-trip restores them and a link can open a model with a prompt.
 * ?model= also accepts a model alias and opens that model's tab.
 */
export const PLAY_SEARCH_KEYS = [
    "tab",
    "task",
    "model",
    "prompt",
    "size",
    "width",
    "height",
    "aspect",
    "duration",
    "length",
    "seed",
    "voice",
    "language",
] as const;

export type PlaySearch = Partial<
    Record<(typeof PLAY_SEARCH_KEYS)[number], string>
>;

/** The router parses every search value as text. */
export const validatePlaySearch = (search: Record<string, unknown>) =>
    search as PlaySearch;
