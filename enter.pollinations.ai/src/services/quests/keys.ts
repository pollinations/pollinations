/**
 * The one place idempotency-key strings are templated. Every key shares the
 * `quest:${questId}:` prefix so quests can never collide, and the `quest:` token
 * lives here alone (no per-quest inline templates to mistype). The key encodes a
 * quest's completion SCOPE; pick the builder that matches:
 *
 *   - perUserKey      — one reward per user (the common case).
 *   - perUserEventKey — one reward per (user, event), e.g. per listed app.
 */

export function perUserKey(questId: string, userId: string): string {
    return `quest:${questId}:user:${userId}`;
}

export function perUserEventKey(
    questId: string,
    userId: string,
    event: string,
): string {
    return `quest:${questId}:user:${userId}:event:${event}`;
}
