/**
 * GiveRep Service - Public Interface
 * This is a stub implementation for the public-facing version.
 * Tweet collection and data gathering functionality has been removed.
 */

import { db } from "@db";
import { giverepUsers, giverepTweets } from "@db/giverep_schema";
import { desc, sql } from "drizzle-orm";

/**
 * Stub for tweet collection - not implemented in public version
 */
export async function collectGiveRepTweets(
  searchTerms: string[],
  maxTweets: number = 50,
  daysBack: number = 7
): Promise<{ collectedTweets: number; newTweets: number }> {
  throw new Error("Tweet collection is not available in the public version");
}

/**
 * Stub for user-specific tweet collection - not implemented in public version
 */
export async function collectGiveRepTweetsForUser(
  twitterHandle: string,
  maxTweets: number = 50,
  daysBack: number = 7
): Promise<{ collectedTweets: number; newTweets: number }> {
  throw new Error("Tweet collection is not available in the public version");
}

/**
 * Get GiveRep platform statistics
 * This is a read-only function that remains functional
 */
export async function getGiveRepStats() {
  const stats = await db
    .select({
      totalUsers: sql<number>`COUNT(DISTINCT ${giverepUsers.id})`,
      totalTweets: sql<number>`COUNT(DISTINCT ${giverepTweets.id})`,
      tweetsLast24h: sql<number>`COUNT(DISTINCT ${giverepTweets.id}) FILTER (WHERE ${giverepTweets.createdAt} >= NOW() - INTERVAL '24 hours')`,
      tweetsLast7Days: sql<number>`COUNT(DISTINCT ${giverepTweets.id}) FILTER (WHERE ${giverepTweets.createdAt} >= NOW() - INTERVAL '7 days')`,
    })
    .from(giverepUsers)
    .leftJoin(giverepTweets, sql`${giverepUsers.twitterHandle} = ${giverepTweets.authorUsername}`)
    .execute();

  return stats[0] || {
    totalUsers: 0,
    totalTweets: 0,
    tweetsLast24h: 0,
    tweetsLast7Days: 0,
  };
}

/**
 * Get recent tweets for display
 * This is a read-only function that remains functional
 */
export async function getRecentTweets(limit: number = 10) {
  const tweets = await db
    .select()
    .from(giverepTweets)
    .orderBy(desc(giverepTweets.createdAt))
    .limit(limit)
    .execute();

  return tweets;
}