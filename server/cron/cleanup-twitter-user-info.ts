import { cleanupOldTwitterUserInfo } from "../services/twitter-user-info-service";
import cron from "node-cron";

/**
 * Scheduled job to clean up old Twitter user info records
 * Runs weekly (every Sunday at 3:00 AM)
 */
export function setupTwitterUserInfoCleanupJob() {
  console.log("Setting up weekly Twitter user info cleanup job...");
  
  // Schedule job to run weekly (every Sunday at 3:00 AM)
  // Cron format: minute hour day-of-month month day-of-week
  cron.schedule("0 3 * * 0", async () => {
    try {
      console.log("[TWITTER-CLEANUP] Starting weekly Twitter user info cleanup...");
      
      // Delete Twitter user info records that are older than 90 days
      const cleanedCount = await cleanupOldTwitterUserInfo(90);
      
      console.log(`[TWITTER-CLEANUP] Successfully cleaned up ${cleanedCount} outdated Twitter user info records`);
    } catch (error) {
      console.error("[TWITTER-CLEANUP] Error during Twitter user info cleanup:", error);
    }
  });
  
  // Also run it once at startup to clean up any outdated records
  setTimeout(async () => {
    try {
      console.log("[TWITTER-CLEANUP] Running initial Twitter user info cleanup on startup...");
      
      // Delete Twitter user info records that are older than 90 days
      const cleanedCount = await cleanupOldTwitterUserInfo(90);
      
      console.log(`[TWITTER-CLEANUP] Initial cleanup: removed ${cleanedCount} outdated Twitter user info records`);
    } catch (error) {
      console.error("[TWITTER-CLEANUP] Error during initial Twitter user info cleanup:", error);
    }
  }, 60000); // Wait 1 minute after startup to avoid conflicts with other initialization tasks
}