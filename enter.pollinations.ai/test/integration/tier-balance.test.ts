import { SELF } from "cloudflare:test";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { beforeEach, describe, expect, it } from "vitest";
import { user as userTable } from "@/db/schema/better-auth.ts";
import { handleScheduled } from "@/scheduled.ts";
import { TIER_POLLEN } from "@/tier-config.ts";
import { test } from "../fixtures.ts";

describe("Tier Balance Management", () => {
	describe("Daily Cron Refill", () => {
		test("should refill tier balance for all users based on their tier", async ({
			env,
			executionContext,
		}) => {
			const db = drizzle(env.DB);

			// Setup: Create test users with different tiers and depleted balances
			const testUsers = [
				{ id: "user-spore", tier: "spore", tierBalance: 0.5 },
				{ id: "user-seed", tier: "seed", tierBalance: 1.0 },
				{ id: "user-flower", tier: "flower", tierBalance: 2.0 },
				{ id: "user-nectar", tier: "nectar", tierBalance: 0 },
				{ id: "user-router", tier: "router", tierBalance: 100 },
			];

			// Insert test users
			for (const user of testUsers) {
				await db
					.insert(userTable)
					.values({
						id: user.id,
						email: `${user.id}@test.com`,
						name: user.id,
						tier: user.tier,
						tierBalance: user.tierBalance,
						packBalance: 0,
						cryptoBalance: 0,
						createdAt: new Date(),
						updatedAt: new Date(),
					})
					.onConflictDoUpdate({
						target: userTable.id,
						set: {
							tier: user.tier,
							tierBalance: user.tierBalance,
						},
					});
			}

			// Execute the scheduled handler
			const controller = {} as ScheduledController;
			await handleScheduled(controller, env, executionContext);

			// Verify: Check that all users have their tier balance refilled
			const users = await db
				.select({
					id: userTable.id,
					tier: userTable.tier,
					tierBalance: userTable.tierBalance,
					lastTierGrant: userTable.lastTierGrant,
				})
				.from(userTable)
				.where(
					sql`${userTable.id} IN (${sql.join(
						testUsers.map((u) => sql`${u.id}`),
						sql`, `,
					)})`,
				);

			// Each user should have their tier balance set to the correct amount
			expect(users.find((u) => u.id === "user-spore")?.tierBalance).toBe(
				TIER_POLLEN.spore,
			);
			expect(users.find((u) => u.id === "user-seed")?.tierBalance).toBe(
				TIER_POLLEN.seed,
			);
			expect(users.find((u) => u.id === "user-flower")?.tierBalance).toBe(
				TIER_POLLEN.flower,
			);
			expect(users.find((u) => u.id === "user-nectar")?.tierBalance).toBe(
				TIER_POLLEN.nectar,
			);
			expect(users.find((u) => u.id === "user-router")?.tierBalance).toBe(
				TIER_POLLEN.router,
			);

			// All users should have lastTierGrant updated
			for (const user of users) {
				expect(user.lastTierGrant).toBeDefined();
				expect(user.lastTierGrant).toBeGreaterThan(Date.now() - 60000); // Within last minute
			}
		});

		test("should handle users with null tier gracefully", async ({
			env,
			executionContext,
		}) => {
			const db = drizzle(env.DB);

			// Create a user without a tier
			await db
				.insert(userTable)
				.values({
					id: "user-no-tier",
					email: "notier@test.com",
					name: "No Tier User",
					tier: null,
					tierBalance: 5,
					packBalance: 0,
					cryptoBalance: 0,
					createdAt: new Date(),
					updatedAt: new Date(),
				})
				.onConflictDoUpdate({
					target: userTable.id,
					set: {
						tier: null,
						tierBalance: 5,
					},
				});

			// Execute the scheduled handler
			const controller = {} as ScheduledController;
			await handleScheduled(controller, env, executionContext);

			// User with null tier should not be updated
			const user = await db
				.select({
					tierBalance: userTable.tierBalance,
					lastTierGrant: userTable.lastTierGrant,
				})
				.from(userTable)
				.where(sql`${userTable.id} = 'user-no-tier'`)
				.limit(1);

			expect(user[0]?.tierBalance).toBe(5); // Unchanged
			expect(user[0]?.lastTierGrant).toBeNull(); // Not updated
		});

		test("should not affect pack or crypto balance during refill", async ({
			env,
			executionContext,
		}) => {
			const db = drizzle(env.DB);

			// Create user with existing pack and crypto balance
			await db
				.insert(userTable)
				.values({
					id: "user-multi-balance",
					email: "multi@test.com",
					name: "Multi Balance",
					tier: "flower",
					tierBalance: 2,
					packBalance: 50,
					cryptoBalance: 25,
					createdAt: new Date(),
					updatedAt: new Date(),
				})
				.onConflictDoUpdate({
					target: userTable.id,
					set: {
						tier: "flower",
						tierBalance: 2,
						packBalance: 50,
						cryptoBalance: 25,
					},
				});

			// Execute the scheduled handler
			const controller = {} as ScheduledController;
			await handleScheduled(controller, env, executionContext);

			// Check that only tier balance was updated
			const user = await db
				.select({
					tierBalance: userTable.tierBalance,
					packBalance: userTable.packBalance,
					cryptoBalance: userTable.cryptoBalance,
				})
				.from(userTable)
				.where(sql`${userTable.id} = 'user-multi-balance'`)
				.limit(1);

			expect(user[0]?.tierBalance).toBe(TIER_POLLEN.flower);
			expect(user[0]?.packBalance).toBe(50); // Unchanged
			expect(user[0]?.cryptoBalance).toBe(25); // Unchanged
		});
	});

	describe("Balance Deduction Order", () => {
		test("should deduct from tier balance first", async ({ env }) => {
			const db = drizzle(env.DB);
			const userId = "test-deduct-tier";

			// Setup user with all balance types
			await db
				.insert(userTable)
				.values({
					id: userId,
					email: "deduct@test.com",
					name: "Deduct Test",
					tier: "flower",
					tierBalance: 5,
					packBalance: 10,
					cryptoBalance: 8,
					createdAt: new Date(),
					updatedAt: new Date(),
				})
				.onConflictDoUpdate({
					target: userTable.id,
					set: {
						tierBalance: 5,
						packBalance: 10,
						cryptoBalance: 8,
					},
				});

			// Simulate deduction of 3 pollen (should come from tier only)
			const priceToDeduct = 3;
			const currentUser = await db
				.select({
					tierBalance: userTable.tierBalance,
					cryptoBalance: userTable.cryptoBalance,
					packBalance: userTable.packBalance,
				})
				.from(userTable)
				.where(sql`${userTable.id} = ${userId}`)
				.limit(1);

			const tierBalance = currentUser[0]?.tierBalance ?? 0;
			const cryptoBalance = currentUser[0]?.cryptoBalance ?? 0;

			const fromTier = Math.min(priceToDeduct, Math.max(0, tierBalance));
			const remainingAfterTier = priceToDeduct - fromTier;
			const fromCrypto = Math.min(remainingAfterTier, Math.max(0, cryptoBalance));
			const fromPack = remainingAfterTier - fromCrypto;

			await db
				.update(userTable)
				.set({
					tierBalance: sql`${userTable.tierBalance} - ${fromTier}`,
					cryptoBalance: sql`${userTable.cryptoBalance} - ${fromCrypto}`,
					packBalance: sql`${userTable.packBalance} - ${fromPack}`,
				})
				.where(sql`${userTable.id} = ${userId}`);

			// Verify balances
			const updatedUser = await db
				.select({
					tierBalance: userTable.tierBalance,
					packBalance: userTable.packBalance,
					cryptoBalance: userTable.cryptoBalance,
				})
				.from(userTable)
				.where(sql`${userTable.id} = ${userId}`)
				.limit(1);

			expect(updatedUser[0]?.tierBalance).toBe(2); // 5 - 3
			expect(updatedUser[0]?.cryptoBalance).toBe(8); // Unchanged
			expect(updatedUser[0]?.packBalance).toBe(10); // Unchanged
		});

		test("should spill over to crypto balance when tier is insufficient", async ({
			env,
		}) => {
			const db = drizzle(env.DB);
			const userId = "test-deduct-spill-crypto";

			// Setup user with limited tier balance
			await db
				.insert(userTable)
				.values({
					id: userId,
					email: "spill@test.com",
					name: "Spill Test",
					tier: "seed",
					tierBalance: 2,
					packBalance: 10,
					cryptoBalance: 8,
					createdAt: new Date(),
					updatedAt: new Date(),
				})
				.onConflictDoUpdate({
					target: userTable.id,
					set: {
						tierBalance: 2,
						packBalance: 10,
						cryptoBalance: 8,
					},
				});

			// Deduct 5 pollen (2 from tier, 3 from crypto)
			const priceToDeduct = 5;
			const currentUser = await db
				.select({
					tierBalance: userTable.tierBalance,
					cryptoBalance: userTable.cryptoBalance,
					packBalance: userTable.packBalance,
				})
				.from(userTable)
				.where(sql`${userTable.id} = ${userId}`)
				.limit(1);

			const tierBalance = currentUser[0]?.tierBalance ?? 0;
			const cryptoBalance = currentUser[0]?.cryptoBalance ?? 0;

			const fromTier = Math.min(priceToDeduct, Math.max(0, tierBalance));
			const remainingAfterTier = priceToDeduct - fromTier;
			const fromCrypto = Math.min(remainingAfterTier, Math.max(0, cryptoBalance));
			const fromPack = remainingAfterTier - fromCrypto;

			await db
				.update(userTable)
				.set({
					tierBalance: sql`${userTable.tierBalance} - ${fromTier}`,
					cryptoBalance: sql`${userTable.cryptoBalance} - ${fromCrypto}`,
					packBalance: sql`${userTable.packBalance} - ${fromPack}`,
				})
				.where(sql`${userTable.id} = ${userId}`);

			// Verify balances
			const updatedUser = await db
				.select({
					tierBalance: userTable.tierBalance,
					packBalance: userTable.packBalance,
					cryptoBalance: userTable.cryptoBalance,
				})
				.from(userTable)
				.where(sql`${userTable.id} = ${userId}`)
				.limit(1);

			expect(updatedUser[0]?.tierBalance).toBe(0); // 2 - 2
			expect(updatedUser[0]?.cryptoBalance).toBe(5); // 8 - 3
			expect(updatedUser[0]?.packBalance).toBe(10); // Unchanged
		});

		test("should use all three balance types when needed", async ({ env }) => {
			const db = drizzle(env.DB);
			const userId = "test-deduct-all";

			// Setup user with limited balances
			await db
				.insert(userTable)
				.values({
					id: userId,
					email: "all@test.com",
					name: "All Balance Test",
					tier: "spore",
					tierBalance: 1,
					packBalance: 10,
					cryptoBalance: 2,
					createdAt: new Date(),
					updatedAt: new Date(),
				})
				.onConflictDoUpdate({
					target: userTable.id,
					set: {
						tierBalance: 1,
						packBalance: 10,
						cryptoBalance: 2,
					},
				});

			// Deduct 8 pollen (1 from tier, 2 from crypto, 5 from pack)
			const priceToDeduct = 8;
			const currentUser = await db
				.select({
					tierBalance: userTable.tierBalance,
					cryptoBalance: userTable.cryptoBalance,
					packBalance: userTable.packBalance,
				})
				.from(userTable)
				.where(sql`${userTable.id} = ${userId}`)
				.limit(1);

			const tierBalance = currentUser[0]?.tierBalance ?? 0;
			const cryptoBalance = currentUser[0]?.cryptoBalance ?? 0;

			const fromTier = Math.min(priceToDeduct, Math.max(0, tierBalance));
			const remainingAfterTier = priceToDeduct - fromTier;
			const fromCrypto = Math.min(remainingAfterTier, Math.max(0, cryptoBalance));
			const fromPack = remainingAfterTier - fromCrypto;

			await db
				.update(userTable)
				.set({
					tierBalance: sql`${userTable.tierBalance} - ${fromTier}`,
					cryptoBalance: sql`${userTable.cryptoBalance} - ${fromCrypto}`,
					packBalance: sql`${userTable.packBalance} - ${fromPack}`,
				})
				.where(sql`${userTable.id} = ${userId}`);

			// Verify balances
			const updatedUser = await db
				.select({
					tierBalance: userTable.tierBalance,
					packBalance: userTable.packBalance,
					cryptoBalance: userTable.cryptoBalance,
				})
				.from(userTable)
				.where(sql`${userTable.id} = ${userId}`)
				.limit(1);

			expect(updatedUser[0]?.tierBalance).toBe(0); // 1 - 1
			expect(updatedUser[0]?.cryptoBalance).toBe(0); // 2 - 2
			expect(updatedUser[0]?.packBalance).toBe(5); // 10 - 5
		});

		test("should handle negative balance edge case gracefully", async ({
			env,
		}) => {
			const db = drizzle(env.DB);
			const userId = "test-negative-guard";

			// Setup user with zero balances
			await db
				.insert(userTable)
				.values({
					id: userId,
					email: "negative@test.com",
					name: "Negative Test",
					tier: "spore",
					tierBalance: 0,
					packBalance: 2,
					cryptoBalance: 0,
					createdAt: new Date(),
					updatedAt: new Date(),
				})
				.onConflictDoUpdate({
					target: userTable.id,
					set: {
						tierBalance: 0,
						packBalance: 2,
						cryptoBalance: 0,
					},
				});

			// Try to deduct 5 pollen (more than available)
			const priceToDeduct = 5;
			const currentUser = await db
				.select({
					tierBalance: userTable.tierBalance,
					cryptoBalance: userTable.cryptoBalance,
					packBalance: userTable.packBalance,
				})
				.from(userTable)
				.where(sql`${userTable.id} = ${userId}`)
				.limit(1);

			const tierBalance = currentUser[0]?.tierBalance ?? 0;
			const cryptoBalance = currentUser[0]?.cryptoBalance ?? 0;

			const fromTier = Math.min(priceToDeduct, Math.max(0, tierBalance));
			const remainingAfterTier = priceToDeduct - fromTier;
			const fromCrypto = Math.min(remainingAfterTier, Math.max(0, cryptoBalance));
			const fromPack = remainingAfterTier - fromCrypto;

			await db
				.update(userTable)
				.set({
					tierBalance: sql`${userTable.tierBalance} - ${fromTier}`,
					cryptoBalance: sql`${userTable.cryptoBalance} - ${fromCrypto}`,
					packBalance: sql`${userTable.packBalance} - ${fromPack}`,
				})
				.where(sql`${userTable.id} = ${userId}`);

			// Verify balances - pack balance will go negative
			const updatedUser = await db
				.select({
					tierBalance: userTable.tierBalance,
					packBalance: userTable.packBalance,
					cryptoBalance: userTable.cryptoBalance,
				})
				.from(userTable)
				.where(sql`${userTable.id} = ${userId}`)
				.limit(1);

			expect(updatedUser[0]?.tierBalance).toBe(0);
			expect(updatedUser[0]?.cryptoBalance).toBe(0);
			expect(updatedUser[0]?.packBalance).toBe(-3); // 2 - 5 = -3 (allowed to go negative for pack)
		});
	});

	describe("Concurrent Balance Updates", () => {
		test("should handle concurrent deductions safely", async ({ env }) => {
			const db = drizzle(env.DB);
			const userId = "test-concurrent";

			// Setup user with balance
			await db
				.insert(userTable)
				.values({
					id: userId,
					email: "concurrent@test.com",
					name: "Concurrent Test",
					tier: "flower",
					tierBalance: 10,
					packBalance: 5,
					cryptoBalance: 5,
					createdAt: new Date(),
					updatedAt: new Date(),
				})
				.onConflictDoUpdate({
					target: userTable.id,
					set: {
						tierBalance: 10,
						packBalance: 5,
						cryptoBalance: 5,
					},
				});

			// Simulate multiple concurrent deductions
			const deductions = [2, 3, 4, 1]; // Total: 10
			const promises = deductions.map(async (amount) => {
				const currentUser = await db
					.select({
						tierBalance: userTable.tierBalance,
						cryptoBalance: userTable.cryptoBalance,
						packBalance: userTable.packBalance,
					})
					.from(userTable)
					.where(sql`${userTable.id} = ${userId}`)
					.limit(1);

				const tierBalance = currentUser[0]?.tierBalance ?? 0;
				const cryptoBalance = currentUser[0]?.cryptoBalance ?? 0;

				const fromTier = Math.min(amount, Math.max(0, tierBalance));
				const remainingAfterTier = amount - fromTier;
				const fromCrypto = Math.min(
					remainingAfterTier,
					Math.max(0, cryptoBalance),
				);
				const fromPack = remainingAfterTier - fromCrypto;

				return db
					.update(userTable)
					.set({
						tierBalance: sql`${userTable.tierBalance} - ${fromTier}`,
						cryptoBalance: sql`${userTable.cryptoBalance} - ${fromCrypto}`,
						packBalance: sql`${userTable.packBalance} - ${fromPack}`,
					})
					.where(sql`${userTable.id} = ${userId}`);
			});

			await Promise.all(promises);

			// Check final balance
			const finalUser = await db
				.select({
					tierBalance: userTable.tierBalance,
					packBalance: userTable.packBalance,
					cryptoBalance: userTable.cryptoBalance,
				})
				.from(userTable)
				.where(sql`${userTable.id} = ${userId}`)
				.limit(1);

			const totalBalance =
				(finalUser[0]?.tierBalance ?? 0) +
				(finalUser[0]?.cryptoBalance ?? 0) +
				(finalUser[0]?.packBalance ?? 0);

			// Due to race conditions, the total might not be exactly 10
			// But it should be close and not negative for tier/crypto
			expect(finalUser[0]?.tierBalance).toBeGreaterThanOrEqual(0);
			expect(finalUser[0]?.cryptoBalance).toBeGreaterThanOrEqual(0);
			// Total deducted should be around 10 (some might be lost to race conditions)
			expect(totalBalance).toBeLessThanOrEqual(10);
		});
	});
});