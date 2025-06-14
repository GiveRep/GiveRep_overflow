import { db, readDb, pool, readPool, writePool } from "@db";
import { giverepUsers, giverepTweets } from "@db/giverep_schema";
import {
  repUsers,
  repPoints,
  repQuota,
  repScans,
  repKeywords,
  RepQuota,
} from "@db/reputation_schema";
import {
  eq,
  and,
  sql,
  gte,
  lt,
  desc,
  count,
  isNotNull,
  like,
} from "drizzle-orm";
import { format, startOfDay, endOfDay, addDays, subDays } from "date-fns";
// Import the twitter service and Apify client
import * as TwitterService from "../twitter-service";
import { ApifyClient } from "apify-client";
// Import our tweet mention processor for improved GiveRep detection
import {
  isValidGiveRepTweet,
  getExplicitBodyMentions,
  getAllMentions,
} from "../lib/tweet-mention-processor";
import { getActiveLoyaltyProgramId } from "./loyalty-influencer-sync";
import fs from "fs";
import path from "path";

/**
 * Helper function to update total_reputation in the rep_users table
 * If user has zero total_reputation, it will recalculate from rep_points table
 * @param handle User's Twitter handle
 * @param pointsToAdd Points to add to total_reputation
 */
async function updateUserTotalReputation(
  handle: string,
  pointsToAdd: number
): Promise<void> {
  try {
    // Normalize the handle
    const normalizedHandle = handle.toLowerCase();

    // Get the current user
    const [user] = await db
      .select()
      .from(repUsers)
      .where(sql`LOWER(${repUsers.twitterHandle}) = ${normalizedHandle}`);

    if (!user) {
      console.log(
        `User ${handle} not found in rep_users table, creating new user record`
      );
      // Create the user first
      await db.insert(repUsers).values({
        twitterHandle: handle,
        totalReputation: pointsToAdd,
        lastUpdated: new Date(),
      });
      return;
    }

    // If total_reputation is zero or null, recalculate from rep_points table
    if (!user.totalReputation || user.totalReputation === 0) {
      console.log(
        `User ${handle} has zero total_reputation, recalculating from rep_points...`
      );

      // Calculate the total reputation from rep_points
      const { rows } = await pool.query(
        `
        SELECT COALESCE(SUM(points), 0) as total FROM rep_points
        WHERE LOWER(to_handle) = $1
      `,
        [normalizedHandle]
      );

      // Add the current points being awarded
      const totalPoints = parseInt(rows[0].total) + pointsToAdd;

      // Update the user's total_reputation
      await db
        .update(repUsers)
        .set({
          lastUpdated: new Date(),
          totalReputation: sql`${repUsers.totalReputation} + ${pointsToAdd}`,
        })
        .where(sql`LOWER(${repUsers.twitterHandle}) = ${normalizedHandle}`);

      console.log(
        `Updated ${handle}'s total_reputation to ${totalPoints} (recalculated)`
      );
    } else {
      // Just add the new points to the existing total
      await db
        .update(repUsers)
        .set({
          lastUpdated: new Date(),
          totalReputation: sql`${repUsers.totalReputation} + ${pointsToAdd}`,
        })
        .where(sql`LOWER(${repUsers.twitterHandle}) = ${normalizedHandle}`);

      console.log(
        `Updated ${handle}'s total_reputation to ${
          user.totalReputation + pointsToAdd
        }`
      );
    }
  } catch (error) {
    console.error("Error updating user total reputation:", error);
    throw error;
  }
}

/**
 * Update user's period points and influencer endorsements without touching timestamps
 * This is called by the reputation scan to keep period totals up to date
 * @param handle User's Twitter handle (recipient)
 * @param pointsToAdd Points to add to period totals
 * @param fromHandle Handle of the user giving points
 * @param isInfluencer Whether the giver is an influencer
 * @param tweetCreatedAt When the tweet was created
 */
async function updateUserPeriodPoints(
  handle: string,
  pointsToAdd: number,
  fromHandle: string,
  isInfluencer: boolean,
  tweetCreatedAt: Date
): Promise<void> {
  try {
    // Normalize handles
    const normalizedHandle = handle.toLowerCase();
    const normalizedFromHandle = fromHandle.toLowerCase();

    // Calculate time boundaries
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    // Determine which periods this tweet falls into
    const isIn1d = tweetCreatedAt >= dayAgo;
    const isIn7d = tweetCreatedAt >= weekAgo;
    const isIn14d = tweetCreatedAt >= twoWeeksAgo;
    const isIn30d = tweetCreatedAt >= monthAgo;
    const isIn90d = tweetCreatedAt >= threeMonthsAgo;

    // Build the SQL update query with conditional updates
    let updateQuery = `
      UPDATE rep_users SET
        points_last_1d = points_last_1d + CASE WHEN $1 THEN $2 ELSE 0 END,
        points_last_7d = points_last_7d + CASE WHEN $3 THEN $2 ELSE 0 END,
        points_last_30d = points_last_30d + CASE WHEN $4 THEN $2 ELSE 0 END,
        points_last_90d = points_last_90d + CASE WHEN $5 THEN $2 ELSE 0 END,
        last_updated = NOW()
    `;

    const params: (string | number | boolean)[] = [
      isIn1d,
      pointsToAdd,
      isIn7d,
      isIn30d,
      isIn90d,
    ];
    let paramIndex = 6;

    // If from influencer, update endorsement sets
    if (isInfluencer) {
      // Update 7d endorsements
      if (isIn7d) {
        updateQuery += `,
          endorsed_by_influencers_7d = CASE
            WHEN endorsed_by_influencers_7d IS NULL OR endorsed_by_influencers_7d = '' THEN $${paramIndex}
            WHEN endorsed_by_influencers_7d NOT LIKE '%' || $${paramIndex} || '%' THEN endorsed_by_influencers_7d || ',' || $${paramIndex}
            ELSE endorsed_by_influencers_7d
          END`;
        params.push(normalizedFromHandle);
        paramIndex++;
      }

      // Update 14d endorsements
      if (isIn14d) {
        updateQuery += `,
          endorsed_by_influencers_14d = CASE
            WHEN endorsed_by_influencers_14d IS NULL OR endorsed_by_influencers_14d = '' THEN $${paramIndex}
            WHEN endorsed_by_influencers_14d NOT LIKE '%' || $${paramIndex} || '%' THEN endorsed_by_influencers_14d || ',' || $${paramIndex}
            ELSE endorsed_by_influencers_14d
          END`;
        params.push(normalizedFromHandle);
        paramIndex++;
      }

      // Update 30d endorsements
      if (isIn30d) {
        updateQuery += `,
          endorsed_by_influencers_30d = CASE
            WHEN endorsed_by_influencers_30d IS NULL OR endorsed_by_influencers_30d = '' THEN $${paramIndex}
            WHEN endorsed_by_influencers_30d NOT LIKE '%' || $${paramIndex} || '%' THEN endorsed_by_influencers_30d || ',' || $${paramIndex}
            ELSE endorsed_by_influencers_30d
          END`;
        params.push(normalizedFromHandle);
        paramIndex++;
      }

      // Always update all_time endorsements for influencers
      updateQuery += `,
        endorsed_by_influencers = CASE
          WHEN endorsed_by_influencers IS NULL OR endorsed_by_influencers = '' THEN $${paramIndex}
          WHEN endorsed_by_influencers NOT LIKE '%' || $${paramIndex} || '%' THEN endorsed_by_influencers || ',' || $${paramIndex}
          ELSE endorsed_by_influencers
        END`;
      params.push(normalizedFromHandle);
      paramIndex++;
    }

    // Add WHERE clause
    updateQuery += ` WHERE LOWER(twitter_handle) = $${paramIndex}`;
    params.push(normalizedHandle);

    // Execute the update
    await pool.query(updateQuery, params);

    console.log(
      `Updated period points for ${handle}: +${pointsToAdd} points` +
        (isInfluencer ? ` from influencer @${fromHandle}` : "")
    );
  } catch (error) {
    console.error("Error updating user period points:", error);
    // Don't throw - we don't want to break the main reputation flow
  }
}

// 1. Interface definitions
interface ReputationStats {
  total_users: number;
  total_reputation_given: number;
  top_givers: ReputationUser[];
  top_receivers: ReputationUser[];
}

interface ReputationUser {
  handle: string;
  reputation: number | null;
  profile_url?: string | null;
  follower_count?: number | null;
  high_value_givers?: Array<{
    handle: string;
    profile_url?: string | null;
  }>;
}

interface ApiRepTweet {
  id: string;
  text: string;
  createdAt: string;
  likeCount: number;
  viewCount: number;
  retweetCount: number;
  replyCount?: number;
  author: {
    userName: string;
    followers?: number;
    id?: string; // Adding author_id to store the Twitter user ID
  };
  isRetweet: boolean;
  isQuote: boolean;
  quotedUser?: {
    userName: string;
    id?: string;
  };
}

interface RepScanResults {
  scanId: number;
  tweetsProcessed: number;
  reputationAwarded: number;
  newUsers: number;
}

// Create batches of 100 tweets
const dbOperationBatchSize = 100;

const fileOperationBatchSize = 100;

