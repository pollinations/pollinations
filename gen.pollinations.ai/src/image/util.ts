export async function sleep(ms: number) {
    await new Promise<void>((resolve, _) => setTimeout(resolve, ms));
}
