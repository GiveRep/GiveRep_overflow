import { db } from "../../db";
import { sql } from "drizzle-orm";
import cron from "node-cron";

/**
 * Scheduler for refreshing materialized views and other metrics caches
 * This ensures our precomputed data stays fresh with minimal performance impact
 */

let isRunning = false;
let lastRun: Date | null = null;

/**
 * Refresh the user_tweet_aggregates materialized view
 * This is a concurrent refresh that doesn't block reads
 */
async function refreshUserTweetAggregates() {
  if (isRunning) {
    console.log("[MetricsRefresh] Already running, skipping this cycle");
    return;
  }

  isRunning = true;
  const startTime = Date.now();
  console.log(`[MetricsRefresh] Starting materialized view refresh at ${new Date().toISOString()}`);

  try {
    // Call the database function to refresh the materialized view
    await db.execute(sql`SELECT refresh_user_tweet_aggregates()`);
    
    const executionTime = Date.now() - startTime;
    console.log(`[MetricsRefresh] Completed refresh in ${executionTime}ms`);
    lastRun = new Date();
  } catch (error) {
    console.error("[MetricsRefresh] Error refreshing materialized view:", error);
  } finally {
    isRunning = false;
  }
}

/**
 * Start the metrics refresh scheduler
 */
export function startMetricsRefreshScheduler() {
  console.log("[MetricsRefresh] Starting metrics refresh scheduler");
  
  // Run every hour at minute 15 (1:15, 2:15, etc.)
  // This staggers it from other scheduled tasks to avoid resource contention
  cron.schedule("15 * * * *", async () => {
    console.log("[MetricsRefresh] Running scheduled refresh");
    await refreshUserTweetAggregates();
  });
  
  // Also do an initial refresh on startup
  // Use setTimeout to avoid blocking the server startup
  setTimeout(async () => {
    console.log("[MetricsRefresh] Running initial refresh on startup");
    await refreshUserTweetAggregates();
  }, 60000); // Wait 1 minute after server start before first refresh
}

/**
 * Get the status of the metrics refresh scheduler
 */
export function getMetricsRefreshStatus() {
  return {
    isRunning,
    lastRun: lastRun ? lastRun.toISOString() : null
  };
}