export async function scanReputationTweetFiles(
  startTime: Date,
  endTime: Date
): Promise<RepScanResults> {
  console.log(
    `Starting reputation scan with TwitterAPI.io/Apify - NOTICE: Only processing tweets from ${startTime.toISOString()} to ${endTime.toISOString()}`
  );

  // Create tracking record for this scan
  const scanId = Math.floor(Math.random() * 10000);
  let tweetsProcessed = 0;
  let reputationAwarded = 0;
  let newUsers = 0;
  let keywordPoints = 0;

  try {
    // Check for Twitter API IO key
    console.log("Checking for Twitter API keys...");
    if (!process.env.TWITTER_API_IO_KEY) {
      console.log("TWITTER_API_IO_KEY not found, will use Apify fallback");
    } else {
      console.log("TWITTER_API_IO_KEY is available");
    }

    // Get current keyword to scan for
    const currentKeyword = await getCurrentKeyword();
    let keywordSearch = null;

    if (currentKeyword) {
      console.log(
        `Found active keyword of the day: "${currentKeyword.keyword}"`
      );
      keywordSearch = currentKeyword.keyword.toLowerCase();
    }

    console.log("Searching for tweets mentioning @giverep...");

    // Use our Twitter service's mentions API which handles fallback automatically
    // This is more accurate than just fetching tweets since it specifically gets mentions
    const tweetFiles = await TwitterService.fetchUserMentionsToFiles(
      "giverep", // User to find mentions for
      startTime, // Start date
      endTime, // End date
      1000_000_000 // Get up to 1000000000 mentions
    );

    // Process tweet files in batches
    const batches = [];

    // Create batches from file paths
    for (let i = 0; i < tweetFiles.length; i += fileOperationBatchSize) {
      batches.push(tweetFiles.slice(i, i + fileOperationBatchSize));
    }

    // Process each batch of files sequentially, but files within batch in parallel
    let totalAwarded = 0;

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      console.log(
        `Processing file batch ${batchIndex + 1}/${batches.length} (${
          batch.length
        } files)`
      );

      // Process all files in this batch in parallel
      const batchResults = await Promise.all(
        batch.map(async (filePath: string, fileIndex: number) => {
          const actualIndex = batchIndex * dbOperationBatchSize + fileIndex;
          console.log(`Processing file ${actualIndex + 1}: ${filePath}`);

          // Read the tweet from file
          const tweetData = JSON.parse(
            fs.readFileSync(filePath, "utf8")
          ) as ApiRepTweet;

          // Process this tweet for reputation
          const awarded = await processReputationTweet(tweetData);
          tweetsProcessed++;
          return awarded;
        })
      );

      // Count awarded tweets in this batch
      const batchAwarded = batchResults.filter(
        (awarded: boolean) => awarded
      ).length;
      totalAwarded += batchAwarded;
      console.log(
        `Batch ${batchIndex + 1} complete: ${batchAwarded} reputation awarded`
      );
    }

    reputationAwarded = totalAwarded;
    console.log(
      `Total: Awarded reputation to ${reputationAwarded} tweets out of ${tweetsProcessed}`
    );

    // Clean up temporary files
    if (tweetFiles.length > 0) {
      try {
        // Extract temp directory from the first file path (all files are in the same directory)
        const tempDir = path.dirname(tweetFiles[0]);
        console.log(`Cleaning up temporary directory: ${tempDir}`);
        fs.rmSync(tempDir, { recursive: true, force: true });
        console.log(
          `Successfully cleaned up ${tweetFiles.length} temporary files`
        );
      } catch (cleanupError) {
        console.warn(
          "Error cleaning up temporary files (non-fatal):",
          cleanupError
        );
      }
    }

    // If we have an active keyword, search for it in existing tweets from verified users
    if (keywordSearch) {
      console.log(
        `Starting scan for keyword "${keywordSearch}" in existing verified user tweets`
      );

      try {
        // Get all verified GiveRep users
        const verifiedUsers = await readDb.query.giverepUsers.findMany({
          where: eq(giverepUsers.is_verified, true),
        });

        console.log(
          `Found ${verifiedUsers.length} verified users to check for keyword usage`
        );

        // For each verified user, check their tweets for the keyword
        // Process verified users in batches of 100
        const userBatches = [];

        for (let i = 0; i < verifiedUsers.length; i += dbOperationBatchSize) {
          userBatches.push(verifiedUsers.slice(i, i + dbOperationBatchSize));
        }

        for (
          let batchIndex = 0;
          batchIndex < userBatches.length;
          batchIndex++
        ) {
          const userBatch = userBatches[batchIndex];
          console.log(
            `Processing verified user batch ${batchIndex + 1}/${
              userBatches.length
            } (${userBatch.length} users)`
          );

          // Process all users in the batch in parallel
          await Promise.all(
            userBatch.map(async (verifiedUser) => {
              const userHandle = verifiedUser.twitter_handle.toLowerCase();

              // We need to join with the users table since giverepTweets doesn't have user_handle directly
              const userTweets = await readDb
                .select({
                  tweet_id: giverepTweets.tweet_id,
                  content: giverepTweets.content,
                  date_posted: giverepTweets.date_posted,
                  user_handle: giverepUsers.twitter_handle,
                })
                .from(giverepTweets)
                .innerJoin(
                  giverepUsers,
                  eq(giverepTweets.user_id, giverepUsers.id)
                )
                .where(
                  sql`LOWER(${giverepUsers.twitter_handle}) = ${userHandle}`
                );

              console.log(
                `Checking ${userTweets.length} tweets from verified user ${userHandle} for keyword "${keywordSearch}"`
              );

              // Process all tweets for this user in parallel
              const keywordResults = await Promise.all(
                userTweets.map(async (userTweet) => {
                  const tweetContent = userTweet.content.toLowerCase();

                  // Skip tweets that also mention @giverep since those are handled above with regular reputation
                  if (tweetContent.includes("@giverep")) {
                    return false;
                  }

                  // Check if the tweet contains the keyword
                  if (tweetContent.includes(keywordSearch)) {
                    tweetsProcessed++;

                    // Get the tweet date
                    const tweetDate = new Date(userTweet.date_posted);

                    // Check if user exists in reputation system
                    let repUser = await readDb.query.repUsers.findFirst({
                      where: eq(repUsers.twitterHandle, userHandle),
                    });

                    // If user doesn't exist in rep system yet, create them
                    if (!repUser) {
                      // Attempt to get the Twitter ID from verified user data
                      const twitterId = verifiedUser.twitter_id
                        ? BigInt(verifiedUser.twitter_id)
                        : null;

                      await db.insert(repUsers).values({
                        twitterHandle: userHandle,
                        profileUrl:
                          verifiedUser.profile_url ||
                          `https://twitter.com/${userHandle}`,
                        followerCount: verifiedUser.follower_count || 0,
                        twitterId: twitterId, // Include Twitter ID when available
                        lastUpdated: new Date(),
                      });
                      newUsers++;
                      console.log(
                        `Created new reputation user from verified user: ${userHandle}`
                      );
                    }

                    // Check if the tweet should get a keyword point (includes date verification)
                    if (
                      await containsKeywordOfTheDay(
                        userTweet.content,
                        tweetDate
                      )
                    ) {
                      // Award the keyword point
                      const awarded = await awardKeywordPoint(
                        userHandle,
                        userTweet.tweet_id,
                        userTweet.content,
                        tweetDate
                      );

                      if (awarded) {
                        keywordPoints++;
                        console.log(
                          `Awarded keyword point to verified user ${userHandle} for tweet: ${userTweet.content}`
                        );
                        return true;
                      }
                    }
                  }
                  return false;
                })
              );

              return keywordResults.filter((result) => result).length;
            })
          );

          console.log(
            `Completed verified user batch ${batchIndex + 1}/${
              userBatches.length
            }`
          );
        }

        console.log(
          `Keyword scan complete. Processed ${tweetsProcessed} tweets, awarded ${keywordPoints} points`
        );
      } catch (keywordError) {
        console.error("Error in keyword search:", keywordError);
        // Continue with the rest of the function - this is an additional feature
      }
    }

    // Record the scan in the database
    // Note: ID will be auto-generated by the database
    try {
      await db.insert(repScans).values({
        status: "completed",
        startTime: new Date(),
        endTime: new Date(),
        tweetsScanned: tweetsProcessed,
        reputationAwarded: reputationAwarded + keywordPoints,
      });
    } catch (dbError) {
      console.warn("Error recording scan completion (non-fatal):", dbError);
      // Continue with function - this is just logging
    }

    return {
      scanId,
      tweetsProcessed,
      reputationAwarded: reputationAwarded + keywordPoints,
      newUsers,
    };
  } catch (error: any) {
    console.error("Error scanning reputation tweets:", error);

    // Record failed scan
    try {
      await db.insert(repScans).values({
        status: "failed",
        startTime: new Date(),
        endTime: new Date(),
        tweetsScanned: tweetsProcessed,
        reputationAwarded: reputationAwarded,
        error: error.message || "Unknown error",
      });
    } catch (dbError) {
      console.warn("Error recording scan failure (non-fatal):", dbError);
      // Continue with function - throwing the original error is more important
    }

    throw new Error("Error scanning reputation tweets: " + error.message);
  }
}

/**
 * Scan tweets for reputation awards using TwitterAPI.io with Apify fallback
 */
