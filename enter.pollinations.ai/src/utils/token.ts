/** Check if a token looks like an API key (pk_ or sk_ prefix) */
export function isApiKeyToken(token: string): boolean {
    return token.startsWith("pk_") || token.startsWith("sk_");
}
