/** The catalog records added_date once, in milliseconds since the Unix epoch. */
export function isNewModel(addedDate?: number): boolean {
    return Boolean(
        addedDate && addedDate > Date.now() - 7 * 24 * 60 * 60 * 1000,
    );
}