export async function scanReputationTweets(
  startTime: Date,
  endTime: Date
): Promise<RepScanResults> {
  // Define the cutoff date - March 24, 2025 (starting fresh);
  console.log(
    `Starting reputation scan with TwitterAPI.io/Apify - NOTICE: Only processing tweets from ${startTime.toISOString()} to ${endTime.toISOString()}`
  );

  // Create tracking record for this scan
  const scanId = Math.floor(Math.random() * 10000);
  let tweetsProcessed = 0;
  let reputationAwarded = 0;
  let newUsers = 0;
  let keywordPoints = 0;

  try {
    // Check for Twitter API IO key
    console.log("Checking for Twitter API keys...");
    if (!process.env.TWITTER_API_IO_KEY) {
      console.log("TWITTER_API_IO_KEY not found, will use Apify fallback");
    } else {
      console.log("TWITTER_API_IO_KEY is available");
    }

    // Get current keyword to scan for
    const currentKeyword = await getCurrentKeyword();
    let keywordSearch = null;

    if (currentKeyword) {
      console.log(
        `Found active keyword of the day: "${currentKeyword.keyword}"`
      );
      keywordSearch = currentKeyword.keyword.toLowerCase();
    }

    console.log("Searching for tweets mentioning @giverep...");

    // Use our Twitter service's mentions API which handles fallback automatically
    // This is more accurate than just fetching tweets since it specifically gets mentions
    const tweets = await TwitterService.fetchUserMentions(
      "giverep", // User to find mentions for
      startTime, // Start date
      endTime, // End date
      1000_000_000 // Get up to 1000000000 mentions
    );

    console.log(`Retrieved ${tweets.length} tweets mentioning @giverep`);

    // Process tweets in parallel using Promise.all with batching
    tweetsProcessed = tweets.length;
    console.log(
      `Processing ${tweetsProcessed} tweets in parallel with batch size of 1000...`
    );

    const batches = [];

    for (let i = 0; i < tweets.length; i += dbOperationBatchSize) {
      batches.push(tweets.slice(i, i + dbOperationBatchSize));
    }

    // Process each batch sequentially, but tweets within batch in parallel
    let totalAwarded = 0;

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      console.log(
        `Processing batch ${batchIndex + 1}/${batches.length} (${
          batch.length
        } tweets)`
      );

      const batchResults = await Promise.all(
        batch.map(async (tweet, index) => {
          const actualIndex = batchIndex * dbOperationBatchSize + index;
          console.log(`Processing tweet ${actualIndex + 1}`);
          const tweetData = tweet as unknown as ApiRepTweet;

          // Process this tweet for reputation
          const awarded = await processReputationTweet(tweetData);
          return awarded;
        })
      );

      // Count awarded tweets in this batch
      const batchAwarded = batchResults.filter((awarded) => awarded).length;
      totalAwarded += batchAwarded;
      console.log(
        `Batch ${batchIndex + 1} complete: ${batchAwarded} reputation awarded`
      );
    }

    reputationAwarded = totalAwarded;
    console.log(
      `Total: Awarded reputation to ${reputationAwarded} tweets out of ${tweetsProcessed}`
    );

    // If we have an active keyword, search for it in existing tweets from verified users
    if (keywordSearch) {
      console.log(
        `Starting scan for keyword "${keywordSearch}" in existing verified user tweets`
      );

      try {
        // Get all verified GiveRep users
        const verifiedUsers = await readDb.query.giverepUsers.findMany({
          where: eq(giverepUsers.is_verified, true),
        });

        console.log(
          `Found ${verifiedUsers.length} verified users to check for keyword usage`
        );

        // For each verified user, check their tweets for the keyword
        // Process verified users in batches of 1000
        let userBatches = [];

        for (let i = 0; i < verifiedUsers.length; i += dbOperationBatchSize) {
          userBatches.push(verifiedUsers.slice(i, i + dbOperationBatchSize));
        }

        for (
          let batchIndex = 0;
          batchIndex < userBatches.length;
          batchIndex++
        ) {
          const userBatch = userBatches[batchIndex];
          console.log(
            `Processing verified user batch ${batchIndex + 1}/${
              userBatches.length
            } (${userBatch.length} users)`
          );

          // Process all users in the batch in parallel
          await Promise.all(
            userBatch.map(async (verifiedUser) => {
              const userHandle = verifiedUser.twitter_handle.toLowerCase();

              // We need to join with the users table since giverepTweets doesn't have user_handle directly
              const userTweets = await readDb
                .select({
                  tweet_id: giverepTweets.tweet_id,
                  content: giverepTweets.content,
                  date_posted: giverepTweets.date_posted,
                  user_handle: giverepUsers.twitter_handle,
                })
                .from(giverepTweets)
                .innerJoin(
                  giverepUsers,
                  eq(giverepTweets.user_id, giverepUsers.id)
                )
                .where(
                  sql`LOWER(${giverepUsers.twitter_handle}) = ${userHandle}`
                );

              console.log(
                `Checking ${userTweets.length} tweets from verified user ${userHandle} for keyword "${keywordSearch}"`
              );

              // Check each tweet for the keyword
              for (const userTweet of userTweets) {
                const tweetContent = userTweet.content.toLowerCase();

                // Skip tweets that also mention @giverep since those are handled above with regular reputation
                if (tweetContent.includes("@giverep")) {
                  continue;
                }

                // Check if the tweet contains the keyword
                if (tweetContent.includes(keywordSearch)) {
                  tweetsProcessed++;

                  // Get the tweet date
                  const tweetDate = new Date(userTweet.date_posted);

                  // Check if user exists in reputation system
                  let repUser = await readDb.query.repUsers.findFirst({
                    where: eq(repUsers.twitterHandle, userHandle),
                  });

                  // If user doesn't exist in rep system yet, create them
                  if (!repUser) {
                    await db.insert(repUsers).values({
                      twitterHandle: userHandle,
                      profileUrl:
                        verifiedUser.profile_url ||
                        `https://twitter.com/${userHandle}`,
                      followerCount: verifiedUser.follower_count || 0,
                      lastUpdated: new Date(),
                    });
                    newUsers++;
                    console.log(
                      `Created new reputation user from verified user: ${userHandle}`
                    );
                  }

                  // Check if the tweet should get a keyword point (includes date verification)
                  if (
                    await containsKeywordOfTheDay(userTweet.content, tweetDate)
                  ) {
                    // Award the keyword point
                    const awarded = await awardKeywordPoint(
                      userHandle,
                      userTweet.tweet_id,
                      userTweet.content,
                      tweetDate
                    );

                    if (awarded) {
                      keywordPoints++;
                      console.log(
                        `Awarded keyword point to verified user ${userHandle} for tweet: ${userTweet.content}`
                      );
                    }
                  }
                }
              }
            })
          );

          console.log(
            `Completed verified user batch ${batchIndex + 1}/${
              userBatches.length
            }`
          );
        }

        console.log(
          `Keyword scan complete. Processed ${tweetsProcessed} tweets, awarded ${keywordPoints} points`
        );
      } catch (keywordError) {
        console.error("Error in keyword search:", keywordError);
        // Continue with the rest of the function - this is an additional feature
      }
    }

    // Record the scan in the database
    // Note: ID will be auto-generated by the database
    try {
      await db.insert(repScans).values({
        status: "completed",
        startTime: new Date(),
        endTime: new Date(),
        tweetsScanned: tweetsProcessed,
        reputationAwarded: reputationAwarded + keywordPoints,
      });
    } catch (dbError) {
      console.warn("Error recording scan completion (non-fatal):", dbError);
      // Continue with function - this is just logging
    }

    return {
      scanId,
      tweetsProcessed,
      reputationAwarded: reputationAwarded + keywordPoints,
      newUsers,
    };
  } catch (error: any) {
    console.error("Error scanning reputation tweets:", error);

    // Record failed scan
    try {
      await db.insert(repScans).values({
        status: "failed",
        startTime: new Date(),
        endTime: new Date(),
        tweetsScanned: tweetsProcessed,
        reputationAwarded: reputationAwarded,
        error: error.message || "Unknown error",
      });
    } catch (dbError) {
      console.warn("Error recording scan failure (non-fatal):", dbError);
      // Continue with function - throwing the original error is more important
    }

    throw new Error("Error scanning reputation tweets: " + error.message);
  }
}

/**
 * Get the current keyword of the day
 * @returns Object containing the keyword information or null if none is active
 */
export async function getCurrentKeyword(): Promise<any> {
  try {
    // Get the current active keyword using direct SQL query
    const query = `
      SELECT * FROM rep_keywords
      WHERE is_active = true
      ORDER BY active_date DESC
      LIMIT 1
    `;

    const { rows } = await readPool.query(query);

    if (rows.length === 0) {
      return null;
    }

    return rows[0];
  } catch (error) {
    console.error("Error getting current keyword:", error);
    return null;
  }
}

/**
 * Check if a tweet contains the keyword of the day
 * @param tweetText The text of the tweet to check
 * @returns Boolean indicating if the tweet contains the keyword
 */
/**
 * Check if a tweet contains the keyword of the day and was created after the keyword was active
 * @param tweetText The text of the tweet to check
 * @param tweetDate The date when the tweet was created
 * @returns Boolean indicating if the tweet should get a keyword point
 */
async function containsKeywordOfTheDay(
  tweetText: string,
  tweetDate: Date
): Promise<boolean> {
  const keyword = await getCurrentKeyword();

  if (!keyword) {
    return false;
  }

  // Ensure the tweet was created AFTER the keyword became active
  const keywordActiveDate = new Date(keyword.active_date);
  if (tweetDate < keywordActiveDate) {
    console.log(
      `Tweet from ${tweetDate.toISOString()} was created before the current keyword was active (${keywordActiveDate.toISOString()}), skipping`
    );
    return false;
  }

  // Case-insensitive check
  return tweetText.toLowerCase().includes(keyword.keyword.toLowerCase());
}

/**
 * Award bonus point for using keyword of the day
 * @param handle Twitter handle to award the point to
 * @param tweetId ID of the tweet that contains the keyword
 * @param tweetContent Content of the tweet
 * @param createdAt Date the tweet was created
 */
async function awardKeywordPoint(
  handle: string,
  tweetId: string,
  tweetContent: string,
  createdAt: Date
): Promise<boolean> {
  try {
    const keyword = await getCurrentKeyword();

    if (!keyword) {
      return false;
    }

    // Ensure tweet was created AFTER the keyword was set active
    const keywordActiveDate = new Date(keyword.active_date);
    if (createdAt < keywordActiveDate) {
      console.log(
        `Tweet ${tweetId} from ${createdAt.toISOString()} was created before the current keyword was active (${keywordActiveDate.toISOString()}), skipping`
      );
      return false;
    }

    // Check if the tweet has enough views (at least 1000) (using read replica for better performance)
    const tweetData = await readDb.query.giverepTweets.findFirst({
      where: eq(giverepTweets.tweet_id, tweetId),
    });

    if (!tweetData || tweetData.views < 1000) {
      console.log(
        `Tweet ${tweetId} has insufficient views (${
          tweetData?.views || 0
        }), need at least 1000 views to earn keyword points`
      );
      return false;
    }

    // Check if we've already awarded a point for this tweet (using read replica for better performance)
    const existingPoint = await readDb.query.repPoints.findFirst({
      where: eq(repPoints.tweetId, tweetId + "_keyword"),
    });

    if (existingPoint) {
      console.log(`Already awarded keyword point for tweet ${tweetId}`);
      return false;
    }

    // Check if the user has already earned a point for this keyword today
    const tweetDate = new Date(createdAt);
    const dayStart = startOfDay(tweetDate);
    const dayEnd = endOfDay(tweetDate);

    // Search for any points awarded for this keyword to this user today (using read replica for better performance)
    const todaysKeywordPoints = await readDb
      .select()
      .from(repPoints)
      .where(
        and(
          eq(sql`LOWER(${repPoints.toHandle})`, handle.toLowerCase()),
          eq(repPoints.fromHandle, "giverep"),
          like(
            repPoints.tweetContent,
            `Bonus point for using keyword: ${keyword.keyword}%`
          ),
          gte(repPoints.createdAt, dayStart),
          lt(repPoints.createdAt, dayEnd)
        )
      );

    if (todaysKeywordPoints.length > 0) {
      console.log(
        `User ${handle} already earned their keyword point for "${keyword.keyword}" today`
      );
      return false;
    }

    // Award points for using the keyword based on the configured value
    const pointsToAward = keyword.points_awarded || 1; // Default to 1 if not set

    // Get user's Twitter ID if available
    const user = await readDb.query.repUsers.findFirst({
      where: eq(repUsers.twitterHandle, handle),
    });

    // Construct tweet URL
    const tweetUrl = `https://twitter.com/${handle}/status/${tweetId}`;

    // Insert the reputation points record
    await db
      .insert(repPoints)
      .values({
        fromHandle: "giverep", // System-awarded point
        toHandle: handle,
        tweetId: tweetId + "_keyword", // Modified ID to ensure uniqueness
        tweetUrl: tweetUrl,
        tweetContent: `Bonus point for using keyword: ${keyword.keyword}`,
        createdAt: createdAt,
        points: pointsToAward,
        fromId: null, // System-awarded, no from_id
        toId: user?.twitterId || null,
        fromLoyaltyProgramId: null, // System-awarded points are not from loyalty programs
      })
      .onConflictDoNothing({
        target: [repPoints.fromHandle, repPoints.toHandle, repPoints.tweetId],
      });

    // Update the user's total reputation in rep_users
    await updateUserTotalReputation(handle, pointsToAward);

    // Update period points (keyword bonuses are from 'giverep' system, not an influencer)
    await updateUserPeriodPoints(
      handle,
      pointsToAward,
      "giverep",
      false,
      createdAt
    );

    console.log(
      `Awarded ${pointsToAward} keyword bonus points to ${handle} for using "${keyword.keyword}"`
    );
    return true;
  } catch (error) {
    console.error("Error awarding keyword point:", error);
    return false;
  }
}

