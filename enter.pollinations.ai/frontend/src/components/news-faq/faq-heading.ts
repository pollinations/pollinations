// The first anchor is the shareable URL. Extra anchors keep merged questions reachable.
export function parseHeading(heading: string) {
    const pinned = heading.match(/^(.*?)\s*\{#([\w-]+(?: #[\w-]+)*)\}$/);
    if (pinned) return { question: pinned[1], anchors: pinned[2].split(" #") };

    const slug = heading
        .toLowerCase()
        .replace(/[^\w\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-+|-+$/g, "");
    return { question: heading, anchors: [slug] };
}
