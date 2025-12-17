import { drizzle } from "drizzle-orm/d1";
import { eq, sql, and } from "drizzle-orm";
import { user } from "@/db/schema/better-auth";
import { HTTPException } from "hono/http-exception";

export interface BalanceDeductionResult {
  success: boolean;
  newBalance: number;
  previousBalance: number;
  deductedAmount: number;
}

/**
 * Atomically deduct balance from a user's account.
 * This prevents race conditions by using a single atomic SQL operation.
 * 
 * @param db - Database connection
 * @param userId - User ID
 * @param amount - Amount to deduct (must be positive)
 * @returns BalanceDeductionResult if successful, throws error if insufficient balance
 */
export async function atomicBalanceDeduction(
  db: ReturnType<typeof drizzle>,
  userId: string,
  amount: number
): Promise<BalanceDeductionResult> {
  if (amount <= 0) {
    throw new Error("Deduction amount must be positive");
  }

  // Atomic update: only deduct if balance >= amount
  const result = await db
    .update(user)
    .set({ 
      balance: sql`${user.balance} - ${amount}` 
    })
    .where(
      and(
        eq(user.id, userId),
        sql`${user.balance} >= ${amount}`
      )
    )
    .returning({ 
      newBalance: user.balance,
      previousBalance: sql`${user.balance} + ${amount}`
    });

  if (result.length === 0) {
    // Either user doesn't exist or insufficient balance
    const userCheck = await db
      .select({ balance: user.balance })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    if (userCheck.length === 0) {
      throw new HTTPException(404, { message: "User not found" });
    } else {
      throw new HTTPException(403, { 
        message: `Insufficient pollen balance. Current balance: ${userCheck[0].balance}, required: ${amount}` 
      });
    }
  }

  return {
    success: true,
    newBalance: result[0].newBalance,
    previousBalance: result[0].previousBalance as number,
    deductedAmount: amount
  };
}

/**
 * Get current user balance
 */
export async function getUserBalance(
  db: ReturnType<typeof drizzle>,
  userId: string
): Promise<number> {
  const result = await db
    .select({ balance: user.balance })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  if (result.length === 0) {
    throw new HTTPException(404, { message: "User not found" });
  }

  return result[0].balance;
}

/**
 * Add balance to a user's account (for refunds or credits)
 */
export async function addUserBalance(
  db: ReturnType<typeof drizzle>,
  userId: string,
  amount: number
): Promise<number> {
  if (amount <= 0) {
    throw new Error("Amount must be positive");
  }

  const result = await db
    .update(user)
    .set({ 
      balance: sql`${user.balance} + ${amount}` 
    })
    .where(eq(user.id, userId))
    .returning({ newBalance: user.balance });

  if (result.length === 0) {
    throw new HTTPException(404, { message: "User not found" });
  }

  return result[0].newBalance;
}