/**
 * Process a tweet containing @giverep mention to award reputation
 * Only high-value influencers are allowed to award reputation through mentions
 * @param tweet Tweet data from Apify
 * @returns Boolean indicating if reputation was successfully awarded
 */
async function processReputationTweet(
  tweet: ApiRepTweet,
  isManual: boolean = false
): Promise<boolean> {
  // Define tweetDate and authorHandle outside try block so they're accessible in catch block
  const tweetDate = new Date(tweet.createdAt);
  const authorHandle = tweet.author.userName.toLowerCase();

  try {
    const tweetText = tweet.text.toLowerCase();
    const cutoffDate = new Date("2025-03-24T00:00:00Z"); // March 24, 2025 (today)

    // Skip if tweet is older than the cutoff date
    if (tweetDate < cutoffDate) {
      console.log(
        `Tweet ${
          tweet.id
        } is from ${tweetDate.toISOString()}, before cutoff date ${cutoffDate.toISOString()}, skipping`
      );
      return false;
    }

    // Skip retweets - we only want direct mentions, replies, or quote tweets
    if (tweet.isRetweet) {
      console.log(`Tweet ${tweet.id} is a retweet, skipping`);
      return false;
    }

    // IMPROVED LOGIC: Use Twitter's algorithm to distinguish between automatic reply-prefix mentions
    // and mentions explicitly typed by the user in the body of the tweet

    // Check if this is a valid GiveRep tweet using our new Twitter-style mention processor
    // This ensures we only count @giverep mentions that were explicitly typed by the user,
    // not ones automatically carried over from replies
    const isValid = isValidGiveRepTweet(tweet);

    if (!isValid) {
      console.log(
        `Tweet ${tweet.id} doesn't contain explicitly typed @giverep mention in the body, skipping`
      );
      return false;
    }

    // Get explicit body mentions (not reply prefix)
    const explicitMentions = getExplicitBodyMentions(tweet);

    // Log details about what mentions were found
    console.log(
      `Tweet ${tweet.id} explicit body mentions: ${explicitMentions.join(", ")}`
    );

    // Extract non-mention text content (for logging purposes)
    const textContent = tweetText.replace(/@\w+/g, "").trim();

    // Log acceptance
    console.log(
      `Tweet ${tweet.id} contains valid explicitly typed @giverep mention - accepting`
    );

    // Tweet author info is already extracted at the beginning of the function

    // Check if this user is verified in our system (using read replica for better performance)
    let authorUser = await readDb.query.repUsers.findFirst({
      where: eq(repUsers.twitterHandle, authorHandle),
    });

    if (!authorUser) {
      // Check if author exists in giverep_users table (using read replica for better performance)
      const giverepUser = await readDb.query.giverepUsers.findFirst({
        where: eq(giverepUsers.twitter_handle, authorHandle),
      });

      // Allow any user to give reputation points, regardless of verification status
      // Create user in rep system if they don't exist, now including Twitter ID when available
      await db.insert(repUsers).values({
        twitterHandle: authorHandle,
        profileUrl: `https://twitter.com/${authorHandle}`,
        followerCount: tweet.author.followers || 0,
        twitterId: tweet.author.id ? BigInt(tweet.author.id) : null, // Store the Twitter ID when available
        lastUpdated: new Date(),
      });

      console.log(`Created new reputation user: ${authorHandle}`);

      // Re-fetch to get the created user
      authorUser = await db.query.repUsers.findFirst({
        where: eq(repUsers.twitterHandle, authorHandle),
      });
    } else {
      console.log(`Processing reputation from user ${authorHandle}`);
    }

    // Check and atomically update daily quota for this user
    // Use the tweet's date to check quota, not today's date
    const quotaUsed = await tryUseQuota(authorHandle, tweetDate);

    if (!quotaUsed) {
      console.log(
        `User ${authorHandle} has no remaining reputation points for ${
          tweetDate.toISOString().split("T")[0]
        }`
      );
      return false;
    }

    // Parse tweet to find who they're giving reputation to
    // We already have tweetText from earlier, no need to redefine

    // Find recipient in tweet using our advanced mention detection

    // First, try to find recipients in the body mentions
    let validMentions = explicitMentions
      .map((m: string) => m.substring(1).toLowerCase()) // Remove @ prefix
      .filter((m: string) => m !== "giverep"); // Filter out @giverep

    // If no body mentions found (except @giverep), check if this is a reply or quote tweet
    if (validMentions.length === 0) {
      // Check if this is a quote tweet first
      if (tweet.isQuote && tweet.quotedUser?.userName) {
        // For quote tweets, the recipient is the quoted tweet's author
        validMentions = [tweet.quotedUser.userName.toLowerCase()];
        console.log(
          `Quote tweet ${tweet.id}: awarding reputation to quoted author ${validMentions[0]}`
        );
      } else {
        // Get all mentions to find the reply target
        const allMentions = getAllMentions(tweet);
        const allValidMentions = allMentions
          .map((m: string) => m.substring(1).toLowerCase()) // Remove @ prefix
          .filter((m: string) => m !== "giverep");

        // For replies, if @giverep is explicitly in the body,
        // we can use the first mention (usually the reply target) as recipient
        if (allValidMentions.length > 0 && tweet.text.startsWith("@")) {
          // This is likely a reply - use the first mention as recipient
          validMentions = [allValidMentions[0]];
          console.log(
            `Reply tweet ${tweet.id}: using reply target ${validMentions[0]} as recipient`
          );
        } else {
          console.log(`No valid recipients found for tweet ${tweet.id}`);
          return false;
        }
      }
    }

    // Use the first mention as the recipient
    const recipientHandle = validMentions[0];

    // Don't allow self-awarding
    if (recipientHandle === authorHandle) {
      console.log(`User ${authorHandle} tried to award themselves reputation`);
      return false;
    }

    // Get or create recipient user (using read replica for better performance)
    let recipientUser = await readDb.query.repUsers.findFirst({
      where: eq(repUsers.twitterHandle, recipientHandle),
    });

    if (!recipientUser) {
      // Create the recipient user
      await db.insert(repUsers).values({
        twitterHandle: recipientHandle,
        profileUrl: `https://twitter.com/${recipientHandle}`,
        followerCount: 0, // We don't know the follower count
        lastUpdated: new Date(),
      });

      console.log(`Created new recipient user: ${recipientHandle}`);

      // Re-fetch to get the created user
      recipientUser = await db.query.repUsers.findFirst({
        where: eq(repUsers.twitterHandle, recipientHandle),
      });
    }

    // Get multiplier from rep_users table
    const authorUserData = await readDb.query.repUsers.findFirst({
      where: sql`LOWER(${
        repUsers.twitterHandle
      }) = ${authorHandle.toLowerCase()}`,
    });

    const multiplier = authorUserData?.multiplier || 1;
    const pointsToAward = 1 * multiplier;
    const isInfluencerBonus = multiplier > 1;

    // Get the active loyalty program ID if the author is one
    const fromLoyaltyProgramId = await getActiveLoyaltyProgramId(
      authorUserData
    );

    console.log(
      `Awarding ${pointsToAward} reputation points (${multiplier}x multiplier) from ${authorHandle} to ${recipientHandle}`
    );
    if (isInfluencerBonus) {
      console.log(
        `This is an influencer bonus from ${authorHandle} with multiplier ${multiplier}`
      );
    }
    if (fromLoyaltyProgramId) {
      console.log(
        `Points given by active loyalty program (ID: ${fromLoyaltyProgramId})`
      );
    }

    // Award reputation points (both to recipient and giver)
    // Create promises for all independent database operations
    const promises = [];

    // Construct tweet URL
    const tweetUrl = `https://twitter.com/${authorHandle}/status/${tweet.id}`;

    // 1. Insert the main reputation point - recipient gets points for being recognized (with multiplier)
    // Use onConflictDoNothing to handle race conditions
    const insertRecipientPointPromise = db
      .insert(repPoints)
      .values({
        fromHandle: authorHandle,
        toHandle: recipientHandle,
        tweetId: tweet.id,
        tweetUrl: tweetUrl,
        tweetContent: tweet.text,
        createdAt: new Date(tweet.createdAt),
        points: pointsToAward, // Apply the multiplier
        influencerBonus: isInfluencerBonus,
        fromId: authorUser?.twitterId || null,
        toId: recipientUser?.twitterId || null,
        isManual: isManual,
        fromLoyaltyProgramId: fromLoyaltyProgramId,
      })
      .onConflictDoNothing({
        target: [repPoints.fromHandle, repPoints.toHandle, repPoints.tweetId],
      });
    promises.push(insertRecipientPointPromise);

    // Update recipient's total reputation in rep_users table
    const updateRecipientReputationPromise = updateUserTotalReputation(
      recipientHandle,
      pointsToAward
    );
    promises.push(updateRecipientReputationPromise);

    // Update period points and influencer endorsements
    const updatePeriodPointsPromise = updateUserPeriodPoints(
      recipientHandle,
      pointsToAward,
      authorHandle,
      authorUserData?.isInfluencer || false,
      new Date(tweet.createdAt)
    );
    promises.push(updatePeriodPointsPromise);

    // If this is an influencer bonus, update the endorsed_by_influencers array for the recipient
    if (isInfluencerBonus) {
      try {
        // Check if the column exists and update it if it does
        const updateEndorsementPromise = pool.query(
          `
          UPDATE rep_users
          SET endorsed_by_influencers = 
            CASE 
              WHEN endorsed_by_influencers IS NULL THEN ARRAY[$1]::TEXT[]
              WHEN NOT ($1 = ANY(endorsed_by_influencers)) THEN endorsed_by_influencers || $1::TEXT
              ELSE endorsed_by_influencers
            END
          WHERE LOWER(twitter_handle) = LOWER($2)
        `,
          [authorHandle, recipientHandle]
        );
        promises.push(updateEndorsementPromise);
        console.log(
          `Updated endorsed_by_influencers array for ${recipientHandle} to include ${authorHandle}`
        );
      } catch (error) {
        console.error(
          `Error updating endorsed_by_influencers array: ${
            (error as Error).message
          }`
        );
      }
    }

    // 2. Insert a separate record for the giver (different tweetId to avoid conflict)
    // Note: Self-points for being a giver are always exactly 1 (never multiplied)
    // Use onConflictDoNothing to handle race conditions
    const insertGiverPointPromise = db
      .insert(repPoints)
      .values({
        fromHandle: authorHandle,
        toHandle: authorHandle, // Self-point for being a giver
        tweetId: tweet.id + "_giver", // Modified ID to ensure uniqueness
        tweetUrl: tweetUrl,
        tweetContent: tweet.text,
        createdAt: new Date(tweet.createdAt),
        points: 1, // Giver always gets exactly 1 point regardless of multiplier
        fromId: authorUser?.twitterId || null,
        toId: authorUser?.twitterId || null, // Same ID since it's self-awarding
        influencerBonus: false, // Self-points are never influencer bonuses
        isManual: isManual,
        fromLoyaltyProgramId: null, // Self-points are not from loyalty program
      })
      .onConflictDoNothing({
        target: [repPoints.fromHandle, repPoints.toHandle, repPoints.tweetId],
      });
    promises.push(insertGiverPointPromise);

    // Update giver's total reputation in rep_users table
    const updateGiverReputationPromise = updateUserTotalReputation(
      authorHandle,
      1
    );
    promises.push(updateGiverReputationPromise);

    // Update giver's period points (givers give to themselves, so they're not receiving from an influencer)
    const updateGiverPeriodPointsPromise = updateUserPeriodPoints(
      authorHandle,
      1,
      authorHandle, // from themselves
      false, // not from an influencer
      new Date(tweet.createdAt)
    );
    promises.push(updateGiverPeriodPointsPromise);

    // 3. Quota already updated atomically in tryUseQuota, no need to update again

    // 4. Check if the tweet contains the keyword of the day and award bonus point
    // Only check for keyword if the tweet contains the keyword and passes the date check
    const keywordPromise = (async () => {
      if (await containsKeywordOfTheDay(tweet.text, tweetDate)) {
        await awardKeywordPoint(authorHandle, tweet.id, tweet.text, tweetDate);
      }
    })();
    promises.push(keywordPromise);

    // Wait for all database operations to complete
    await Promise.all(promises);

    console.log(
      `Reputation awarded: ${authorHandle} gave to ${recipientHandle}. ${recipientHandle} now has ${await getUserPoints(
        recipientHandle
      )} total rep points. ${authorHandle} now has ${await getUserPoints(
        authorHandle
      )} total rep points.`
    );
    console.log(
      `Awarded reputation for tweet ${tweet.id} from ${authorHandle}`
    );

    return true;
  } catch (error) {
    console.error("Error processing reputation tweet:", error);

    // Try to rollback the quota usage
    try {
      const rollbackQuery = `
        UPDATE rep_quota
        SET points_used = GREATEST(points_used - 1, 0)
        WHERE LOWER(twitter_handle) = LOWER($1)
          AND date >= $2
          AND date < $3
      `;

      const dayStart = startOfDay(tweetDate);
      const dayEnd = endOfDay(tweetDate);
      await pool.query(rollbackQuery, [
        authorHandle.toLowerCase(),
        dayStart,
        dayEnd,
      ]);
      console.log(`Rolled back quota usage for ${authorHandle} due to error`);
    } catch (rollbackError) {
      console.error("Error rolling back quota:", rollbackError);
    }

    return false;
  }
}

