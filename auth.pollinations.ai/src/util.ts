export function* batches<T>(
    array: T[],
    size: number,
): Generator<T[], void, void> {
    for (let i = 0; i < array.length; i += size) {
        yield array.slice(i, i + size);
    }
}
