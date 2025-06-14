/**
 * Tweet metrics validation utilities
 * Prevents storing unrealistic or corrupted tweet metrics
 */

import { logger } from "../logger";

// Maximum reasonable values for tweet metrics
// These are based on realistic upper bounds for even the most viral tweets
export const TWEET_METRICS_LIMITS = {
  // Views/Impressions - even the most viral tweets rarely exceed 1 billion views
  MAX_VIEWS: 1_000_000_000, // 1 billion
  
  // Engagement metrics - typically much lower than views
  MAX_LIKES: 10_000_000, // 10 million
  MAX_RETWEETS: 5_000_000, // 5 million  
  MAX_REPLIES: 1_000_000, // 1 million
  MAX_QUOTES: 1_000_000, // 1 million
  MAX_BOOKMARKS: 5_000_000, // 5 million
  
  // Follower counts
  MAX_FOLLOWERS: 500_000_000, // 500 million (X's most followed accounts)
} as const;

/**
 * Validates and sanitizes a numeric metric value
 * @param value The value to validate
 * @param metricName The name of the metric for logging
 * @param maxValue The maximum allowed value
 * @param context Optional context for logging (e.g., tweet ID, user handle)
 * @returns The sanitized value
 */
export function validateMetric(
  value: number | string | null | undefined,
  metricName: string,
  maxValue: number,
  context?: string
): number {
  // Handle null/undefined
  if (value === null || value === undefined) {
    return 0;
  }

  // Convert to number
  let numValue: number;
  if (typeof value === 'string') {
    // Remove commas and spaces that might be in formatted numbers
    const cleanValue = value.replace(/[,\s]/g, '');
    numValue = Number(cleanValue);
  } else {
    numValue = Number(value);
  }

  // Check for NaN or negative values
  if (isNaN(numValue) || numValue < 0) {
    logger.warn(
      `[tweet-validation] Invalid ${metricName} value: ${value}${context ? ` for ${context}` : ''}. Setting to 0.`
    );
    return 0;
  }

  // Check for unreasonably large values
  if (numValue > maxValue) {
    logger.warn(
      `[tweet-validation] Extremely large ${metricName} detected: ${numValue}${context ? ` for ${context}` : ''}. Capping at ${maxValue}.`
    );
    return maxValue;
  }

  // Check for Infinity
  if (!isFinite(numValue)) {
    logger.warn(
      `[tweet-validation] Infinite ${metricName} detected${context ? ` for ${context}` : ''}. Setting to 0.`
    );
    return 0;
  }

  return Math.floor(numValue); // Ensure integer value
}

/**
 * Validates all metrics for a tweet
 * @param metrics Object containing tweet metrics
 * @param context Optional context for logging
 * @returns Sanitized metrics object
 */
export function validateTweetMetrics(
  metrics: {
    viewCount?: number | string | null;
    likeCount?: number | string | null;
    retweetCount?: number | string | null;
    replyCount?: number | string | null;
    quoteCount?: number | string | null;
    bookmarkCount?: number | string | null;
  },
  context?: string
): {
  viewCount: number;
  likeCount: number;
  retweetCount: number;
  replyCount: number;
  quoteCount: number;
  bookmarkCount: number;
} {
  return {
    viewCount: validateMetric(metrics.viewCount, 'viewCount', TWEET_METRICS_LIMITS.MAX_VIEWS, context),
    likeCount: validateMetric(metrics.likeCount, 'likeCount', TWEET_METRICS_LIMITS.MAX_LIKES, context),
    retweetCount: validateMetric(metrics.retweetCount, 'retweetCount', TWEET_METRICS_LIMITS.MAX_RETWEETS, context),
    replyCount: validateMetric(metrics.replyCount, 'replyCount', TWEET_METRICS_LIMITS.MAX_REPLIES, context),
    quoteCount: validateMetric(metrics.quoteCount, 'quoteCount', TWEET_METRICS_LIMITS.MAX_QUOTES, context),
    bookmarkCount: validateMetric(metrics.bookmarkCount, 'bookmarkCount', TWEET_METRICS_LIMITS.MAX_BOOKMARKS, context),
  };
}

/**
 * Validates follower count
 * @param followerCount The follower count to validate
 * @param context Optional context for logging
 * @returns Sanitized follower count
 */
export function validateFollowerCount(
  followerCount: number | string | null | undefined,
  context?: string
): number {
  return validateMetric(followerCount, 'followerCount', TWEET_METRICS_LIMITS.MAX_FOLLOWERS, context);
}

/**
 * Calculates the difference between two metric values safely
 * @param newValue The new metric value
 * @param oldValue The old metric value
 * @param metricName The name of the metric for logging
 * @param maxDifference Maximum allowed difference (prevents suspicious spikes)
 * @returns The safe difference
 */
export function calculateMetricDifference(
  newValue: number,
  oldValue: number,
  metricName: string,
  maxDifference: number = 10_000_000 // 10 million default max difference
): number {
  const difference = newValue - oldValue;
  
  // Negative differences are suspicious but could happen if tweets are deleted/hidden
  if (difference < 0) {
    logger.warn(
      `[tweet-validation] Negative ${metricName} difference detected: ${difference} (new: ${newValue}, old: ${oldValue})`
    );
    return 0; // Don't award points for negative differences
  }
  
  // Check for suspiciously large increases
  if (difference > maxDifference) {
    logger.warn(
      `[tweet-validation] Suspiciously large ${metricName} increase: ${difference} (new: ${newValue}, old: ${oldValue}). Capping at ${maxDifference}.`
    );
    return maxDifference;
  }
  
  return difference;
}