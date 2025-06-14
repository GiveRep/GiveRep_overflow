import {
  db,
  getReadDatabase,
  getWriteDatabase,
  getConnectionPool,
} from "../../db";
import {
  twitter_user_info,
  TwitterUserInfo,
  type InsertTwitterUserInfo,
} from "../../db/twitter_user_info_schema";
import { eq, sql } from "drizzle-orm";
import { getFXTwitterData } from "../fxtwitter-service";
import { subDays } from "date-fns";

/**
 * Convert FXTwitter API response to our database schema format
 */
function convertToTwitterUserInfo(
  handle: string,
  data: any
): Omit<InsertTwitterUserInfo, "twitter_id"> & { twitter_id: bigint | null } {
  // Normalize Twitter handle (remove @ and convert to lowercase)
  const normalizedHandle = handle.replace("@", "").toLowerCase();

  // Helper to safely parse integers from possibly string or number values
  const safeParseInt = (value: any) => {
    if (typeof value === "number") return value;
    if (typeof value === "string") {
      const parsed = parseInt(value, 10);
      return isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  };

  // Helper to safely parse Twitter ID (can be a very large number)
  const safeParseTwitterId = (value: any) => {
    if (!value) return null;
    try {
      // Always use BigInt for Twitter IDs to avoid precision loss
      return BigInt(value);
    } catch (e) {
      console.warn(`[TWITTER-INFO] Failed to parse Twitter ID: ${value}`, e);
      return null;
    }
  };

  // Handle date parsing
  const parseDate = (dateValue: any) => {
    if (!dateValue) return null;
    try {
      return new Date(dateValue);
    } catch (e) {
      console.warn(`[TWITTER-INFO] Failed to parse date: ${dateValue}`, e);
      return null;
    }
  };

  return {
    handle: normalizedHandle,
    twitter_id: safeParseTwitterId(data?.id) as bigint | null,
    username: data?.userName || data?.screen_name || normalizedHandle,
    display_name: data?.name || normalizedHandle,
    profile_image_url:
      data?.profilePicture || data?.profile_image_url_https || null,
    profile_url: `https://twitter.com/${normalizedHandle}`,
    banner_url:
      data?.bannerPicture ||
      data?.coverPicture ||
      data?.profile_banner_url ||
      null,
    follower_count: safeParseInt(data?.followers || data?.followers_count),
    following_count: safeParseInt(
      data?.followingCount || data?.following || data?.following_count
    ),
    tweet_count: safeParseInt(data?.tweet_count || data?.statuses_count),
    created_at: parseDate(
      data?.createdAt || data?.created_at || data?.accountCreatedAt
    ),
    description: data?.description || null,
    location: data?.location || null,
    is_verified: Boolean(data?.isVerified || data?.verified),
    is_blue_verified: Boolean(data?.isBlueVerified || data?.is_blue_verified),
    creator_score: data?.creator_score || 0, // Default to 0 for creator score
    last_updated_at: new Date(),
  };
}

/**
 * Check if we need to update the Twitter user info based on the last update time
 * @param lastUpdatedAt The timestamp of the last update
 * @returns True if an update is needed, false otherwise
 */
function isUpdateNeeded(existingInfo: TwitterUserInfo): boolean {
  if (!existingInfo.last_updated_at) {
    return true; // No last update time, so we need to update
  }
  if (!existingInfo.profile_image_url || !existingInfo.banner_url) {
    return true;
  }

  const oneDayAgo = subDays(new Date(), 1);
  return existingInfo.last_updated_at < oneDayAgo; // Need update if last update was more than 1 day ago
}

/**
 * Get Twitter user info from our database, updating from FXTwitter if needed
 * @param handle Twitter handle or array of handles to get info for
 * @returns Twitter user info object or map of handle to info object
 */
export async function getTwitterUserInfo(handle: string | string[]) {
  // Handle array of Twitter handles
  if (Array.isArray(handle)) {
    // Return a map of handle -> info
    const result: Record<string, any> = {};

    // Normalize all handles
    const normalizedHandles = handle.map((h) =>
      h ? h.replace("@", "").toLowerCase() : ""
    );
    const validHandles = normalizedHandles.filter((h) => h);

    if (validHandles.length === 0) {
      return result;
    }

    try {
      // Get existing info from database (using read replica for better performance)
      const existingInfo = await getReadDatabase()
        .select()
        .from(twitter_user_info)
        .where(
          sql`${twitter_user_info.handle} IN (${sql.join(
            validHandles.map((h) => sql`${h}`),
            sql`, `
          )})`
        );

      // Create initial result with existing info
      for (const info of existingInfo) {
        result[info.handle] = info;
      }

      // Find missing handles
      const missingHandles = validHandles.filter((h) => !result[h]);

      // Fetch missing handles in parallel with concurrency control
      if (missingHandles.length > 0) {
        console.log(`[TWITTER-INFO] Fetching ${missingHandles.length} profiles from Twitter API...`);
        
        const CONCURRENT_REQUESTS = 15; // Increased concurrency for better performance
        
        for (let i = 0; i < missingHandles.length; i += CONCURRENT_REQUESTS) {
          const batch = missingHandles.slice(i, i + CONCURRENT_REQUESTS);
          
          const batchPromises = batch.map(async (h) => {
            try {
              // Double-check in case another process added it
              const [existingInfo] = await getReadDatabase()
                .select()
                .from(twitter_user_info)
                .where(eq(twitter_user_info.handle, h));

              if (existingInfo) {
                result[h] = existingInfo;
                return;
              }

              const singleResult = await getTwitterUserInfoSingle(h);
              if (singleResult) {
                result[h] = singleResult;
              }
            } catch (err) {
              console.error(`[TWITTER-INFO] Error getting info for @${h}:`, err);
            }
          });
          
          // Wait for this batch to complete before starting next batch
          await Promise.all(batchPromises);
          
          // Small delay between batches to avoid rate limits
          if (i + CONCURRENT_REQUESTS < missingHandles.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
      }

      return result;
    } catch (error) {
      console.error(
        "[TWITTER-INFO] Error getting batch Twitter user info:",
        error
      );
      return result;
    }
  }

  // Handle single Twitter handle
  return getTwitterUserInfoSingle(handle);
}

/**
 * Get Twitter user info for a single handle
 * @param handle Twitter handle to get info for
 * @returns Twitter user info object
 */
async function getTwitterUserInfoSingle(handle: string) {
  if (!handle) {
    console.warn("[TWITTER-INFO] No handle provided");
    return null;
  }

  // Normalize Twitter handle
  const normalizedHandle = handle.replace("@", "").toLowerCase();

  try {
    // Try to get Twitter user info from the database first - use read replica for better performance
    console.log(
      `[TWITTER-INFO] Looking up Twitter info for @${normalizedHandle}`
    );
    const [existingInfo] = await getReadDatabase()
      .select()
      .from(twitter_user_info)
      .where(eq(twitter_user_info.handle, normalizedHandle));

    // Check if we need to update the data
    if (existingInfo && !isUpdateNeeded(existingInfo)) {
      console.log(
        `[TWITTER-INFO] Using cached Twitter info for @${normalizedHandle} (updated ${existingInfo.last_updated_at})`
      );
      return existingInfo;
    }

    // If we need to update or don't have data, fetch from FXTwitter
    console.log(
      `[TWITTER-INFO] Fetching fresh Twitter info for @${normalizedHandle}`
    );
    const fxTwitterData = await getFXTwitterData(normalizedHandle);

    if (!fxTwitterData) {
      console.warn(
        `[TWITTER-INFO] Failed to fetch Twitter info for @${normalizedHandle} from FXTwitter`
      );
      // Return existing data if available, even if it's outdated
      return existingInfo || null;
    }

    // Convert FXTwitter data to our schema format
    const twitterInfo = convertToTwitterUserInfo(
      normalizedHandle,
      fxTwitterData
    );

    try {
      if (existingInfo) {
        // Update existing record - use write database for writes
        console.log(
          `[TWITTER-INFO] Updating Twitter info for @${normalizedHandle}`
        );

        // If the existing record doesn't have a Twitter ID but the new data does, highlight this
        if (!existingInfo.twitter_id && twitterInfo.twitter_id) {
          console.log(
            `[TWITTER-INFO] ✓ Adding missing Twitter ID ${twitterInfo.twitter_id} for @${normalizedHandle}`
          );
        }

        const [updated] = await getWriteDatabase()
          .update(twitter_user_info)
          .set(twitterInfo)
          .where(eq(twitter_user_info.handle, normalizedHandle))
          .returning();
        return updated;
      } else {
        // Before inserting, check one more time to avoid race conditions - use read replica
        const [doubleCheck] = await getReadDatabase()
          .select()
          .from(twitter_user_info)
          .where(eq(twitter_user_info.handle, normalizedHandle));

        if (doubleCheck) {
          // Someone else inserted it while we were fetching from FXTwitter
          // Update it instead - use write database for writes
          console.log(
            `[TWITTER-INFO] Race condition detected - updating instead of inserting for @${normalizedHandle}`
          );

          // If the existing record doesn't have a Twitter ID but the new data does, highlight this
          if (!doubleCheck.twitter_id && twitterInfo.twitter_id) {
            console.log(
              `[TWITTER-INFO] ✓ Adding missing Twitter ID ${twitterInfo.twitter_id} for @${normalizedHandle}`
            );
          }

          const [updated] = await getWriteDatabase()
            .update(twitter_user_info)
            .set(twitterInfo)
            .where(eq(twitter_user_info.handle, normalizedHandle))
            .returning();
          return updated;
        }

        // Insert new record - use write database for writes
        console.log(
          `[TWITTER-INFO] Inserting new Twitter info for @${normalizedHandle}`
        );

        // Log if we're inserting with a Twitter ID
        if (twitterInfo.twitter_id) {
          console.log(
            `[TWITTER-INFO] ✓ New record includes Twitter ID ${twitterInfo.twitter_id} for @${normalizedHandle}`
          );
        }

        try {
          const [inserted] = await getWriteDatabase()
            .insert(twitter_user_info)
            .values(twitterInfo)
            .returning();
          return inserted;
        } catch (insertError: unknown) {
          // If there was a unique constraint violation, try to update instead (another process may have inserted it)
          if (
            typeof insertError === "object" &&
            insertError &&
            "code" in insertError &&
            insertError.code === "23505"
          ) {
            console.log(
              `[TWITTER-INFO] Unique constraint violation - switching to update for @${normalizedHandle}`
            );

            // Fetch the record that's causing the conflict
            const [existing] = await getReadDatabase()
              .select()
              .from(twitter_user_info)
              .where(eq(twitter_user_info.handle, normalizedHandle));

            if (existing) {
              // Update instead of insert
              console.log(
                `[TWITTER-INFO] Updating after conflict for @${normalizedHandle}`
              );

              const [updated] = await getWriteDatabase()
                .update(twitter_user_info)
                .set(twitterInfo)
                .where(eq(twitter_user_info.handle, normalizedHandle))
                .returning();
              return updated;
            }
          }
          // If it's another type of error or we couldn't find the conflicting record, rethrow
          throw insertError;
        }
      }
    } catch (dbError: unknown) {
      console.error(
        `[TWITTER-INFO] Database error for @${normalizedHandle}:`,
        dbError
      );
      // If there was a unique constraint violation, try to get the record - use read replica
      if (
        typeof dbError === "object" &&
        dbError &&
        "code" in dbError &&
        dbError.code === "23505"
      ) {
        // Unique violation
        const [record] = await getReadDatabase()
          .select()
          .from(twitter_user_info)
          .where(eq(twitter_user_info.handle, normalizedHandle));

        if (record) {
          // Try to update the record instead of just returning it
          try {
            console.log(
              `[TWITTER-INFO] Recovering from conflict - updating existing record for @${normalizedHandle}`
            );
            const [updated] = await getWriteDatabase()
              .update(twitter_user_info)
              .set(twitterInfo)
              .where(eq(twitter_user_info.handle, normalizedHandle))
              .returning();
            return updated;
          } catch (updateError) {
            console.warn(
              `[TWITTER-INFO] Failed to update after conflict for @${normalizedHandle}:`,
              updateError
            );
            // If update fails, return the existing record as fallback
            return record;
          }
        }
      }
      // Re-throw if we couldn't recover
      throw dbError;
    }
  } catch (error) {
    console.error(
      `[TWITTER-INFO] Error getting Twitter info for @${normalizedHandle}:`,
      error
    );
    return null;
  }
}

/**
 * Clean up old Twitter user info data
 * This can be run periodically to remove entries for handles that haven't been looked up in a while
 * @param olderThanDays Remove data older than this many days (default: 90)
 */
export async function cleanupOldTwitterUserInfo(olderThanDays: number = 90) {
  try {
    console.log(
      `[TWITTER-INFO] Cleaning up Twitter user info older than ${olderThanDays} days`
    );

    // Calculate cutoff date
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    // Delete records older than cutoff date
    const result = await db
      .delete(twitter_user_info)
      .where(sql`${twitter_user_info.last_updated_at} < ${cutoffDate}`)
      .returning({ handle: twitter_user_info.handle });

    console.log(
      `[TWITTER-INFO] Cleaned up ${result.length} outdated Twitter user info records`
    );
    return result.length;
  } catch (error) {
    console.error(
      "[TWITTER-INFO] Error cleaning up old Twitter user info:",
      error
    );
    return 0;
  }
}
