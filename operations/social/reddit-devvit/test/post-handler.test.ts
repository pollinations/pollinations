import assert from "node:assert/strict";
import test from "node:test";
import { postConfiguredNews, type PostingBoundary, type RedisBoundary } from "../src/post-handler.js";

const post = { title: "A shipped update", imageUrl: "https://example.com/image.png", scope: "daily", date: "2026-09-08" };

test("posts and logs only after an OK receipt write", async () => {
  const writes: string[] = [];
  const redis: RedisBoundary = { get: async () => undefined, set: async (_key, value) => { writes.push(value); return "OK"; } };
  const service: PostingBoundary = { upload: async () => ({ mediaUrl: "https://reddit.example/media" }), submit: async () => ({ id: "t3_new" }) };
  const logs: Record<string, string>[] = [];
  await postConfiguredNews(post, redis, service, (record) => logs.push(record));
  assert.equal(writes.length, 2);
  assert.deepEqual(logs, [{ event: "reddit_news_posted", scope: post.scope, date: post.date, postId: "t3_new" }]);
});

test("duplicate receipt emits stored receipt without an upstream call", async () => {
  const redis: RedisBoundary = { get: async () => JSON.stringify({ status: "posted", postId: "t3_old" }), set: async () => "" };
  const service: PostingBoundary = { upload: async () => assert.fail("must not upload"), submit: async () => assert.fail("must not submit") };
  const logs: Record<string, string>[] = [];
  await postConfiguredNews(post, redis, service, (record) => logs.push(record));
  assert.equal(logs[0].postId, "t3_old");
});

test("pending lock emits pending without an upstream call", async () => {
  const redis: RedisBoundary = { get: async () => "pending", set: async () => "" };
  const service: PostingBoundary = { upload: async () => assert.fail("must not upload"), submit: async () => assert.fail("must not submit") };
  const logs: Record<string, string>[] = [];
  await postConfiguredNews(post, redis, service, (record) => logs.push(record));
  assert.equal(logs[0].event, "reddit_news_pending");
});

test("upstream ambiguity leaves the permanent pending lock", async () => {
  const writes: string[] = [];
  const redis: RedisBoundary = { get: async () => undefined, set: async (_key, value) => { writes.push(value); return "OK"; } };
  const service: PostingBoundary = { upload: async () => { throw new Error("network failure"); }, submit: async () => ({ id: "unused" }) };
  await assert.rejects(postConfiguredNews(post, redis, service, () => undefined), /network failure/);
  assert.deepEqual(writes, ["pending"]);
});

test("receipt write failure never logs successful publication", async () => {
  let calls = 0;
  const redis: RedisBoundary = { get: async () => undefined, set: async () => (++calls === 1 ? "OK" : "") };
  const service: PostingBoundary = { upload: async () => ({ mediaUrl: "https://reddit.example/media" }), submit: async () => ({ id: "t3_new" }) };
  const logs: Record<string, string>[] = [];
  await assert.rejects(postConfiguredNews(post, redis, service, (record) => logs.push(record)), /persist/);
  assert.deepEqual(logs, []);
});