/**
 * Get user's total reputation points
 * Now optimized to use the totalReputation field in rep_users
 */
async function getUserPoints(handle: string): Promise<number> {
  // Make sure we do a case-insensitive comparison
  const normalizedHandle = handle.toLowerCase();

  // First check if the user exists in rep_users and has a non-zero totalReputation (using read replica for better performance)
  const [user] = await readDb
    .select()
    .from(repUsers)
    .where(sql`LOWER(${repUsers.twitterHandle}) = ${normalizedHandle}`);

  // If we have a valid totalReputation value, return it
  if (user && user.totalReputation !== null && user.totalReputation > 0) {
    return user.totalReputation;
  }

  // Fall back to counting points if we don't have a valid cached value
  console.log(
    `No valid totalReputation for ${handle}, counting from rep_points...`
  );

  // Count received points (using read replica for better performance)
  const receivedResult = await readDb
    .select({
      total: sql<number>`COALESCE(SUM(${repPoints.points}), 0)`,
    })
    .from(repPoints)
    .where(sql`LOWER(${repPoints.toHandle}) = ${normalizedHandle}`);

  const totalPoints = receivedResult[0]?.total || 0;

  // If we have a user record but empty/invalid totalReputation, update it
  if (user) {
    console.log(
      `Updating ${handle}'s totalReputation in database to ${totalPoints}`
    );
    await db
      .update(repUsers)
      .set({
        totalReputation: totalPoints,
        lastUpdated: new Date(),
      })
      .where(sql`LOWER(${repUsers.twitterHandle}) = ${normalizedHandle}`);
  }

  // Return the calculated points total
  return totalPoints;
}

/**
 * Atomically try to use one quota point for a user
 * @param handle User's twitter handle
 * @param date Date to use quota for
 * @returns true if quota was successfully used, false if no quota available
 */
async function tryUseQuota(handle: string, date: Date): Promise<boolean> {
  const dayStart = startOfDay(date);
  const dayEnd = endOfDay(date);
  const normalizedHandle = handle.toLowerCase();

  // First ensure a quota record exists for this user and date
  await ensureQuotaExists(handle, date);

  // Atomically increment points_used only if under the limit
  const updateQuery = `
    UPDATE rep_quota
    SET points_used = points_used + 1
    WHERE LOWER(twitter_handle) = LOWER($1)
      AND date >= $2
      AND date < $3
      AND points_used < total_quota
    RETURNING *
  `;

  try {
    const { rows } = await pool.query(updateQuery, [
      normalizedHandle,
      dayStart,
      dayEnd,
    ]);

    if (rows.length > 0) {
      console.log(
        `Successfully used 1 quota point for ${handle} on ${
          dayStart.toISOString().split("T")[0]
        }. Now used: ${rows[0].points_used}/${rows[0].total_quota}`
      );
      return true;
    } else {
      // No rows returned means quota exceeded or no quota record
      console.log(
        `Quota exceeded or not found for ${handle} on ${
          dayStart.toISOString().split("T")[0]
        }`
      );
      return false;
    }
  } catch (error) {
    console.error("Error updating quota:", error);
    return false;
  }
}

/**
 * Ensure a quota record exists for the user and date
 * This is separate from tryUseQuota to avoid race conditions in quota creation
 */
async function ensureQuotaExists(handle: string, date: Date): Promise<void> {
  const dayStart = startOfDay(date);
  const normalizedHandle = handle.toLowerCase();

  // Check if quota already exists
  const existingQuota = await readDb.query.repQuota.findFirst({
    where: and(
      sql`LOWER(${repQuota.twitterHandle}) = ${normalizedHandle}`,
      gte(repQuota.date, dayStart),
      lt(repQuota.date, endOfDay(date))
    ),
  });

  if (existingQuota) {
    return; // Quota already exists
  }

  // Get user's configured quota from rep_users table
  const user = await readDb.query.repUsers.findFirst({
    where: sql`LOWER(${repUsers.twitterHandle}) = ${normalizedHandle}`,
  });

  const dailyPoints = user?.dailyQuota || 3;
  const pointMultiplier = user?.multiplier || 1;

  // Create new quota record
  try {
    await db.insert(repQuota).values({
      twitterHandle: handle,
      totalQuota: dailyPoints,
      pointsUsed: 0,
      multiplier: pointMultiplier,
      date: dayStart,
    });
    console.log(
      `Created new quota for ${handle} on ${
        dayStart.toISOString().split("T")[0]
      }: ${dailyPoints} points`
    );
  } catch (error: any) {
    // Ignore unique constraint violations (another process may have created it)
    if (!error.message?.includes("unique constraint")) {
      console.error("Error creating quota:", error);
    }
  }
}

/**
 * Get or create a daily reputation quota for a user
 * @param handle User's twitter handle
 * @param date Date to get/create quota for
 */
async function getOrCreateDailyQuota(
  handle: string,
  date: Date
): Promise<RepQuota> {
  const dayStart = startOfDay(date);
  const dayEnd = endOfDay(date);

  // Make case-insensitive
  const normalizedHandle = handle.toLowerCase();

  // First, check if there's a custom quota set for this user (using read replica for better performance)
  const customQuota = (await readDb.query.repQuota.findFirst({
    where: and(
      sql`LOWER(${repQuota.twitterHandle}) = ${normalizedHandle}`,
      sql`total_quota != 10` // Custom quotas have non-default values
    ),
    orderBy: [desc(repQuota.id)], // Get the most recently added custom quota
  })) as RepQuota | null;

  // Look for existing regular quota for this user and day (using read replica for better performance)
  const existingQuota = (await readDb.query.repQuota.findFirst({
    where: and(
      sql`LOWER(${repQuota.twitterHandle}) = ${normalizedHandle}`,
      gte(repQuota.date, dayStart),
      lt(repQuota.date, dayEnd)
    ),
  })) as RepQuota | null;

  if (existingQuota) {
    return existingQuota;
  }

  // Create new quota (if custom quota exists, use those values)
  const dailyPoints = customQuota ? customQuota.totalQuota : 3; // Default or custom
  // Custom quota multiplier with fallback to default (1)
  const pointMultiplier =
    customQuota && typeof customQuota.multiplier === "number"
      ? customQuota.multiplier
      : 1;

  const [newQuota] = await db
    .insert(repQuota)
    .values({
      twitterHandle: handle,
      totalQuota: dailyPoints,
      pointsUsed: 0,
      multiplier: pointMultiplier,
      date: dayStart,
    })
    .returning();

  console.log(
    `Created new quota for ${handle} with ${dailyPoints} points and ${pointMultiplier}x multiplier`
  );
  return newQuota as RepQuota;
}

