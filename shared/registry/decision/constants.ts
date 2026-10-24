// The decision default, kept free of catalog access so schema modules can
// import it without loading the per-model files.

/** The only decision model today; callers may omit `model` entirely. */
export const DEFAULT_DECISION_MODEL = "typesafe/jev-1.13";
