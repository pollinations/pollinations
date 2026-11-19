import { D1Database } from '@cloudflare/workers-types';
import { getEarnedSet, addEarnedId } from '../db/earned';
import { getQuestById, creditUserForQuest } from '../db/quests';
import { recordMergedPrMarker } from '../db/merged_pr_markers';

/**
 * Records a marker that the given PR has already been processed for payouts.
 * This marker is stored in the same `earned` set used for quest IDs, using the
 * namespace `github:merged_pr:<prId>`.
 */
async function claimMergedPr(db: D1Database, userId: string, prId: number): Promise<void> {
  const markerId = `github:merged_pr:${prId}`;
  const earned = await getEarnedSet(db, userId);
  if (earned.has(markerId)) return; // Already claimed – idempotent.
  await addEarnedId(db, userId, markerId);
}

/**
 * Process payouts for a PR that has just been merged.
 *
 * 1. Record the merged‑PR marker so the payout window cannot be re‑armed.
 * 2. Resolve any `github:issue:<id>` references in the PR body.
 * 3. For each referenced quest that has not been earned, credit the user.
 */
export async function handlePullRequestMerged(
  db: D1Database,
  userId: string,
  prId: number,
  prBody: string
): Promise<void> {
  // Step 1 – claim the PR itself.
  await claimMergedPr(db, userId, prId);

  // Extract issue references from the PR body (e.g., "Closes #1234").
  const issueIds = Array.from(prBody.matchAll(/#(\d+)/g)).map((m) => Number(m[1]));

  // Build the list of IDs we need to check for payout.
  const idsToCheck = new Set<string>([
    `github:merged_pr:${prId}`,
    ...issueIds.map((id) => `github:issue:${id}`),
  ]);

  // Load the user's earned set.
  const earned = await getEarnedSet(db, userId);

  // Determine which quests are newly payable.
  const newQuestIds: number[] = [];
  for (const id of idsToCheck) {
    if (earned.has(id)) continue; // Already processed.
    if (id.startsWith('github:issue:')) {
      const questId = Number(id.split(':')[2]);
      const quest = await getQuestById(db, questId);
      if (quest) newQuestIds.push(questId);
    }
  }

  // Credit the user for each new quest and record the earned IDs.
  for (const qId of newQuestIds) {
    await creditUserForQuest(db, userId, qId);
    await addEarnedId(db, userId, `github:issue:${qId}`);
  }
}
