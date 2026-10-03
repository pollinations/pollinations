export type ConfiguredPost = { title: string; imageUrl: string; scope: string; date: string };

type Receipt = { status: "posted"; postId: string } | { status: "pending" };

export type RedisBoundary = {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string, options?: { nx?: boolean; xx?: boolean }): Promise<string>;
};

export type PostingBoundary = {
  upload(input: { url: string; type: "image" }): Promise<{ mediaUrl: string }>;
  submit(input: { subredditName: string; title: string; kind: "image"; imageUrls: [string] }): Promise<{ id: string }>;
};

function receiptKey(scope: string, date: string): string {
  return `reddit-news:${scope}:${date}`;
}

function parseReceipt(value: string | undefined): Receipt | undefined {
  if (!value || value === "pending") return value ? { status: "pending" } : undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed === "object" && parsed !== null && "status" in parsed && "postId" in parsed && parsed.status === "posted" && typeof parsed.postId === "string" && parsed.postId) return { status: "posted", postId: parsed.postId };
  } catch {
    return { status: "pending" };
  }
  return { status: "pending" };
}

export async function postConfiguredNews(post: ConfiguredPost, redis: RedisBoundary, service: PostingBoundary, log: (record: Record<string, string>) => void): Promise<void> {
  const key = receiptKey(post.scope, post.date);
  const locked = await redis.set(key, "pending", { nx: true });
  if (locked !== "OK") {
    const receipt = parseReceipt(await redis.get(key));
    if (receipt?.status === "posted") log({ event: "reddit_news_posted", scope: post.scope, date: post.date, postId: receipt.postId });
    else log({ event: "reddit_news_pending", scope: post.scope, date: post.date });
    return;
  }

  const media = await service.upload({ url: post.imageUrl, type: "image" });
  const submitted = await service.submit({ subredditName: "pollinations_ai", title: post.title, kind: "image", imageUrls: [media.mediaUrl] });
  const receipt = await redis.set(key, JSON.stringify({ status: "posted", postId: submitted.id }), { xx: true });
  if (receipt !== "OK") throw new Error("Failed to persist Reddit post receipt");
  log({ event: "reddit_news_posted", scope: post.scope, date: post.date, postId: submitted.id });
}