/**
 * Get list of users with custom daily quotas
 */
export async function getInfluencers() {
  try {
    // Use direct SQL query to get all users with custom quotas (not default 10)
    // Include both rep_users and giverep_users tables to get profile pictures from either
    // Using read replica for better performance
    const { rows } = await readPool.query(`
      SELECT 
        rq.twitter_handle as handle,
        rq.multiplier,
        rq.total_quota as total_quota,
        COALESCE(gu.profile_picture, ru.profile_url) as profile_url,
        COALESCE(gu.follower_count, ru.follower_count) as follower_count
      FROM 
        rep_quota rq
      LEFT JOIN
        rep_users ru ON LOWER(rq.twitter_handle) = LOWER(ru.twitter_handle)
      LEFT JOIN
        giverep_users gu ON LOWER(rq.twitter_handle) = LOWER(gu.twitter_handle)
      WHERE 
        rq.total_quota != 10
      ORDER BY
        rq.total_quota DESC,
        rq.multiplier DESC
      LIMIT 100
    `);

    // Create a map to deduplicate influencers and keep only the highest multiplier
    const influencerMap = new Map();

    for (const quota of rows) {
      const handle = quota.handle?.toLowerCase();
      if (!handle) continue;

      // If this handle is already in the map, check if we should replace it
      if (influencerMap.has(handle)) {
        const existing = influencerMap.get(handle);
        if ((quota.multiplier || 1) > (existing.multiplier || 1)) {
          influencerMap.set(handle, quota);
        }
      } else {
        influencerMap.set(handle, quota);
      }
    }

    // Convert map to array
    const result = Array.from(influencerMap.values()).map((quota) => ({
      handle: quota.handle,
      multiplier: quota.multiplier || 1,
      totalQuota: quota.total_quota || 3,
      profile_url: quota.profile_url,
      follower_count: quota.follower_count
        ? parseInt(quota.follower_count)
        : null,
    }));

    console.log(`Found ${result.length} influencers with multipliers`);
    return result;
  } catch (error) {
    console.error("Error getting influencers:", error);
    return [];
  }
}

/**
 * Get overall reputation statistics
 */
export async function getReputationStats(): Promise<ReputationStats> {
  // Get total users (using read replica for better performance)
  const totalUsersResult = await readDb
    .select({
      count: count(),
    })
    .from(repUsers);

  // Get total reputation given (using read replica for better performance)
  const totalRepResult = await readDb
    .select({
      count: count(),
    })
    .from(repPoints);

  // Get top receivers (using read replica for better performance)
  const topReceivers = await readDb.query.repUsers.findMany({
    with: {
      receivedPoints: true,
    },
    orderBy: [
      desc(
        sql`(SELECT COUNT(*) FROM ${repPoints} WHERE ${repPoints.toHandle} = ${repUsers.twitterHandle})`
      ),
    ],
    limit: 5,
  });

  // Get top givers (using read replica for better performance)
  const topGivers = await readDb.query.repUsers.findMany({
    with: {
      givenPoints: true,
    },
    orderBy: [
      desc(
        sql`(SELECT COUNT(*) FROM ${repPoints} WHERE ${repPoints.fromHandle} = ${repUsers.twitterHandle})`
      ),
    ],
    limit: 5,
  });

  // Format results
  const formattedTopReceivers = await Promise.all(
    topReceivers.map(async (user) => ({
      handle: user.twitterHandle,
      reputation: user.receivedPoints.length,
      profile_url: user.profileUrl,
      follower_count: user.followerCount,
    }))
  );

  const formattedTopGivers = await Promise.all(
    topGivers.map(async (user) => ({
      handle: user.twitterHandle,
      reputation: user.givenPoints.length,
      profile_url: user.profileUrl,
      follower_count: user.followerCount,
    }))
  );

  return {
    total_users: totalUsersResult[0]?.count || 0,
    total_reputation_given: totalRepResult[0]?.count || 0,
    top_receivers: formattedTopReceivers,
    top_givers: formattedTopGivers,
  };
}

/**
 * Get a list of users with their reputation
 * @param limit Max number of users to return
 * @param offset Pagination offset
 * @returns Array of users with reputation stats
 */
export async function getReputationLeaderboard(
  limit: number = 50,
  offset: number = 0,
  includeTotal: boolean = false
): Promise<{ users: ReputationUser[]; total: number }> {
  try {
    console.log("Fetching reputation leaderboard with ultra-simplified query");
    console.time("getReputationLeaderboard:total");

    // Get total count for pagination if requested - only perform if actually needed
    let total = 0;
    if (includeTotal) {
      console.time("getReputationLeaderboard:countQuery");
      const countQuery = `SELECT COUNT(*) as total FROM rep_users WHERE COALESCE(total_reputation, 0) > 0`;
      const { rows: countRows } = await readPool.query(countQuery);
      total = parseInt(countRows[0].total);
      console.timeEnd("getReputationLeaderboard:countQuery");
      console.log(`Total reputation users for pagination: ${total}`);
    }

    // Determine if the endorsed_by_influencers column exists
    let hasEndorsementsColumn = false;
    let rows;

    // Use query that includes the endorsed_by_influencers column
    // since we confirmed it exists in the database
    console.log(
      "Running UPDATED reputation leaderboard query that includes endorsed_by_influencers"
    );

    const query = `
      SELECT 
        ru.twitter_handle as handle,
        COALESCE(ru.total_reputation, 0) as reputation,
        ru.profile_url,
        COALESCE(gu.follower_count, ru.follower_count) as follower_count,
        gu.profile_picture,
        gu.is_verified,
        gu.is_twitter_verified,
        gu.is_blue_verified,
        ru.endorsed_by_influencers,
        COALESCE(tu.trusted_follower_count, 0) as trusted_follower_count,
        ru.rank_total as position
      FROM 
        rep_users ru
      LEFT JOIN
        giverep_users gu ON LOWER(ru.twitter_handle) = LOWER(gu.twitter_handle)
      LEFT JOIN
        trust_users tu ON LOWER(ru.twitter_handle) = LOWER(tu.twitter_handle)
      WHERE
        COALESCE(ru.total_reputation, 0) > 0
        AND ru.rank_total IS NOT NULL
      ORDER BY 
        ru.rank_total ASC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    console.time("getReputationLeaderboard:mainQuery");
    const result = await readPool.query(query);
    console.timeEnd("getReputationLeaderboard:mainQuery");
    rows = result.rows;
    hasEndorsementsColumn = true;
    console.log(`Found ${rows.length} users in reputation leaderboard`);

    // Debug: Log the first few rows to see if trusted_follower_count is included
    console.log("Sample rows with trust data:");
    rows.slice(0, 3).forEach((row) => {
      console.log(
        `${row.handle}: reputation=${row.reputation}, trusted_follower_count=${row.trusted_follower_count}`
      );
    });

    console.log(`Found ${rows?.length || 0} users for reputation leaderboard`);

    // If we got no rows, return empty results
    if (!rows || rows.length === 0) {
      return { users: [], total };
    }

    // Log the first row to see the data structure
    console.log(
      "Sample row data for debugging:",
      JSON.stringify(rows[0], null, 2)
    );
    console.log("Has endorsements column:", hasEndorsementsColumn);

    // Add debug data for a few specific users we know should have endorsements
    const debugHandles = ["ikadotxyz", "suinetwork", "doubleup_app"];
    const debugRows = rows.filter((row) =>
      debugHandles.includes(row.handle.toLowerCase())
    );

    if (debugRows.length > 0) {
      console.log("Debug data for specific handles:");
      debugRows.forEach((row) => {
        console.log(
          `Handle: ${row.handle}, endorsed_by_influencers:`,
          row.endorsed_by_influencers || "null"
        );
      });
    }

    // Transform the results to match the expected return format
    console.time("getReputationLeaderboard:processingData");
    const leaderboardUsers = rows.map((row) => {
      // Process the endorsed_by_influencers array if it exists
      let endorsedByInfluencers: string[] = [];

      // *** LOG DEBUGGING FOR ALL ROWS ***
      console.log(
        `PROCESSING ROW: ${row.handle}, endorsed_by_influencers:`,
        typeof row.endorsed_by_influencers,
        row.endorsed_by_influencers
      );

      if (row.endorsed_by_influencers) {
        // Handle PostgreSQL array string format: "{value1,value2,...}"
        if (typeof row.endorsed_by_influencers === "string") {
          if (
            row.endorsed_by_influencers.startsWith("{") &&
            row.endorsed_by_influencers.endsWith("}")
          ) {
            // Parse the PostgreSQL array string format
            const arrayString = row.endorsed_by_influencers.substring(
              1,
              row.endorsed_by_influencers.length - 1
            );
            if (arrayString.length > 0) {
              // Split by comma, but handle any quotes if present
              endorsedByInfluencers = arrayString
                .split(",")
                .map((item: string) => item.trim().replace(/^"|"$/g, ""));
              console.log(
                `*** SUCCESS! Parsed array for ${row.handle}:`,
                endorsedByInfluencers
              );
            }
          }
        } else if (Array.isArray(row.endorsed_by_influencers)) {
          // If it's already an array, use it directly
          endorsedByInfluencers = row.endorsed_by_influencers;
          console.log(
            `Using array directly for ${row.handle}:`,
            endorsedByInfluencers
          );
        }
      }

      // Log info for some users
      if (debugHandles.includes(row.handle.toLowerCase())) {
        console.log(
          `Processing ${row.handle}: endorsed_by_influencers =`,
          endorsedByInfluencers
        );
      }

      // Create high_value_givers array with profile URLs
      const highValueGivers = endorsedByInfluencers.map((handle: string) => {
        // Clean up the handle and make sure it doesn't have @ prefix
        const cleanHandle = handle.trim().startsWith("@")
          ? handle.trim().substring(1)
          : handle.trim();

        // Construct the profile image URL using the unavatar.io pattern
        const profileUrl = `https://unavatar.io/twitter/${cleanHandle}`;

        return {
          handle: cleanHandle,
          profile_url: profileUrl,
        };
      });

      console.log(
        `Final high_value_givers for ${row.handle}:`,
        highValueGivers
      );

      // Create the final user object with all properties
      const userObject = {
        handle: row.handle,
        reputation: parseInt(row.reputation) || 0,
        profile_url: row.profile_picture || row.profile_url,
        follower_count:
          row.follower_count !== null ? parseInt(row.follower_count) : null,
        trusted_follower_count:
          row.trusted_follower_count !== null
            ? parseInt(row.trusted_follower_count)
            : null,
        position: parseInt(row.position) || 0,
        is_verified: row.is_verified || false,
        isTwitterVerified: row.is_twitter_verified || false,
        isBlueVerified: row.is_blue_verified || false,
        high_value_givers: highValueGivers,
      };

      // Log the high_value_givers count for debugging
      console.log(
        `${row.handle} has ${userObject.high_value_givers.length} high_value_givers in final object`
      );

      return userObject;
    });
    console.timeEnd("getReputationLeaderboard:processingData");
    console.timeEnd("getReputationLeaderboard:total");

    return { users: leaderboardUsers, total };
  } catch (error) {
    console.error("Database query error:", error);
    console.timeEnd("getReputationLeaderboard:total");
    // Return empty results on error
    return { users: [], total: 0 };
  }
}

