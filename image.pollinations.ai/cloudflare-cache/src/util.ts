type Defined<T> = {
    [P in keyof T as T[P] extends undefined ? never : P]: NonNullable<T[P]>;
};

export function removeUndefined<T extends object>(obj: T): Defined<T> {
    const newObj = Object.fromEntries(
        Object.entries(obj).filter(
            ([_, value]) => value !== undefined && value !== null,
        ),
    );
    return newObj as Defined<T>;
}
