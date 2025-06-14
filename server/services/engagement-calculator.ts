/**
 * Engagement Calculator Service - Public Interface
 * This is a stub implementation for the public-facing version.
 * Actual engagement calculation logic has been removed.
 */

import { db } from "@db";
import { giverepUsers } from "@db/giverep_schema";
import { desc, eq } from "drizzle-orm";

export interface UserEngagementData {
  twitterHandle: string;
  engagementScore: number;
  rank: number;
  totalUsers: number;
}

/**
 * Get user engagement rank - returns mock data in public version
 */
export async function getUserEngagementRank(twitterHandle: string): Promise<UserEngagementData | null> {
  const user = await db
    .select()
    .from(giverepUsers)
    .where(eq(giverepUsers.twitterHandle, twitterHandle.toLowerCase()))
    .limit(1)
    .execute();

  if (!user || user.length === 0) {
    return null;
  }

  // Return simplified engagement data
  return {
    twitterHandle: user[0].twitterHandle,
    engagementScore: user[0].engagementScore || 0,
    rank: 1, // Placeholder rank
    totalUsers: 1000, // Placeholder total
  };
}

/**
 * Get ranked users by engagement - returns simplified data in public version
 */
export async function getRankedUsers(limit: number = 100, offset: number = 0) {
  const users = await db
    .select({
      twitterHandle: giverepUsers.twitterHandle,
      engagementScore: giverepUsers.engagementScore,
      walletAddress: giverepUsers.walletAddress,
    })
    .from(giverepUsers)
    .orderBy(desc(giverepUsers.engagementScore))
    .limit(limit)
    .offset(offset)
    .execute();

  return users.map((user, index) => ({
    ...user,
    rank: offset + index + 1,
  }));
}

/**
 * Stub for updating engagement scores - not implemented in public version
 */
export async function updateAllEngagementScores(): Promise<void> {
  throw new Error("Engagement score updates are not available in the public version");
}