/**
 * Get user information with reputation count but without history
 * @param handle Twitter handle to get information for
 * @returns Basic reputation data for the user without history
 */
export async function getUserReputationInfo(
  handle: string,
  timeRange: string = "all_time"
) {
  console.log(`Looking up user with ID or handle: "${handle}"`);

  // Normalize the handle by removing the @ symbol if present and converting to lowercase
  const normalizedHandle = (
    handle.startsWith("@") ? handle.substring(1) : handle
  ).toLowerCase();

  console.log(`Looking up user by handle: "${normalizedHandle}"`);

  let userData = null;
  let userRank = null;

  try {
    // Determine which rank column to use based on time range
    let rankColumn = "rank_total";
    let reputationColumn = "total_reputation";

    // For now, we only use pre-calculated total_reputation
    // Time-range specific reputation would require additional columns

    // Fast query using pre-calculated columns
    const optimizedQuery = `
      SELECT
        ru.twitter_handle,
        ru.id,
        ru.profile_url,
        ru.profile_image_url,
        ru.follower_count as rep_follower_count,
        gu.follower_count as giverep_follower_count,
        gu.profile_picture,
        gu.is_verified,
        gu.is_twitter_verified,
        gu.is_blue_verified,
        COALESCE(ru.${reputationColumn}, 0) as reputation,
        ru.endorsed_by_influencers,
        ru.${rankColumn} as position
      FROM 
        rep_users ru
      LEFT JOIN
        giverep_users gu ON LOWER(ru.twitter_handle) = LOWER(gu.twitter_handle)
      WHERE
        LOWER(ru.twitter_handle) = LOWER($1)
    `;

    // Execute the optimized query
    let result;
    try {
      // Try read replica first for better performance
      result = await readPool.query(optimizedQuery, [normalizedHandle]);
    } catch (error: any) {
      // Handle read replica conflict by falling back to primary
      if (
        error?.code === "40001" &&
        error?.message?.includes("conflict with recovery")
      ) {
        console.warn(
          "Read replica conflict for user query, falling back to primary database"
        );
        const { pool } = await import("../../db");
        result = await pool.query(optimizedQuery, [normalizedHandle]);
      } else {
        throw error;
      }
    }

    if (result.rows.length > 0) {
      userData = result.rows[0];
      userRank = userData.position;
      console.log(
        `Found user ${normalizedHandle} with reputation: ${userData.reputation}, rank: ${userRank}`
      );
    } else {
      // User not found in rep_users, try giverep_users
      console.log(
        `User ${normalizedHandle} not found in rep_users, checking giverep_users`
      );

      const fallbackQuery = `
        SELECT 
          twitter_handle,
          null as id,
          null as profile_url,
          null as profile_image_url,
          follower_count as giverep_follower_count,
          null as rep_follower_count,
          profile_picture,
          is_verified,
          is_twitter_verified,
          is_blue_verified,
          0 as reputation,
          null as endorsed_by_influencers,
          null as position
        FROM 
          giverep_users
        WHERE 
          LOWER(twitter_handle) = LOWER($1)
      `;

      let fallbackResult;
      try {
        fallbackResult = await readPool.query(fallbackQuery, [
          normalizedHandle,
        ]);
      } catch (error: any) {
        // Handle read replica conflict by falling back to primary
        if (
          error?.code === "40001" &&
          error?.message?.includes("conflict with recovery")
        ) {
          console.warn(
            "Read replica conflict for fallback query, using primary database"
          );
          const { pool } = await import("../../db");
          fallbackResult = await pool.query(fallbackQuery, [normalizedHandle]);
        } else {
          throw error;
        }
      }

      if (fallbackResult.rows.length > 0) {
        userData = fallbackResult.rows[0];
        userData.position = null; // No rank for users not in rep_users
        console.log(`Found user ${normalizedHandle} in giverep_users only`);
      }
    }
  } catch (error) {
    console.error(
      `Database error while fetching user info for ${normalizedHandle}:`,
      error
    );
    // Continue with null userData
  }

  // If still no user found, return minimal data
  if (!userData) {
    console.log(`User ${normalizedHandle} not found in any table`);
    return {
      handle: normalizedHandle,
      profile_url: null,
      profile_picture: null,
      follower_count: null,
      reputation: 0,
      position: null,
      is_verified: false,
      isTwitterVerified: false,
      isBlueVerified: false,
    };
  }

  // Determine follower count (prefer rep_users data if available)
  const followerCount =
    userData.rep_follower_count || userData.giverep_follower_count;

  // Log the final data
  console.log(`Returning user data for ${normalizedHandle}:`, {
    reputation: userData.reputation,
    position: userData.position,
    follower_count: followerCount,
    is_verified: userData.is_verified,
  });

  return {
    handle: userData.twitter_handle,
    profile_url: `https://twitter.com/${userData.twitter_handle}`,
    profile_picture:
      userData.profile_picture ||
      userData.profile_image_url ||
      userData.profile_url,
    follower_count: followerCount,
    reputation: parseInt(userData.reputation) || 0,
    position: userData.position,
    is_verified: userData.is_verified || false,
    isTwitterVerified: userData.is_twitter_verified || false,
    isBlueVerified: userData.is_blue_verified || false,
  };
}

/**
 * Get reputation history for a specific user with pagination
 * @param handle Twitter handle to get history for
 * @param limit Number of records to return
 * @param offset Offset for pagination
 * @returns Paginated history data for the user
 */
interface HistoryFilters {
  startDate?: Date;
  endDate?: Date;
  handleFilter?: string;
  direction?: "from" | "to" | "influencers";
}

