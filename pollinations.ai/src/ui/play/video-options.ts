export function reproducibleApiUrl(url: string) {
    const request = new URL(url);
    request.searchParams.set("key", "YOUR_API_KEY");
    return request.toString();
}
