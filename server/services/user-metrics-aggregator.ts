import { db } from "@db";
import { giverepUsers, giverepTweets } from "@db/giverep_schema";
import { eq, sql } from "drizzle-orm";
import { performance } from "perf_hooks";

// Import cache utilities
import { getCachedValue as getCache, setCachedValue as setCache } from "../utils/cache";

// Cache TTL (time to live) for user metrics in seconds
const USER_METRICS_CACHE_TTL = 86400; // 24 hours
const HIGH_TRAFFIC_USER_THRESHOLD = 5000; // users with more than 5000 followers get updated more frequently

/**
 * Get a value from cache
 * @param key Cache key
 * @returns Cached value or null if not found
 */
async function getCachedValue(key: string): Promise<string | null> {
  try {
    // Using built-in cache with no expiration check (we'll handle that ourselves)
    // The 0 means don't check for expiration - we'll look at the timestamp ourselves
    return await getCache(key, 0);
  } catch (error) {
    console.error(`Error getting cached value for key ${key}:`, error);
    return null;
  }
}

/**
 * Set a value in cache with TTL
 * @param key Cache key
 * @param value Value to cache
 * @param ttlSeconds TTL in seconds
 */
async function setCachedValue(key: string, value: string, ttlSeconds: number): Promise<void> {
  try {
    // Convert seconds to minutes for the cache interface
    const ttlMinutes = ttlSeconds / 60;
    await setCache(key, value, ttlMinutes);
  } catch (error) {
    console.error(`Error setting cached value for key ${key}:`, error);
  }
}

/**
 * Pre-calculate and cache user metrics for faster API responses
 * This significantly reduces the need for expensive aggregations at request time
 * 
 * @param userId User ID to calculate metrics for
 * @param priorityLevel Priority level (1: high, 2: medium, 3: low)
 * @returns Object with calculated metrics
 */
export async function calculateAndCacheUserMetrics(
  userId: number, 
  priorityLevel: number = 3
): Promise<{
  success: boolean;
  userId: number;
  tweetCount: number;
  totalViews: number;
  totalLikes: number;
  totalRetweets: number;
  totalComments: number;
  processingTimeMs: number;
}> {
  const startTime = performance.now();
  const cacheKey = `user_metrics:${userId}`;
  
  try {
    // Check if we have cached metrics first
    const cachedMetrics = await getCachedValue(cacheKey);
    if (cachedMetrics) {
      console.log(`Using cached metrics for user ID ${userId}`);
      return {
        ...JSON.parse(cachedMetrics),
        success: true,
        processingTimeMs: performance.now() - startTime
      };
    }
    
    // Use materialized view for ultra-fast lookups
    // This avoids expensive aggregation at query time
    const result = await db.execute(sql`
      SELECT 
        tweet_count,
        total_views,
        total_likes,
        total_retweets,
        total_comments
      FROM user_tweet_aggregates
      WHERE user_id = ${userId}
    `);
    
    if (!result.rows || result.rows.length === 0) {
      console.log(`No metrics found for user ID ${userId}`);
      return {
        success: false,
        userId,
        tweetCount: 0,
        totalViews: 0,
        totalLikes: 0,
        totalRetweets: 0,
        totalComments: 0,
        processingTimeMs: performance.now() - startTime
      };
    }
    
    // Handle the result row with proper type safety
    const row = result.rows[0] as Record<string, unknown>;
    
    const metrics = {
      success: true,
      userId,
      tweetCount: parseInt(String(row.tweet_count || '0')),
      totalViews: parseInt(String(row.total_views || '0')),
      totalLikes: parseInt(String(row.total_likes || '0')),
      totalRetweets: parseInt(String(row.total_retweets || '0')),
      totalComments: parseInt(String(row.total_comments || '0')),
      processingTimeMs: performance.now() - startTime
    };
    
    // Cache based on priority level
    const cacheTTL = priorityLevel === 1 ? 
      USER_METRICS_CACHE_TTL / 4 : // 6 hours for high priority
      priorityLevel === 2 ? 
        USER_METRICS_CACHE_TTL / 2 : // 12 hours for medium priority
        USER_METRICS_CACHE_TTL; // 24 hours for low priority
    
    await setCachedValue(cacheKey, JSON.stringify(metrics), cacheTTL);
    console.log(`Cached metrics for user ID ${userId} with TTL ${cacheTTL}s`);
    
    return metrics;
  } catch (error) {
    console.error(`Error calculating metrics for user ID ${userId}:`, error);
    
    return {
      success: false,
      userId,
      tweetCount: 0,
      totalViews: 0,
      totalLikes: 0,
      totalRetweets: 0,
      totalComments: 0,
      processingTimeMs: performance.now() - startTime
    };
  }
}

/**
 * Get user metrics (either from cache or calculated)
 * @param userId User ID to get metrics for
 * @returns User metrics object
 */
export async function getUserMetrics(userId: number): Promise<{
  tweetCount: number;
  totalViews: number;
  totalLikes: number;
  totalRetweets: number;
  totalComments: number;
}> {
  try {
    // First try to get the user to determine priority level
    const user = await db.query.giverepUsers.findFirst({
      where: eq(giverepUsers.id, userId)
    });
    
    // Set priority level based on follower count
    const priorityLevel = user && user.follower_count > HIGH_TRAFFIC_USER_THRESHOLD ? 1 : 
                          user && user.follower_count > 1000 ? 2 : 3;
    
    // Get metrics
    const metrics = await calculateAndCacheUserMetrics(userId, priorityLevel);
    
    return {
      tweetCount: metrics.tweetCount,
      totalViews: metrics.totalViews,
      totalLikes: metrics.totalLikes,
      totalRetweets: metrics.totalRetweets,
      totalComments: metrics.totalComments
    };
  } catch (error) {
    console.error(`Error getting metrics for user ID ${userId}:`, error);
    return {
      tweetCount: 0,
      totalViews: 0,
      totalLikes: 0,
      totalRetweets: 0,
      totalComments: 0
    };
  }
}

/**
 * Queue background refresh of user metrics
 * This allows us to pre-calculate metrics for users who are frequently accessed
 * @param twitterHandle Twitter handle of the user
 */
export async function queueUserMetricsRefresh(twitterHandle: string): Promise<void> {
  try {
    // Get user ID from handle
    const user = await db.query.giverepUsers.findFirst({
      where: eq(sql`LOWER(twitter_handle)`, twitterHandle.toLowerCase())
    });
    
    if (!user) {
      console.log(`User not found for handle ${twitterHandle}`);
      return;
    }
    
    // Queue refresh by calculating and caching metrics
    // We don't await this to avoid blocking
    calculateAndCacheUserMetrics(user.id, 
      user.follower_count > HIGH_TRAFFIC_USER_THRESHOLD ? 1 : 
      user.follower_count > 1000 ? 2 : 3)
      .then(() => {
        console.log(`Successfully refreshed metrics for ${twitterHandle}`);
      })
      .catch((error) => {
        console.error(`Error refreshing metrics for ${twitterHandle}:`, error);
      });
      
    console.log(`Queued metrics refresh for ${twitterHandle}`);
  } catch (error) {
    console.error(`Error queuing metrics refresh for ${twitterHandle}:`, error);
  }
}