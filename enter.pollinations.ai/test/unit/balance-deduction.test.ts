import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { beforeEach, describe, expect, it } from "vitest";
import { user as userTable } from "@/db/schema/better-auth.ts";
import {
    atomicDeductUserBalance,
    calculateDeductionSplit,
    getUserBalances,
} from "@/utils/balance-deduction.ts";
import { test } from "../fixtures.ts";

describe("Atomic Balance Deduction", () => {
    describe("atomicDeductUserBalance", () => {
        test("should atomically deduct from balances in correct order", async ({
            env,
        }) => {
            const db = drizzle(env.DB);
            const userId = "atomic-test-1";

            // Setup user with all balance types
            await db
                .insert(userTable)
                .values({
                    id: userId,
                    email: "atomic1@test.com",
                    name: "Atomic Test 1",
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

            // Perform atomic deduction
            await atomicDeductUserBalance(db, userId, 3);

            // Verify balances
            const balances = await getUserBalances(db, userId);
            expect(balances.tierBalance).toBe(2); // 5 - 3
            expect(balances.cryptoBalance).toBe(8); // Unchanged
            expect(balances.packBalance).toBe(10); // Unchanged
        });

        test("should handle spillover correctly", async ({ env }) => {
            const db = drizzle(env.DB);
            const userId = "atomic-test-2";

            // Setup user with limited tier balance
            await db
                .insert(userTable)
                .values({
                    id: userId,
                    email: "atomic2@test.com",
                    name: "Atomic Test 2",
                    tier: "seed",
                    tierBalance: 2,
                    packBalance: 10,
                    cryptoBalance: 3,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                })
                .onConflictDoUpdate({
                    target: userTable.id,
                    set: {
                        tierBalance: 2,
                        packBalance: 10,
                        cryptoBalance: 3,
                    },
                });

            // Deduct 6 pollen (2 from tier, 3 from crypto, 1 from pack)
            await atomicDeductUserBalance(db, userId, 6);

            // Verify balances
            const balances = await getUserBalances(db, userId);
            expect(balances.tierBalance).toBe(0); // 2 - 2
            expect(balances.cryptoBalance).toBe(0); // 3 - 3
            expect(balances.packBalance).toBe(9); // 10 - 1
        });

        test("should allow pack balance to go negative", async ({ env }) => {
            const db = drizzle(env.DB);
            const userId = "atomic-test-3";

            // Setup user with minimal balances
            await db
                .insert(userTable)
                .values({
                    id: userId,
                    email: "atomic3@test.com",
                    name: "Atomic Test 3",
                    tier: "spore",
                    tierBalance: 1,
                    packBalance: 2,
                    cryptoBalance: 1,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                })
                .onConflictDoUpdate({
                    target: userTable.id,
                    set: {
                        tierBalance: 1,
                        packBalance: 2,
                        cryptoBalance: 1,
                    },
                });

            // Deduct more than available (10 pollen)
            await atomicDeductUserBalance(db, userId, 10);

            // Verify balances
            const balances = await getUserBalances(db, userId);
            expect(balances.tierBalance).toBe(0); // 1 - 1
            expect(balances.cryptoBalance).toBe(0); // 1 - 1
            expect(balances.packBalance).toBe(-6); // 2 - 8 = -6
        });

        test("should handle zero deduction gracefully", async ({ env }) => {
            const db = drizzle(env.DB);
            const userId = "atomic-test-4";

            // Setup user
            await db
                .insert(userTable)
                .values({
                    id: userId,
                    email: "atomic4@test.com",
                    name: "Atomic Test 4",
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

            // Deduct 0 (should be no-op)
            await atomicDeductUserBalance(db, userId, 0);

            // Verify balances unchanged
            const balances = await getUserBalances(db, userId);
            expect(balances.tierBalance).toBe(10);
            expect(balances.cryptoBalance).toBe(5);
            expect(balances.packBalance).toBe(5);
        });

        test("should handle null/missing balances", async ({ env }) => {
            const db = drizzle(env.DB);
            const userId = "atomic-test-5";

            // Setup user with null balances
            await db
                .insert(userTable)
                .values({
                    id: userId,
                    email: "atomic5@test.com",
                    name: "Atomic Test 5",
                    tier: "spore",
                    tierBalance: null,
                    packBalance: null,
                    cryptoBalance: null,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                })
                .onConflictDoUpdate({
                    target: userTable.id,
                    set: {
                        tierBalance: null,
                        packBalance: null,
                        cryptoBalance: null,
                    },
                });

            // Deduct should handle nulls as 0
            await atomicDeductUserBalance(db, userId, 5);

            // Verify balances
            const balances = await getUserBalances(db, userId);
            expect(balances.tierBalance).toBe(0);
            expect(balances.cryptoBalance).toBe(0);
            expect(balances.packBalance).toBe(0); // Would be -5 but nulls coalesce to 0
        });
    });

    describe("calculateDeductionSplit", () => {
        it("should calculate correct split when tier covers all", () => {
            const split = calculateDeductionSplit(10, 5, 5, 3);
            expect(split.fromTier).toBe(3);
            expect(split.fromCrypto).toBe(0);
            expect(split.fromPack).toBe(0);
        });

        it("should calculate correct split with spillover to crypto", () => {
            const split = calculateDeductionSplit(2, 5, 10, 6);
            expect(split.fromTier).toBe(2);
            expect(split.fromCrypto).toBe(4);
            expect(split.fromPack).toBe(0);
        });

        it("should calculate correct split using all three types", () => {
            const split = calculateDeductionSplit(2, 3, 10, 8);
            expect(split.fromTier).toBe(2);
            expect(split.fromCrypto).toBe(3);
            expect(split.fromPack).toBe(3);
        });

        it("should handle negative balances correctly", () => {
            const split = calculateDeductionSplit(-5, 10, 5, 3);
            expect(split.fromTier).toBe(0); // Negative treated as 0
            expect(split.fromCrypto).toBe(3);
            expect(split.fromPack).toBe(0);
        });

        it("should handle deduction larger than total balance", () => {
            const split = calculateDeductionSplit(1, 1, 1, 10);
            expect(split.fromTier).toBe(1);
            expect(split.fromCrypto).toBe(1);
            expect(split.fromPack).toBe(8); // Will make pack go negative
        });
    });

    describe("getUserBalances", () => {
        test("should return correct balances for existing user", async ({
            env,
        }) => {
            const db = drizzle(env.DB);
            const userId = "balance-test-1";

            await db
                .insert(userTable)
                .values({
                    id: userId,
                    email: "balance1@test.com",
                    name: "Balance Test 1",
                    tier: "flower",
                    tierBalance: 10,
                    packBalance: 20,
                    cryptoBalance: 15,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                })
                .onConflictDoUpdate({
                    target: userTable.id,
                    set: {
                        tierBalance: 10,
                        packBalance: 20,
                        cryptoBalance: 15,
                    },
                });

            const balances = await getUserBalances(db, userId);
            expect(balances.tierBalance).toBe(10);
            expect(balances.packBalance).toBe(20);
            expect(balances.cryptoBalance).toBe(15);
        });

        test("should return zeros for non-existent user", async ({ env }) => {
            const db = drizzle(env.DB);
            const balances = await getUserBalances(db, "non-existent-user");
            expect(balances.tierBalance).toBe(0);
            expect(balances.packBalance).toBe(0);
            expect(balances.cryptoBalance).toBe(0);
        });

        test("should handle null balances as zeros", async ({ env }) => {
            const db = drizzle(env.DB);
            const userId = "balance-test-2";

            await db
                .insert(userTable)
                .values({
                    id: userId,
                    email: "balance2@test.com",
                    name: "Balance Test 2",
                    tier: "spore",
                    tierBalance: null,
                    packBalance: null,
                    cryptoBalance: null,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                })
                .onConflictDoUpdate({
                    target: userTable.id,
                    set: {
                        tierBalance: null,
                        packBalance: null,
                        cryptoBalance: null,
                    },
                });

            const balances = await getUserBalances(db, userId);
            expect(balances.tierBalance).toBe(0);
            expect(balances.packBalance).toBe(0);
            expect(balances.cryptoBalance).toBe(0);
        });
    });
});
