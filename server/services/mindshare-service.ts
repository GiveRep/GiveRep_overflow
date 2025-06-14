import { db, readDb } from "../../db/index";
import {
  mindshareProjects,
  mindshareKeywords,
  mindshareMetrics,
  mindshareTweets,
} from "../../db/mindshare_schema";
import {
  InsertMindshareProject,
  MindshareProject,
  InsertMindshareKeyword,
  MindshareKeyword,
  InsertMindshareMetrics,
  MindshareMetrics,
  InsertMindshareTweet,
} from "../../db/mindshare_schema";
import { projectTags } from "../../db/loyalty_schema";
import { eq, and, sql, desc, gte, lte, asc, inArray } from "drizzle-orm";
import { subDays, format, addDays } from "date-fns";
import dotenv from "dotenv";
import { fetchTweetMetrics } from "../fxtwitter-service";

dotenv.config();

function log(message: string, source: string = "mindshare") {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${source}] ${message}`);
}

interface TwitterSearchResult {
  data?: {
    tweets?: TweetItem[];
    next_cursor?: string;
    has_next_page?: boolean;
  };
  result?: {
    items?: TweetItem[];
    nextCursor?: string;
  };
  tweets?: TweetItem[];
  next_cursor?: string;
  has_next_page?: boolean;
  errors?: any;
}

interface TweetItem {
  // Fields from the advanced_search endpoint
  id?: string;
  text?: string;
  createdAt?: string;
  isReply?: boolean;
  retweeted_tweet?: any;
  viewCount?: number;
  likeCount?: number;
  retweetCount?: number;
  replyCount?: number;
  // Author fields
  author?: {
    id?: string;
    name?: string;
    userName?: string;
    profilePicture?: string;
    isVerified?: boolean;
    isBlueVerified?: boolean;
  };
  // Original API fields for backward compatibility
  userId?: string;
  username?: string;
  name?: string;
  profilePictureUrl?: string;
  metrics?: {
    views?: number;
    likes?: number;
    retweets?: number;
    replies?: number;
  };
}

/**
 * Clean tweet text for storage in the database
 * Removes most URLs, tags, etc.
 */
function cleanTweetText(text: string): string {
  // Try to keep the cleaned text to a reasonable length for storage
  if (!text) return "";

  // Remove URLs
  let cleaned = text.replace(/https?:\/\/\S+/g, "");

  // Trim and limit to 1000 characters
  cleaned = cleaned.trim();
  if (cleaned.length > 1000) {
    cleaned = cleaned.substring(0, 997) + "...";
  }

  return cleaned;
}

// Extended interface for MindshareMetrics that includes runtime properties
interface ExtendedMindshareMetrics extends MindshareMetrics {
  share_percentage?: number;
  total_engagement?: number;
  total_views?: number;
  _temp_engagement?: number;
  timeframe?: "day" | "week" | "month";
}

export class MindshareService {
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.TWITTER_API_IO_KEY || "";

    if (!this.apiKey) {
      log(
        "WARNING: No Twitter API.IO key found. API calls will fail.",
        "mindshare"
      );
    }
  }

  /**
   * Fetch tweet metrics from FXTwitter API
   * This is a wrapper around the imported fetchTweetMetrics function
   * @param tweetId Twitter tweet ID
   * @returns Tweet metrics or null if not found
   */
  async fetchTweetMetrics(tweetId: string): Promise<{
    views: number;
    likes: number;
    retweets: number;
    replies: number;
  } | null> {
    return fetchTweetMetrics(tweetId);
  }

  /**
   * Search for tweets based on a keyword and date range
   * Returns tweets that are not replies and not retweets
   * Uses cursor-based pagination to fetch up to 5 pages or until no more tweets
   */
  async searchTweets(
    keyword: string,
    sinceDate: Date = subDays(new Date(), 7),
    untilDate?: Date, // Optional - if undefined, won't add until date to search
    maxTweets: number = 1000, // Increased limit from 100 to 1000
    projectId?: number // Optional project ID to check for existing tweets
  ): Promise<TweetItem[]> {
    try {
      if (!this.apiKey) {
        throw new Error("Twitter API.IO key is not configured");
      }

      const formattedSinceDate = format(sinceDate, "yyyy-MM-dd");
      const formattedUntilDate = untilDate
        ? format(untilDate, "yyyy-MM-dd")
        : null;

      log(
        `Searching for tweets containing "${keyword}" from ${formattedSinceDate}${
          formattedUntilDate ? ` until ${formattedUntilDate}` : ""
        }`,
        "twitter-api"
      );

      // Format the query to exclude replies, require minimum likes and replies, and include date range
      const dateRange = formattedUntilDate
        ? `since:${formattedSinceDate} until:${formattedUntilDate}`
        : `since:${formattedSinceDate}`;
      const queryWithCriteria = `${keyword} min_faves:5 min_replies:3 -filter:replies -filter:nativeretweets -from:${keyword} ${dateRange}`;

      // Set up pagination variables
      let cursor: string | null = null;
      let allTweets: TweetItem[] = [];
      let pageCount = 0;
      let seenTweetIds = new Set<string>(); // Track already seen tweets

      // Track consecutive existing tweets for early stopping
      let consecutiveExistingTweets = 0;
      const MAX_CONSECUTIVE_EXISTING = 3; // Stop after finding this many consecutive existing tweets

      // Fetch tweets with pagination - no page limit, we'll stop on duplicates
      let maxPaginationSafety = 50; // Safety limit to avoid infinite loops
      while (maxPaginationSafety-- > 0) {
        // Check if we've already found too many consecutive existing tweets
        if (consecutiveExistingTweets >= MAX_CONSECUTIVE_EXISTING) {
          log(
            `[OPTIMIZATION] Found ${consecutiveExistingTweets} consecutive existing tweets. Stopping Twitter API search for "${keyword}" early to save API credits.`,
            "twitter-api"
          );
          break;
        }

        pageCount++;

        // Build URL with cursor if we have one
        let url = `https://api.twitterapi.io/twitter/tweet/advanced_search?queryType=Latest&query=${encodeURIComponent(
          queryWithCriteria
        )}`;
        if (cursor) {
          url += `&cursor=${encodeURIComponent(cursor)}`;
        }

        // Log the full URL for debugging
        console.log(
          `DEBUG - Twitter API request URL (page ${pageCount}): ${url}`
        );
        log(`Using URL (page ${pageCount}): ${url}`, "twitter-api");

        const response = await fetch(url, {
          method: "GET",
          headers: {
            "x-api-key": this.apiKey,
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          throw new Error(
            `Twitter API returned ${response.status}: ${await response.text()}`
          );
        }

        const data: TwitterSearchResult = await response.json();

        if (data.errors) {
          throw new Error(`Twitter API error: ${JSON.stringify(data.errors)}`);
        }

        // Handle response format from advanced_search endpoint
        const tweets = data.tweets || [];

        // Check if we have a next cursor for pagination
        cursor = data.next_cursor || null;

        // Filter out any replies or retweets that the API query didn't catch
        const filteredTweets = tweets.filter(
          (tweet) => !tweet.isReply && !tweet.retweeted_tweet
        );

        log(
          `Found ${filteredTweets.length} tweets on page ${pageCount} for keyword "${keyword}"`,
          "twitter-api"
        );

        // First, check if these are all duplicates in current session (which would mean we've seen them already)
        let newTweetsInThisPage = 0;
        for (const tweet of filteredTweets) {
          if (tweet.id && !seenTweetIds.has(tweet.id)) {
            seenTweetIds.add(tweet.id);
            newTweetsInThisPage++;
          }
        }

        if (newTweetsInThisPage === 0 && filteredTweets.length > 0) {
          log(
            `All tweets on page ${pageCount} are duplicates from previous pages, stopping pagination`,
            "twitter-api"
          );
          break;
        }

        // Second, check if these exist in database (if we have a projectId)
        if (projectId) {
          let existingTweetsInPage = 0;

          for (const tweet of filteredTweets) {
            if (!tweet.id) continue;

            // Check if this tweet already exists in the database for this project
            const existingTweet = await db.query.mindshareTweets.findFirst({
              where: and(
                eq(mindshareTweets.tweet_id, tweet.id),
                eq(mindshareTweets.project_id, projectId)
              ),
            });

            if (existingTweet) {
              existingTweetsInPage++;

              // Check if it's a recent tweet (within 2 days) before counting as duplicate
              const tweetCreatedAt = new Date(
                tweet.createdAt || new Date().toISOString()
              );
              const twoDaysAgo = new Date();
              twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

              if (tweetCreatedAt >= twoDaysAgo) {
                // For recent tweets (≤2 days), we'll update metrics using FXTwitter later
                // Don't count toward early stopping limit since these are valuable to update
                log(
                  `[OPTIMIZATION] Tweet ${tweet.id} is recent (≤2 days), will update metrics later with FXTwitter. Not counting toward early stopping.`,
                  "twitter-api"
                );
              } else {
                // Only increment consecutive counter for older tweets
                consecutiveExistingTweets++;

                // Check if we've found enough existing tweets to stop early
                if (consecutiveExistingTweets >= MAX_CONSECUTIVE_EXISTING) {
                  log(
                    `[OPTIMIZATION] Found ${consecutiveExistingTweets} consecutive existing tweets (>3 days old). Breaking search loop for "${keyword}" to save API credits.`,
                    "twitter-api"
                  );
                  break; // This breaks the tweet loop, the while loop check above will handle stopping the pagination
                }
              }
            } else {
              // Found a new tweet, reset the consecutive counter
              consecutiveExistingTweets = 0;
            }
          }

          // Track how many of the existing tweets are older (>3 days) vs recent (≤3 days)
          let olderExistingTweetsInPage = 0;
          let recentTweetsInPage = 0;

          for (const tweet of filteredTweets) {
            if (!tweet.id) continue;

            // Check age of the tweet (if it has createdAt)
            if (tweet.createdAt) {
              // Safety check for createdAt validity
              const createdAtValue = tweet.createdAt
                ? typeof tweet.createdAt === "object"
                  ? JSON.stringify(tweet.createdAt)
                  : String(tweet.createdAt)
                : new Date().toISOString();
              const tweetCreatedAt = new Date(createdAtValue);
              const twoDaysAgo = new Date();
              twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

              if (tweetCreatedAt >= twoDaysAgo) {
                recentTweetsInPage++; // Recent tweets that we want to get/update
              } else {
                olderExistingTweetsInPage++; // Older tweets that can count toward early stopping
              }
            }
          }

          // If all tweets on this page exist, they're all older than 2 days (not worth updating),
          // and we have enough consecutive old tweets for early stopping, then stop pagination
          if (
            existingTweetsInPage === filteredTweets.length &&
            filteredTweets.length > 0 &&
            olderExistingTweetsInPage === filteredTweets.length &&
            consecutiveExistingTweets >= MAX_CONSECUTIVE_EXISTING
          ) {
            log(
              `[OPTIMIZATION] All ${filteredTweets.length} tweets on page ${pageCount} are older than 2 days and already exist in database. Stopping pagination early.`,
              "twitter-api"
            );
            break;
          }

          // If all tweets on this page exist, stop pagination immediately
          // We'll use FXTwitter directly for recent tweet updates in a separate function
          if (
            existingTweetsInPage === filteredTweets.length &&
            filteredTweets.length > 0
          ) {
            log(
              `[OPTIMIZATION] All ${filteredTweets.length} tweets on page ${pageCount} already exist. Stopping pagination to save API credits.`,
              "twitter-api"
            );

            // Add the filtered tweets to our collection for reference
            allTweets = [...allTweets, ...filteredTweets];

            // Process this page of tweets, then stop
            log(
              `[OPTIMIZATION] Stopping pagination after page ${pageCount} since all tweets already exist.`,
              "twitter-api"
            );
            break;
          }
        }

        // Add filtered tweets to our collection
        allTweets = [...allTweets, ...filteredTweets];

        // If no more tweets or no cursor, break the loop
        if (filteredTweets.length === 0 || !cursor) {
          log(
            `No more tweets or no cursor available, stopping pagination after ${pageCount} pages`,
            "twitter-api"
          );
          break;
        }

        // If we've reached our max tweet count, stop fetching
        if (allTweets.length >= maxTweets) {
          log(
            `Reached maximum tweet count (${maxTweets}), stopping pagination`,
            "twitter-api"
          );
          break;
        }
      }

      log(
        `Total tweets found across ${pageCount} pages: ${allTweets.length} for keyword "${keyword}"`,
        "twitter-api"
      );

      return allTweets;
    } catch (error) {
      log(
        `Error searching tweets: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "twitter-api"
      );
      return [];
    }
  }

  /**
   * Collect tweets for all active projects and their keywords
   */
  /**
   * Collect tweets for a single project
   * @param project The project to collect tweets for, including its keywords
   * @param days Number of days to look back for tweets
   * @returns Object containing collection statistics
   */
  async collectProjectTweets(
    project: MindshareProject & { keywords: MindshareKeyword[] },
    days: number = 7
  ): Promise<{
    tweetsCollected: number;
    newTweets: number;
  }> {
    try {
      log(
        `Collecting tweets for project ${project.name} (ID: ${project.id}) for the past ${days} days`,
        "mindshare"
      );

      if (!project.keywords || project.keywords.length === 0) {
        log(
          `Project ${project.name} (ID: ${project.id}) has no active keywords, skipping`,
          "mindshare"
        );
        return {
          tweetsCollected: 0,
          newTweets: 0,
        };
      }

      let projectTweetsCollected = 0;
      let projectNewTweets = 0;
      let existingTweetCount = 0; // To track how many existing tweets we encounter

      // Set the date range for collection
      const endDate = new Date();
      const startDate = subDays(endDate, days);

      for (const keyword of project.keywords) {
        // Check if we've already seen too many existing tweets overall (not just for one keyword)
        if (existingTweetCount >= 3) {
          log(
            `[OPTIMIZATION] Found ${existingTweetCount} consecutive existing tweets across keywords. Stopping project tweet collection early to save API credits.`,
            "mindshare"
          );
          break; // Break out of the keywords loop
        }

        // Search for tweets matching this keyword
        // Pass the project ID to enable early stopping in searchTweets directly
        const tweets = await this.searchTweets(
          keyword.keyword,
          startDate,
          undefined, // No until date - search up to current time
          1000, // Remove the 50 tweet limit to fetch more tweets
          project.id // Pass the project ID to check for existing tweets in the database
        );

        log(
          `Found ${tweets.length} tweets for keyword "${keyword.keyword}"`,
          "mindshare"
        );

        // Process each tweet
        // Process all tweets for this keyword in parallel batches
        const tweetBatches = [];
        const BATCH_SIZE = 100; // Process 100 tweets at a time

        for (let i = 0; i < tweets.length; i += BATCH_SIZE) {
          const batch = tweets.slice(i, i + BATCH_SIZE);
          tweetBatches.push(batch);
        }

        for (const batch of tweetBatches) {
          // Process each batch in parallel
          const batchResults = await Promise.all(
            batch.map(async (tweet) => {
              try {
                // Check if we've found enough existing tweets to stop early within a single keyword
                if (existingTweetCount >= 3) {
                  return { type: "skip", reason: "too_many_existing" };
                }

                if (!tweet.id || !tweet.text || !tweet.createdAt) {
                  return { type: "skip", reason: "invalid_tweet" };
                }

                // Check if this tweet is already in the database for this specific project
                // This allows the same tweet to be counted for multiple projects if they're mentioned
                const existingTweet = await db.query.mindshareTweets.findFirst({
                  where: and(
                    eq(mindshareTweets.tweet_id, tweet.id),
                    eq(mindshareTweets.project_id, project.id)
                  ),
                });

                // Tweet already exists for this project - check if it's recent before counting as duplicate
                if (existingTweet) {
                  // Check if it's a recent tweet (within 2 days) to update its metrics using FXTwitter
                  const tweetCreatedAt = new Date(
                    typeof tweet.createdAt === "string"
                      ? tweet.createdAt
                      : (tweet?.createdAt as any).toString() || ""
                  );
                  const twoDaysAgo = new Date();
                  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

                  if (tweetCreatedAt >= twoDaysAgo) {
                    // For tweets within 2 days, use free FXTwitter API to update metrics
                    // Important: Don't count recent tweets that we're updating toward the early stopping limit
                    log(
                      `[OPTIMIZATION] Tweet ${tweet.id} is within 2 days old. Using FREE FXTwitter API to update metrics instead of paid API credits.`,
                      "mindshare"
                    );

                    try {
                      // Get updated metrics from FXTwitter (which is free and doesn't use API credits)
                      const fxMetrics = await fetchTweetMetrics(tweet.id);

                      if (fxMetrics) {
                        // Only update if we got valid data and the new metrics are higher
                        const updateData: Record<string, any> = {};

                        if (fxMetrics.views > existingTweet.views) {
                          updateData.views = fxMetrics.views;
                        }

                        if (fxMetrics.likes > existingTweet.likes) {
                          updateData.likes = fxMetrics.likes;
                        }

                        if (fxMetrics.retweets > existingTweet.retweets) {
                          updateData.retweets = fxMetrics.retweets;
                        }

                        if (fxMetrics.replies > existingTweet.replies) {
                          updateData.replies = fxMetrics.replies;
                        }

                        // Only update if any metrics actually changed
                        if (Object.keys(updateData).length > 0) {
                          await db
                            .update(mindshareTweets)
                            .set(updateData)
                            .where(
                              and(
                                eq(mindshareTweets.tweet_id, tweet.id),
                                eq(mindshareTweets.project_id, project.id)
                              )
                            );

                          log(
                            `[OPTIMIZATION] ✓ Updated metrics for tweet ${tweet.id} using FREE FXTwitter API (saved API credits)`,
                            "mindshare"
                          );
                          return { type: "updated", tweetId: tweet.id };
                        } else {
                          log(
                            `[OPTIMIZATION] No metric updates needed for tweet ${tweet.id} using FXTwitter data`,
                            "mindshare"
                          );
                          return {
                            type: "no_update_needed",
                            tweetId: tweet.id,
                          };
                        }
                      }
                    } catch (fxError) {
                      log(
                        `[OPTIMIZATION] Error using FXTwitter for tweet ${
                          tweet.id
                        }: ${
                          fxError instanceof Error
                            ? fxError.message
                            : String(fxError)
                        }`,
                        "mindshare"
                      );
                      return {
                        type: "fx_error",
                        tweetId: tweet.id,
                        error: fxError,
                      };
                    }
                  } else {
                    // Only count non-recent tweets toward the early stopping limit
                    return { type: "existing_old", tweetId: tweet.id };
                  }

                  // Skip inserting this tweet since it already exists
                  return { type: "existing", tweetId: tweet.id };
                }

                // Insert the new tweet
                // Map advanced_search fields to our database schema
                const tweetData: InsertMindshareTweet = {
                  project_id: project.id,
                  keyword_id: keyword.id,
                  tweet_id: tweet.id,
                  user_handle: tweet.author?.userName || tweet.username || "",
                  user_name: tweet.author?.name || tweet.name || "",
                  user_profile_image:
                    tweet.author?.profilePicture ||
                    tweet.profilePictureUrl ||
                    "",
                  content: cleanTweetText(tweet.text),
                  views: tweet.viewCount || tweet.metrics?.views || 0,
                  likes: tweet.likeCount || tweet.metrics?.likes || 0,
                  retweets: tweet.retweetCount || tweet.metrics?.retweets || 0,
                  replies: tweet.replyCount || tweet.metrics?.replies || 0,
                  created_at: new Date(tweet.createdAt),
                  collected_at: new Date(),
                };

                await db.insert(mindshareTweets).values(tweetData);
                return { type: "new", tweetId: tweet.id };
              } catch (error) {
                return { type: "error", tweetId: tweet.id, error };
              }
            })
          );

          // Process batch results
          for (const result of batchResults) {
            if (
              result.type === "skip" &&
              result.reason === "too_many_existing"
            ) {
              // We've already hit the limit, no need to process more
              break;
            } else if (
              result.type === "updated" ||
              result.type === "no_update_needed"
            ) {
              projectTweetsCollected++;
            } else if (result.type === "existing_old") {
              existingTweetCount++;
              log(
                `[OPTIMIZATION] Found existing tweet ${result.tweetId} (older than 2 days). Consecutive existing tweets: ${existingTweetCount}/3`,
                "mindshare"
              );
            } else if (result.type === "new") {
              // When we find a new tweet, reset the existingTweetCount since
              // we're not encountering consecutive existing tweets
              existingTweetCount = 0;
              projectTweetsCollected++;
              projectNewTweets++;
            }
          }

          // Check if we should stop processing this keyword
          if (existingTweetCount >= 3) {
            log(
              `[OPTIMIZATION] Found ${existingTweetCount} consecutive existing tweets. Stopping tweet collection for keyword "${keyword.keyword}" early to save API credits.`,
              "mindshare"
            );
            break;
          }
        }
      }

      log(
        `Collected ${projectTweetsCollected} tweets (${projectNewTweets} new) for project "${project.name}"`,
        "mindshare"
      );

      return {
        tweetsCollected: projectTweetsCollected,
        newTweets: projectNewTweets,
      };
    } catch (error) {
      log(
        `Error collecting tweets for project ${project.name}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "mindshare"
      );
      throw error; // Re-throw the error to be handled by the caller
    }
  }

  /**
   * Update metrics for all recent tweets using FXTwitter API
   * This runs separately from tweet collection and focuses on updating
   * ALL tweets in the database that are less than 2 days old
   * without using expensive TwitterAPI.io API credits
   *
   * Uses Promise.allSettled for parallel batch processing to drastically improve performance
   */
  async updateRecentTweetMetrics(days: number = 2): Promise<{
    tweetsChecked: number;
    tweetsUpdated: number;
    skippedNewlyCollected: number;
  }> {
    try {
      // Calculate the date cutoff (2 days ago)
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - days);

      // Also calculate a threshold for newly collected tweets (last 30 minutes)
      const recentlyCollectedThreshold = new Date();
      recentlyCollectedThreshold.setMinutes(
        recentlyCollectedThreshold.getMinutes() - 30
      );

      log(
        `🔄 [PARALLEL UPDATE] Starting FXTwitter parallel batch processing for tweets created after ${daysAgo.toISOString()}`,
        "mindshare"
      );
      log(
        `⏭️ Skipping tweets collected in the last 30 minutes (after ${recentlyCollectedThreshold.toISOString()})`,
        "mindshare"
      );

      // Find all tweets in the database from the past 2 days based on TWEET CREATION DATE
      // But we'll filter out recently collected tweets based on DATABASE INSERTION TIME
      const recentTweets = await readDb.query.mindshareTweets.findMany({
        where: gte(mindshareTweets.created_at, daysAgo),
      });

      log(
        `🔍 Found ${recentTweets.length} recent tweets (≤2 days old) in the database to update`,
        "mindshare"
      );

      let tweetsUpdated = 0;
      let skippedNewlyCollected = 0;

      // Batch configuration
      const BATCH_SIZE = 40; // Process 40 tweets in parallel
      const BATCH_PAUSE = 200; // 200ms pause between batches

      // Filter out recently collected tweets first
      const tweetsToProcess = recentTweets.filter((tweet) => {
        if (
          tweet.collected_at &&
          new Date(tweet.collected_at) >= recentlyCollectedThreshold
        ) {
          log(
            `[UPDATE] Skipping recently collected tweet ${
              tweet.tweet_id
            } (collected at ${tweet.collected_at.toISOString()})`,
            "mindshare"
          );
          skippedNewlyCollected++;
          return false;
        }
        return true;
      });

      log(
        `🚀 PARALLEL BATCH PROCESSING: ${tweetsToProcess.length} tweets in batches of ${BATCH_SIZE} (filtered out ${skippedNewlyCollected} recently collected tweets)`,
        "mindshare"
      );

      // Process tweets in batches
      for (let i = 0; i < tweetsToProcess.length; i += BATCH_SIZE) {
        const batchStart = Date.now();
        const currentBatch = tweetsToProcess.slice(i, i + BATCH_SIZE);
        const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(tweetsToProcess.length / BATCH_SIZE);

        log(
          `⚡ BATCH ${batchNumber}/${totalBatches} PARALLEL PROCESSING STARTED: ${
            currentBatch.length
          } tweets (IDs: ${currentBatch
            .slice(0, 3)
            .map((t) => t.tweet_id)
            .join(", ")}${currentBatch.length > 3 ? "..." : ""})`,
          "mindshare"
        );

        // Process the batch in parallel
        const results = await Promise.allSettled(
          currentBatch.map(async (tweet) => {
            try {
              // Track execution time for this specific tweet
              const tweetStartTime = Date.now();

              // Get updated metrics from FXTwitter (which is free and doesn't use API credits)
              const fxMetrics = await fetchTweetMetrics(tweet.tweet_id);

              if (fxMetrics) {
                // Only update if we got valid data and the new metrics are higher
                const updateData: Record<string, any> = {};
                let metricsIncreased = false;

                if (fxMetrics.views > tweet.views) {
                  updateData.views = fxMetrics.views;
                  metricsIncreased = true;
                }

                if (fxMetrics.likes > tweet.likes) {
                  updateData.likes = fxMetrics.likes;
                  metricsIncreased = true;
                }

                if (fxMetrics.retweets > tweet.retweets) {
                  updateData.retweets = fxMetrics.retweets;
                  metricsIncreased = true;
                }

                if (fxMetrics.replies > tweet.replies) {
                  updateData.replies = fxMetrics.replies;
                  metricsIncreased = true;
                }

                // Only update if any metrics actually changed
                if (metricsIncreased) {
                  await db
                    .update(mindshareTweets)
                    .set(updateData)
                    .where(eq(mindshareTweets.id, tweet.id));

                  const tweetProcessingTime = Date.now() - tweetStartTime;
                  log(
                    `[UPDATE] ⏱️ ${tweetProcessingTime}ms - Updated metrics for tweet ${tweet.tweet_id} using FREE FXTwitter API`,
                    "mindshare"
                  );
                  return true; // Successfully updated
                }
              }
              return false; // No update needed
            } catch (error) {
              log(
                `Error updating metrics for tweet ${tweet.tweet_id}: ${
                  error instanceof Error ? error.message : String(error)
                }`,
                "mindshare"
              );
              return false;
            }
          })
        );

        // Count successful updates in this batch
        const batchUpdates = results.filter(
          (result) => result.status === "fulfilled" && result.value === true
        ).length;

        tweetsUpdated += batchUpdates;

        // Calculate how long the batch processing took
        const batchProcessingTime = Date.now() - batchStart;
        log(
          `⚡ BATCH ${batchNumber}/${totalBatches} COMPLETED in ${batchProcessingTime}ms: ${batchUpdates} tweets updated out of ${currentBatch.length}`,
          "mindshare"
        );

        // Wait between batches to avoid overwhelming the API
        if (i + BATCH_SIZE < tweetsToProcess.length) {
          const batchDuration = Date.now() - batchStart;
          const waitTime = Math.max(0, BATCH_PAUSE - batchDuration);

          if (waitTime > 0) {
            log(
              `Waiting ${waitTime}ms before next batch to avoid rate limiting...`,
              "mindshare"
            );
            await new Promise((resolve) => setTimeout(resolve, waitTime));
          }
        }
      }

      log(
        `✅ Completed parallel batch processing for FXTwitter metrics update:`,
        "mindshare"
      );
      log(
        `- ${tweetsUpdated} tweets updated out of ${tweetsToProcess.length} checked`,
        "mindshare"
      );
      log(
        `- ${skippedNewlyCollected} tweets skipped (recently collected)`,
        "mindshare"
      );

      return {
        tweetsChecked: tweetsToProcess.length,
        tweetsUpdated,
        skippedNewlyCollected,
      };
    } catch (error) {
      log(
        `Error in updateRecentTweetMetrics: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "mindshare"
      );
      return {
        tweetsChecked: 0,
        tweetsUpdated: 0,
        skippedNewlyCollected: 0,
      };
    }
  }

  async collectAllProjectTweets(days: number = 7): Promise<{
    projectsUpdated: number;
    tweetsCollected: number;
    newTweets: number;
    failedProjects: string[];
  }> {
    try {
      log(
        `Starting tweet collection for all active projects (past ${days} days)`,
        "mindshare"
      );

      // Get all active projects with their keywords
      const projects = await db.query.mindshareProjects.findMany({
        where: eq(mindshareProjects.is_active, true),
        with: {
          keywords: {
            where: eq(mindshareKeywords.is_active, true),
          },
        },
      });

      log(
        `Found ${projects.length} active projects to collect tweets for`,
        "mindshare"
      );

      let totalTweetsCollected = 0;
      let totalNewTweets = 0;
      let updatedProjects = 0;
      const failedProjects: string[] = [];

      // Filter out projects with no keywords first
      const projectsWithKeywords = projects.filter(
        (project) => project.keywords && project.keywords.length > 0
      );
      const skippedProjects = projects.length - projectsWithKeywords.length;

      if (skippedProjects > 0) {
        log(
          `Skipping ${skippedProjects} projects with no active keywords`,
          "mindshare"
        );
      }

      // Process all projects in parallel
      const results = await Promise.all(
        projectsWithKeywords.map(async (project) => {
          try {
            log(
              `Starting collection for project ${project.name} (ID: ${project.id})`,
              "mindshare"
            );
            const result = await this.collectProjectTweets(project, days);

            return {
              project: project.name,
              success: true,
              result,
            };
          } catch (error) {
            log(
              `Error collecting tweets for project ${project.name}: ${
                error instanceof Error ? error.message : String(error)
              }`,
              "mindshare"
            );
            return {
              project: project.name,
              success: false,
              error: error instanceof Error ? error.message : String(error),
            };
          }
        })
      );

      // Process results
      results.forEach((result) => {
        if (result.success) {
          if (result.result && result.result.tweetsCollected > 0) {
            updatedProjects++;
            totalTweetsCollected += result.result.tweetsCollected;
            totalNewTweets += result.result.newTweets;
          } else {
            log(
              `No tweets collected for project ${result.project}`,
              "mindshare"
            );
            failedProjects.push(result.project);
          }
        } else {
          failedProjects.push(result.project);
        }
      });

      return {
        projectsUpdated: updatedProjects,
        tweetsCollected: totalTweetsCollected,
        newTweets: totalNewTweets,
        failedProjects,
      };
    } catch (error) {
      log(
        `Error in collectAllProjectTweets: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "mindshare"
      );
      return {
        projectsUpdated: 0,
        tweetsCollected: 0,
        newTweets: 0,
        failedProjects: ["All projects - general error"],
      };
    }
  }

  /**
   * Calculate mindshare metrics for all projects over a specific time period
   */
  async calculateMindshareMetrics(
    startDate: Date = subDays(new Date(), 30),
    endDate: Date = new Date()
  ): Promise<MindshareMetrics[]> {
    try {
      log(
        `Calculating mindshare metrics for all projects from ${startDate.toISOString()} to ${endDate.toISOString()}`,
        "mindshare"
      );

      // Get all active projects
      const projects = await db.query.mindshareProjects.findMany({
        where: eq(mindshareProjects.is_active, true),
      });

      const metrics: MindshareMetrics[] = [];

      for (const project of projects) {
        // Get all tweets for this project in the time period
        const tweets = await db.query.mindshareTweets.findMany({
          where: and(
            eq(mindshareTweets.project_id, project.id),
            gte(mindshareTweets.created_at, startDate),
            lte(mindshareTweets.created_at, endDate)
          ),
        });

        if (tweets.length === 0) {
          log(
            `No tweets found for project ${project.name} in the specified time period`,
            "mindshare"
          );
          continue;
        }

        // Calculate metrics
        const totalTweets = tweets.length;
        let totalViews = 0;
        let totalLikes = 0;
        let totalRetweets = 0;
        let totalReplies = 0;

        for (const tweet of tweets) {
          totalViews += tweet.views || 0;
          totalLikes += tweet.likes || 0;
          totalRetweets += tweet.retweets || 0;
          totalReplies += tweet.replies || 0;
        }

        // Calculate engagement rate (likes + retweets + replies) / views * 100
        const engagementActions = totalLikes + totalRetweets + totalReplies;
        const engagementRate =
          totalViews > 0 ? (engagementActions / totalViews) * 100 : 0;

        // Insert or update metrics for this project and time period
        const existingMetrics = await db.query.mindshareMetrics.findFirst({
          where: and(
            eq(mindshareMetrics.project_id, project.id),
            eq(mindshareMetrics.start_date, startDate),
            eq(mindshareMetrics.end_date, endDate)
          ),
        });

        if (existingMetrics) {
          // Update existing metrics
          await db
            .update(mindshareMetrics)
            .set({
              tweet_count: totalTweets,
              views: totalViews,
              likes: totalLikes,
              retweets: totalRetweets,
              replies: totalReplies,
              engagement_rate: Number(engagementRate.toFixed(2)),
              updated_at: new Date(),
            })
            .where(eq(mindshareMetrics.id, existingMetrics.id));

          metrics.push({
            ...existingMetrics,
            tweet_count: totalTweets,
            views: totalViews,
            likes: totalLikes,
            retweets: totalRetweets,
            replies: totalReplies,
            engagement_rate: Number(engagementRate.toFixed(2)),
            updated_at: new Date(),
          });
        } else {
          // Insert new metrics
          const newMetrics: InsertMindshareMetrics = {
            project_id: project.id,
            start_date: startDate,
            end_date: endDate,
            tweet_count: totalTweets,
            views: totalViews,
            likes: totalLikes,
            retweets: totalRetweets,
            replies: totalReplies,
            engagement_rate: Number(engagementRate.toFixed(2)),
            created_at: new Date(),
            updated_at: new Date(),
          };

          const result = await db
            .insert(mindshareMetrics)
            .values(newMetrics)
            .returning();

          if (result.length > 0) {
            metrics.push(result[0]);
          }
        }

        log(
          `Calculated metrics for project ${
            project.name
          }: ${totalTweets} tweets, ${totalViews} views, engagement rate: ${engagementRate.toFixed(
            2
          )}%`,
          "mindshare"
        );
      }

      return metrics;
    } catch (error) {
      log(
        `Error calculating mindshare metrics: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "mindshare"
      );
      return [];
    }
  }

  /**
   * Get all active projects with their mindshare metrics
   * Simplified version that just calculates metrics directly from tweets in the date range
   * @param timeframe The timeframe (day, week, month) or a custom period
   * @param days Optional custom number of days to use instead of the timeframe preset
   */
  async getAllProjectsWithMetrics(
    timeframe: "day" | "week" | "month" = "week",
    days?: number,
    tagIds?: number[]
  ): Promise<any[]> {
    const startTime = Date.now();
    try {
      // Create a new date object for the end date and set it to the end of the day (23:59:59.999)
      let endDate = new Date();
      endDate.setHours(23, 59, 59, 999);

      // Create a new date object for the start date and set it to the beginning of the day (00:00:00.000)
      let startDate = new Date(endDate);

      // If days parameter is provided, use that directly
      if (days !== undefined && !isNaN(days)) {
        startDate.setDate(startDate.getDate() - days);
        startDate.setHours(0, 0, 0, 0);
        log(
          `Getting metrics for custom ${days} days period, startDate: ${startDate.toISOString()}, endDate: ${endDate.toISOString()}`,
          "mindshare"
        );
      } else {
        // Otherwise use the timeframe parameter
        if (timeframe === "day") {
          startDate.setDate(startDate.getDate() - 1);
          startDate.setHours(0, 0, 0, 0);
        } else if (timeframe === "week") {
          startDate.setDate(startDate.getDate() - 7);
          startDate.setHours(0, 0, 0, 0);
        } else {
          // month
          startDate.setDate(startDate.getDate() - 30);
          startDate.setHours(0, 0, 0, 0);
        }
        log(
          `Getting metrics for timeframe: ${timeframe}, startDate: ${startDate.toISOString()}, endDate: ${endDate.toISOString()}`,
          "mindshare"
        );
      }

      // Get all active projects with their keywords (using read replica)
      let projects = await readDb.query.mindshareProjects.findMany({
        where: eq(mindshareProjects.is_active, true),
        orderBy: [desc(mindshareProjects.created_at)],
        with: {
          keywords: {
            where: eq(mindshareKeywords.is_active, true),
          },
        },
      });

      // Filter projects by tag IDs if provided
      const unfilteredProjectCount = projects.length;
      if (tagIds && tagIds.length > 0) {
        log(`Filtering projects by tag IDs: ${tagIds.join(", ")}`, "mindshare");
        projects = projects.filter((project) => {
          // Check if the project has any of the requested tag IDs
          if (!project.tag_ids || project.tag_ids.length === 0) {
            return false;
          }
          // Return true if any of the project's tag_ids match the requested tagIds
          return project.tag_ids.some((tagId) => tagIds.includes(tagId));
        });
        log(
          `Filtered from ${unfilteredProjectCount} total projects to ${projects.length} projects with matching tags`,
          "mindshare"
        );
      }

      // Get all project tags - we'll join them to projects (using read replica)
      const allTags = await readDb.select().from(projectTags);
      const tagMap = new Map(allTags.map((tag) => [tag.id, tag]));

      // Debug logging to see project data direct from database
      projects.forEach((project) => {
        console.log(
          `DEBUG: Project ${project.id} - ${project.name} banner_url from DB: ${project.banner_url}`
        );
      });

      log(
        `Found ${projects.length} active projects${
          tagIds && tagIds.length > 0 ? " (after tag filtering)" : ""
        }`,
        "mindshare"
      );

      // Get all project IDs for batch queries
      const projectIds = projects.map((p) => p.id);
      if (projectIds.length === 0) return [];

      // Step 1: Get aggregated metrics for ALL projects in a SINGLE query (using read replica)
      const metricsQuery = await readDb
        .select({
          project_id: mindshareTweets.project_id,
          views: sql<number>`COALESCE(SUM(${mindshareTweets.views}), 0)`,
          likes: sql<number>`COALESCE(SUM(${mindshareTweets.likes}), 0)`,
          retweets: sql<number>`COALESCE(SUM(${mindshareTweets.retweets}), 0)`,
          replies: sql<number>`COALESCE(SUM(${mindshareTweets.replies}), 0)`,
          tweet_count: sql<number>`COUNT(*)`,
        })
        .from(mindshareTweets)
        .where(
          and(
            inArray(mindshareTweets.project_id, projectIds),
            gte(mindshareTweets.created_at, startDate),
            lte(mindshareTweets.created_at, endDate)
          )
        )
        .groupBy(mindshareTweets.project_id);

      const metricsMap = new Map(metricsQuery.map((m) => [m.project_id, m]));

      // Step 2: Get keyword counts for all projects in one query (using read replica)
      const keywordCounts = await readDb
        .select({
          project_id: mindshareKeywords.project_id,
          count: sql<number>`COUNT(*)`,
        })
        .from(mindshareKeywords)
        .where(
          and(
            inArray(mindshareKeywords.project_id, projectIds),
            eq(mindshareKeywords.is_active, true)
          )
        )
        .groupBy(mindshareKeywords.project_id);

      const keywordCountMap = new Map(
        keywordCounts.map((k) => [k.project_id, k.count])
      );

      log(`Fetched metrics and keyword counts in batch queries`, "mindshare");

      // Process each project with pre-fetched data (no async needed)
      const projectsWithMetrics = projects.map((project) => {
        // Get pre-fetched metrics and keyword count
        const metrics = metricsMap.get(project.id) || {
          views: 0,
          likes: 0,
          retweets: 0,
          replies: 0,
          tweet_count: 0,
        };

        const keywordCount = keywordCountMap.get(project.id) || 0;

        const totalEngagement =
          Number(metrics.likes) +
          Number(metrics.retweets) +
          Number(metrics.replies);
        const engagementRate =
          Number(metrics.views) > 0
            ? (totalEngagement / Number(metrics.views)) * 100
            : 0;

        const enhancedMetrics: ExtendedMindshareMetrics = {
          id: 0, // This is a calculated metric, not from DB
          project_id: project.id,
          timeframe: timeframe,
          tweet_count: Number(metrics.tweet_count),
          views: Number(metrics.views),
          likes: Number(metrics.likes),
          retweets: Number(metrics.retweets),
          replies: Number(metrics.replies),
          engagement_rate: engagementRate,
          start_date: startDate,
          end_date: endDate,
          created_at: new Date(),
          updated_at: new Date(),
          total_engagement: totalEngagement,
          total_views: Number(metrics.views),
          _temp_engagement: totalEngagement, // Used temporarily for calculating share percentage
        } as ExtendedMindshareMetrics;

        // Get the tags for this project from the pre-fetched map
        const projectTagIds = project.tag_ids || [];
        const projectTags = projectTagIds
          .map((id) => tagMap.get(id))
          .filter(Boolean);

        return {
          ...project,
          banner_url: project.banner_url, // Explicitly include banner_url to ensure it's in the response
          logo_url: project.logo_url, // Explicitly include logo_url for consistency
          metrics: enhancedMetrics as ExtendedMindshareMetrics | null,
          tweet_count: Number(metrics.tweet_count),
          keyword_count: keywordCount,
          timeframe,
          tags: projectTags, // Include the tags in the response
        };
      });

      // Calculate total engagement across FILTERED projects only
      // This ensures percentages are calculated based on the visible subset
      const totalFilteredEngagement = projectsWithMetrics.reduce(
        (sum, project) => {
          if (!project) return sum;
          // Cast to ExtendedMindshareMetrics to access the extended properties
          const metrics = project.metrics as ExtendedMindshareMetrics | null;
          return sum + (metrics?._temp_engagement || 0);
        },
        0
      );

      // Calculate share percentage based on total engagement of FILTERED projects
      projectsWithMetrics.forEach((project) => {
        if (!project) return;
        if (project.metrics) {
          // Cast to ExtendedMindshareMetrics to access the extended properties
          const metrics = project.metrics as ExtendedMindshareMetrics;
          const projectEngagement = metrics._temp_engagement || 0;

          // Calculate percentage of total filtered engagement (rounded to 2 decimal places)
          const sharePercentage =
            totalFilteredEngagement > 0
              ? Number(
                  ((projectEngagement / totalFilteredEngagement) * 100).toFixed(
                    2
                  )
                )
              : 0;

          // Replace the temporary engagement score with the actual share percentage
          metrics.share_percentage = sharePercentage;
          // Set temp property to undefined instead of using delete
          metrics._temp_engagement = undefined;

          console.log(
            `Project ${project.name} mindshare: ${sharePercentage}% of filtered total ${totalFilteredEngagement}`
          );
        }
      });

      // Sort projects by engagement (most active first)
      const sortedProjects = projectsWithMetrics
        .filter(Boolean)
        .sort((a, b) => {
          if (!a || !b) return 0;
          const metricsA = a.metrics as ExtendedMindshareMetrics | null;
          const metricsB = b.metrics as ExtendedMindshareMetrics | null;
          return (
            (metricsB?.total_engagement || 0) -
            (metricsA?.total_engagement || 0)
          );
        });

      // Debug logging to check final values before sending to client
      sortedProjects.forEach((project) => {
        if (!project) return;
        console.log(
          `DEBUG: Final project ${project.id} - ${project.name} banner_url: ${project.banner_url}`
        );
      });

      const endTime = Date.now();
      log(
        `Query completed in ${endTime - (startTime || Date.now())}ms`,
        "mindshare"
      );

      return sortedProjects;
    } catch (error) {
      log(
        `Error getting projects with metrics: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "mindshare"
      );
      return [];
    }
  }

  /**
   * Get time series data for a specific project over the last 30 days
   */
  async getProjectTimeSeries(projectId: number): Promise<any[]> {
    try {
      // Get the last 30 days of tweets for this project
      let endDate = new Date();
      endDate.setHours(23, 59, 59, 999); // End of the current day

      let startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - 30);
      startDate.setHours(0, 0, 0, 0); // Beginning of the day 30 days ago

      // Get all tweets for this project in the time period
      const tweets = await readDb.query.mindshareTweets.findMany({
        where: and(
          eq(mindshareTweets.project_id, projectId),
          gte(mindshareTweets.created_at, startDate),
          lte(mindshareTweets.created_at, endDate)
        ),
        orderBy: [asc(mindshareTweets.created_at)],
      });

      // Group tweets by day
      const tweetsByDay: { [key: string]: { count: number; date: Date } } = {};

      // Initialize all days in the range with zero counts
      let currentDate = new Date(startDate);
      while (currentDate <= endDate) {
        const dateKey = format(currentDate, "yyyy-MM-dd");
        tweetsByDay[dateKey] = { count: 0, date: new Date(currentDate) };
        currentDate = addDays(currentDate, 1);
      }

      // Count tweets per day
      for (const tweet of tweets) {
        const dateKey = format(tweet.created_at, "yyyy-MM-dd");
        if (tweetsByDay[dateKey]) {
          tweetsByDay[dateKey].count++;
        }
      }

      // Convert to array for charting
      const timeSeries: { date: Date; count: number }[] = [];
      Object.values(tweetsByDay).forEach((day) => {
        timeSeries.push({
          date: day.date,
          count: day.count,
        });
      });

      // Sort by date (ascending)
      return timeSeries.sort((a, b) => a.date.getTime() - b.date.getTime());
    } catch (error) {
      log(
        `Error getting project time series: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "mindshare"
      );
      return [];
    }
  }

  /**
   * Create a new project
   */
  async createProject(
    project: InsertMindshareProject
  ): Promise<MindshareProject> {
    try {
      // Ensure tag_ids is an array
      if (!project.tag_ids) {
        project.tag_ids = [];
      }

      const result = await db
        .insert(mindshareProjects)
        .values(project)
        .returning();

      if (result.length === 0) {
        throw new Error("Failed to create project");
      }

      log(
        `Created new project: ${project.name} (ID: ${result[0].id})`,
        "mindshare"
      );

      // Automatically add the Twitter handle as the first keyword
      if (project.twitter_handle) {
        try {
          // Format keyword as @{handle}
          const handleKeyword = project.twitter_handle.startsWith("@")
            ? project.twitter_handle
            : `@${project.twitter_handle}`;

          // Add the keyword
          await this.addKeyword({
            project_id: result[0].id,
            keyword: handleKeyword,
            is_active: true,
          });

          log(
            `Added Twitter handle '${handleKeyword}' as a keyword for project ${result[0].id}`,
            "mindshare"
          );
        } catch (keywordError) {
          // Log the error but don't fail the project creation
          log(
            `Warning: Failed to add Twitter handle as keyword: ${
              keywordError instanceof Error
                ? keywordError.message
                : String(keywordError)
            }`,
            "mindshare"
          );
        }
      }

      return result[0];
    } catch (error) {
      log(
        `Error creating project: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "mindshare"
      );
      throw error;
    }
  }

  /**
   * Update an existing project
   */
  async updateProject(
    id: number,
    project: Partial<InsertMindshareProject>
  ): Promise<MindshareProject> {
    try {
      // Handle tag_ids properly - ensure it's an array or don't modify it
      if (project.tag_ids !== undefined && !Array.isArray(project.tag_ids)) {
        project.tag_ids = [];
      }

      const result = await db
        .update(mindshareProjects)
        .set({ ...project, updated_at: new Date() })
        .where(eq(mindshareProjects.id, id))
        .returning();

      if (result.length === 0) {
        throw new Error("Project not found");
      }

      log(`Updated project ID ${id}: ${result[0].name}`, "mindshare");

      // If Twitter handle was updated, add it as a keyword if it doesn't exist
      if (project.twitter_handle) {
        try {
          // Format keyword as @{handle}
          const handleKeyword = project.twitter_handle.startsWith("@")
            ? project.twitter_handle
            : `@${project.twitter_handle}`;

          // Check if this keyword already exists
          const existingKeyword = await db.query.mindshareKeywords.findFirst({
            where: and(
              eq(mindshareKeywords.project_id, id),
              eq(mindshareKeywords.keyword, handleKeyword)
            ),
          });

          // If it doesn't exist, add it
          if (!existingKeyword) {
            await this.addKeyword({
              project_id: id,
              keyword: handleKeyword,
              is_active: true,
            });

            log(
              `Added updated Twitter handle '${handleKeyword}' as a keyword for project ${id}`,
              "mindshare"
            );
          }
        } catch (keywordError) {
          // Log the error but don't fail the project update
          log(
            `Warning: Failed to add updated Twitter handle as keyword: ${
              keywordError instanceof Error
                ? keywordError.message
                : String(keywordError)
            }`,
            "mindshare"
          );
        }
      }

      return result[0];
    } catch (error) {
      log(
        `Error updating project: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "mindshare"
      );
      throw error;
    }
  }

  /**
   * Add a keyword to a project
   */
  /**
   * Get a project with its keywords
   * @param projectId The ID of the project to get
   * @returns The project with its keywords or null if not found
   */
  async getProjectWithKeywords(
    projectId: number
  ): Promise<(MindshareProject & { keywords: MindshareKeyword[] }) | null> {
    try {
      // Get the project
      const project = await readDb.query.mindshareProjects.findFirst({
        where: eq(mindshareProjects.id, projectId),
        with: {
          keywords: {
            where: eq(mindshareKeywords.is_active, true),
          },
        },
      });

      return project || null;
    } catch (error) {
      log(
        `Error getting project with keywords: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "mindshare"
      );
      return null;
    }
  }

  /**
   * Get project with keywords and tags
   * @param projectId The ID of the project to get
   * @returns The project with its keywords and tags or null if not found
   */
  async getProjectWithKeywordsAndTags(projectId: number): Promise<
    | (MindshareProject & {
        keywords: MindshareKeyword[];
        tags: any[];
      })
    | null
  > {
    try {
      // Get the project with keywords
      const project = await this.getProjectWithKeywords(projectId);

      if (!project) {
        return null;
      }

      // Get tags if the project has tag_ids
      let tags: any[] = [];
      if (project.tag_ids && project.tag_ids.length > 0) {
        tags = await db
          .select()
          .from(projectTags)
          .where(sql`${projectTags.id} = ANY(${project.tag_ids})`)
          .orderBy(asc(projectTags.name));
      }

      return {
        ...project,
        tags,
      };
    } catch (error) {
      log(
        `Error getting project with keywords and tags: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "mindshare"
      );
      return null;
    }
  }

  async addKeyword(keyword: InsertMindshareKeyword): Promise<MindshareKeyword> {
    try {
      const result = await db
        .insert(mindshareKeywords)
        .values(keyword)
        .returning();

      if (result.length === 0) {
        throw new Error("Failed to add keyword");
      }

      log(
        `Added keyword "${keyword.keyword}" to project ID ${keyword.project_id}`,
        "mindshare"
      );
      return result[0];
    } catch (error) {
      log(
        `Error adding keyword: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "mindshare"
      );
      throw error;
    }
  }

  /**
   * Update a keyword
   */
  async updateKeyword(
    id: number,
    keywordData: Partial<InsertMindshareKeyword>
  ): Promise<MindshareKeyword> {
    try {
      const result = await db
        .update(mindshareKeywords)
        .set({ ...keywordData, updated_at: new Date() })
        .where(eq(mindshareKeywords.id, id))
        .returning();

      if (result.length === 0) {
        throw new Error("Keyword not found");
      }

      log(`Updated keyword ID ${id}: ${result[0].keyword}`, "mindshare");
      return result[0];
    } catch (error) {
      log(
        `Error updating keyword: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "mindshare"
      );
      throw error;
    }
  }

  /**
   * Delete a project and all associated data (keywords, tweets, metrics)
   * @param id Project ID
   */
  async deleteProject(id: number): Promise<void> {
    log(`Deleting project with ID ${id} and all associated data`);

    try {
      // First delete related metrics
      const metricsDeleted = await db
        .delete(mindshareMetrics)
        .where(eq(mindshareMetrics.project_id, id))
        .returning();

      log(`Deleted ${metricsDeleted.length} metrics records`);

      // Delete related tweets
      const tweetsDeleted = await db
        .delete(mindshareTweets)
        .where(eq(mindshareTweets.project_id, id))
        .returning();

      log(`Deleted ${tweetsDeleted.length} tweets`);

      // Delete related keywords
      const keywordsDeleted = await db
        .delete(mindshareKeywords)
        .where(eq(mindshareKeywords.project_id, id))
        .returning();

      log(`Deleted ${keywordsDeleted.length} keywords`);

      // Finally delete the project itself
      const projectDeleted = await db
        .delete(mindshareProjects)
        .where(eq(mindshareProjects.id, id))
        .returning();

      if (projectDeleted.length === 0) {
        throw new Error(`Failed to delete project with ID ${id}`);
      }

      log(`Successfully deleted project with ID ${id}`);
    } catch (error) {
      log(
        `Error deleting project with ID ${id}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      throw error;
    }
  }
}
