/** Holds a finished action on its done state before the flow moves on. */
export const showDone = () =>
    new Promise<void>((resolve) => setTimeout(resolve, 900));