export async function getUserReputationHistory(
  handle: string,
  limit: number = 10,
  offset: number = 0,
  filters: HistoryFilters = {}
) {
  console.log(
    `Looking up reputation history for handle: "${handle}" with limit=${limit}, offset=${offset}`
  );

  // Normalize the handle by removing the @ symbol if present and converting to lowercase
  const normalizedHandle = (
    handle.startsWith("@") ? handle.substring(1) : handle
  ).toLowerCase();

  // Helper function to clean tweet IDs by removing the "_giver" suffix
  const cleanTweetId = (tweetId: string) => tweetId.replace("_giver", "");

  try {
    // Get influencers list for marking influencer tweets
    const influencers = await getInfluencers();

    // Create influencer map
    const influencerMap = new Map();
    influencers.forEach((influencer) => {
      if (influencer.multiplier > 1) {
        const cleanHandle = influencer.handle.trim().startsWith("@")
          ? influencer.handle.trim().substring(1)
          : influencer.handle.trim();

        influencerMap.set(cleanHandle.toLowerCase(), {
          handle: cleanHandle,
          multiplier: influencer.multiplier,
          profile_url:
            influencer.profile_url ||
            `https://unavatar.io/twitter/${cleanHandle}`,
          follower_count: influencer.follower_count,
        });
      }
    });
    // Build filter conditions
    const buildFilterConditions = (
      baseCondition: string,
      isReceived: boolean,
      startParamIndex: number = 2
    ) => {
      let conditions = [baseCondition];
      const params: any[] = [];
      let paramCount = startParamIndex;

      if (filters.startDate) {
        conditions.push(`created_at >= $${paramCount}`);
        params.push(filters.startDate);
        paramCount++;
      }

      if (filters.endDate) {
        conditions.push(`created_at <= $${paramCount}`);
        params.push(filters.endDate);
        paramCount++;
      }

      if (filters.handleFilter) {
        const handleCondition = isReceived
          ? `LOWER(from_handle) LIKE LOWER($${paramCount})`
          : `LOWER(to_handle) LIKE LOWER($${paramCount})`;
        conditions.push(handleCondition);
        params.push(`%${filters.handleFilter}%`);
        paramCount++;
      }

      if (filters.direction === "from" && isReceived) {
        // If filtering for 'from' (given), exclude received
        conditions.push("FALSE");
      } else if (filters.direction === "to" && !isReceived) {
        // If filtering for 'to' (received), exclude given
        conditions.push("FALSE");
      } else if (filters.direction === "influencers") {
        // For influencers filter, we need to join with rep_users and check multiplier
        if (isReceived) {
          conditions.push(`EXISTS (
                SELECT 1 FROM rep_users ru 
                WHERE LOWER(ru.twitter_handle) = LOWER(from_handle) 
                AND ru.multiplier > 1
              )`);
        } else {
          // Exclude given points when filtering for influencers
          conditions.push("FALSE");
        }
      }

      return {
        whereClause: conditions.join(" AND "),
        params,
        nextParamIndex: paramCount,
      };
    };

    // Build conditions for received points
    const receivedBase = `LOWER(to_handle) = LOWER($1) AND NOT (LOWER(from_handle) = LOWER(to_handle) AND tweet_id LIKE '%_giver')`;
    const receivedFilters = buildFilterConditions(receivedBase, true, 2);

    // Build conditions for given points
    const givenBase = `LOWER(from_handle) = LOWER($1) AND LOWER(to_handle) != LOWER(from_handle)`;
    const givenFilters = buildFilterConditions(
      givenBase,
      false,
      receivedFilters.nextParamIndex
    );

    // First, get the total counts
    const countsQuery = `
          SELECT 
            (SELECT COUNT(*) FROM rep_points WHERE ${receivedFilters.whereClause}) AS received_total,
            (SELECT COUNT(*) FROM rep_points WHERE ${givenFilters.whereClause}) AS given_total
        `;

    const countsResult = await readPool.query(countsQuery, [
      normalizedHandle,
      ...receivedFilters.params,
      ...givenFilters.params,
    ]);
    const counts = countsResult.rows[0] || {
      received_total: 0,
      given_total: 0,
    };

    // For the points query, we need to rebuild the filters with proper indices
    const receivedFiltersForPoints = buildFilterConditions(
      receivedBase,
      true,
      2
    );
    const givenFiltersForPoints = buildFilterConditions(
      givenBase,
      false,
      receivedFiltersForPoints.nextParamIndex
    );

    // Calculate the last parameter index for LIMIT and OFFSET
    const limitParamIndex = givenFiltersForPoints.nextParamIndex;
    const offsetParamIndex = limitParamIndex + 1;

    // Then get all relevant points and handle pagination in application logic
    const pointsQuery = `
          (
            -- Received points (excluding self-awarded with _giver suffix)
            SELECT 
              'received' AS type,
              id,
              from_handle,
              to_handle,
              points,
              created_at,
              tweet_id,
              tweet_url,
              tweet_content
            FROM 
              rep_points
            WHERE 
              ${receivedFiltersForPoints.whereClause}
          )
          UNION ALL
          (
            -- Given points (excluding self-awarded)
            SELECT 
              'given' AS type,
              id,
              from_handle,
              to_handle,
              points,
              created_at,
              tweet_id,
              tweet_url,
              tweet_content
            FROM 
              rep_points
            WHERE 
              ${givenFiltersForPoints.whereClause}
          )
          ORDER BY created_at DESC
          LIMIT $${limitParamIndex} OFFSET $${offsetParamIndex}
        `;

    const pointsResult = await readPool.query(pointsQuery, [
      normalizedHandle,
      ...receivedFiltersForPoints.params,
      ...givenFiltersForPoints.params,
      limit,
      offset,
    ]);
    const points = pointsResult.rows || [];

    // Parse counts
    const receivedTotal = parseInt(counts.received_total);
    const givenTotal = parseInt(counts.given_total);
    const totalRecords = receivedTotal + givenTotal;

    // Format history
    const history = points.map((point) => {
      const isReceived = point.type === "received";
      const fromHandleLower = point.from_handle.toLowerCase();
      const influencerInfo = influencerMap.get(fromHandleLower);
      const isFromInfluencer =
        isReceived && !!influencerInfo && influencerInfo.multiplier > 1;

      return {
        id: point.id,
        type: point.type,
        from_handle: point.from_handle,
        to_handle: point.to_handle,
        points: point.points || 1,
        timestamp: point.created_at?.toISOString() || new Date().toISOString(),
        tweet_id: point.tweet_id,
        tweet_url:
          point.tweet_url ||
          `https://twitter.com/${point.from_handle}/status/${cleanTweetId(
            point.tweet_id
          )}`,
        tweet_content: point.tweet_content,
        is_from_influencer: isFromInfluencer,
        influencer_multiplier: isFromInfluencer ? influencerInfo.multiplier : 1,
        influencer_profile_url: isFromInfluencer
          ? influencerInfo.profile_url
          : null,
      };
    });

    console.log(
      `Found ${history.length} total points (${receivedTotal} received, ${givenTotal} given) for ${normalizedHandle}`
    );

    // Return only history and pagination data
    return {
      history: history,
      pagination: {
        total: totalRecords,
        limit,
        offset,
        received_total: receivedTotal,
        given_total: givenTotal,
      },
    };
  } catch (error) {
    console.error(
      `Error getting reputation history for ${normalizedHandle}:`,
      error
    );
    return {
      history: [],
      pagination: {
        total: 0,
        limit,
        offset,
        received_total: 0,
        given_total: 0,
      },
    };
  }
}

// Get influencer reputation points for a user
export async function getInfluencerRepPoints(handle: string) {
  try {
    const normalizedHandle = handle.toLowerCase();

    // Query to get all reputation points received from influencers
    // IMPORTANT: Only include points > 0 to exclude cleaned up invalid points
    const query = `
      SELECT 
        rp.id,
        rp.from_handle,
        rp.to_handle,
        rp.points,
        rp.created_at,
        rp.tweet_id,
        rp.tweet_url,
        rp.tweet_content,
        ru.multiplier as influencer_multiplier,
        ru.follower_count,
        ru.profile_image_url
      FROM rep_points rp
      INNER JOIN rep_users ru ON LOWER(ru.twitter_handle) = LOWER(rp.from_handle)
      WHERE 
        LOWER(rp.to_handle) = LOWER($1)
        AND ru.multiplier > 1
        AND rp.points > 0
        AND NOT (LOWER(rp.from_handle) = LOWER(rp.to_handle) AND rp.tweet_id LIKE '%_giver')
      ORDER BY rp.created_at DESC
    `;

    const result = await readPool.query(query, [normalizedHandle]);
    const influencerPoints = result.rows || [];

    // Calculate total points and group by influencer
    const influencerStats = new Map<
      string,
      {
        handle: string;
        multiplier: number;
        follower_count: number | null;
        profile_image_url: string | null;
        points_given: number;
        tweet_count: number;
      }
    >();

    let totalInfluencerPoints = 0;

    influencerPoints.forEach((point) => {
      totalInfluencerPoints += point.points;

      const handle = point.from_handle.toLowerCase();
      if (!influencerStats.has(handle)) {
        influencerStats.set(handle, {
          handle: point.from_handle,
          multiplier: point.influencer_multiplier,
          follower_count: point.follower_count,
          profile_image_url: point.profile_image_url,
          points_given: 0,
          tweet_count: 0,
        });
      }

      const stats = influencerStats.get(handle)!;
      stats.points_given += point.points;
      stats.tweet_count += 1;
    });

    // Convert map to array and sort by points given
    const influencers = Array.from(influencerStats.values()).sort(
      (a, b) => b.points_given - a.points_given
    );

    return {
      count: influencerPoints.length,
      totalPoints: totalInfluencerPoints,
      influencers: influencers,
      recentTweets: influencerPoints.slice(0, 5), // Return 5 most recent influencer tweets
    };
  } catch (error) {
    console.error(`Error getting influencer rep points for ${handle}:`, error);
    throw error;
  }
}

/**
 * Get the remaining reputation quota for a user
 * @param handle Twitter handle to check
 * @returns Remaining reputation quota
 */
export async function getUserReputationQuota(handle: string): Promise<{
  remaining: number;
  daily_limit: number;
  resets_at: Date;
}> {
  console.log(`Looking up reputation quota for handle: "${handle}"`);

  // Normalize the handle by removing the @ symbol if present and converting to lowercase
  const normalizedHandle = (
    handle.startsWith("@") ? handle.substring(1) : handle
  ).toLowerCase();

  const today = new Date();
  const userQuota = await getOrCreateDailyQuota(normalizedHandle, today);

  // Calculate reset time (next day at midnight)
  const resetsAt = addDays(startOfDay(today), 1);

  return {
    remaining: (userQuota.totalQuota || 0) - (userQuota.pointsUsed || 0),
    daily_limit: userQuota.totalQuota || 0,
    resets_at: resetsAt,
  };
}

/**
 * Run the reputation scan job
 */
export async function runReputationScan(startTime: Date, endTime: Date) {
  try {
    console.log("Starting scheduled reputation scan...");
    const results = await scanReputationTweetFiles(startTime, endTime);
    console.log(
      `Scheduled reputation scan completed: ${results.tweetsProcessed} tweets processed, ${results.reputationAwarded} reputation awarded`
    );
  } catch (error) {
    console.error("Error in scheduled reputation scan:", error);
  }
}

/**
 * Get a list of tweet IDs that have already been processed
 * This is used for the tweet scanning optimization to avoid
 * re-processing tweets we've already seen
 */
export async function getProcessedTweetIds(): Promise<string[]> {
  try {
    console.log("Retrieving processed tweet IDs for duplicate detection");

    // Query the reputation points table to get all tweet IDs that have been processed (using read replica for better performance)
    const result = await readDb.query.repPoints.findMany({
      columns: {
        tweetId: true,
      },
      orderBy: desc(repPoints.createdAt),
    });

    // Extract just the tweet IDs from the result
    const tweetIds = result.map((point) => point.tweetId);
    console.log(`Found ${tweetIds.length} processed tweet IDs`);

    // Return just the array of tweet IDs
    return tweetIds;
  } catch (error) {
    console.error("Error retrieving processed tweet IDs:", error);
    return []; // Return empty array if there's an error
  }
}

/**
 * Process a single tweet for reputation points
 * This is used by the manual tweet indexing endpoint
 * @param tweet Tweet data in ApiRepTweet format
 * @returns Boolean indicating if reputation was successfully awarded
 */
export async function processSingleTweetForReputation(
  tweet: ApiRepTweet,
  isManual: boolean = false
): Promise<boolean> {
  try {
    // Use the existing processReputationTweet function
    const result = await processReputationTweet(tweet, isManual);

    // Also check if the tweet qualifies for keyword bonus points
    if (result) {
      // Check for active keywords
      const activeKeyword = await db.query.repKeywords.findFirst({
        where: eq(repKeywords.isActive, true),
      });

      if (
        activeKeyword &&
        tweet.text.toLowerCase().includes(activeKeyword.keyword.toLowerCase())
      ) {
        // Award keyword bonus if eligible
        await awardKeywordPoint(
          tweet.author.userName,
          tweet.id,
          tweet.text,
          new Date(tweet.createdAt)
        );
      }
    }

    return result;
  } catch (error) {
    console.error("Error processing single tweet for reputation:", error);
    return false;
  }
}
