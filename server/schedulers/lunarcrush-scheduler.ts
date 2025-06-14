/**
 * Scheduler for updating LunarCrush data
 */
import cron from 'node-cron';
import { updateAllUsersLunarCrushData } from '../services/lunarcrush-updater';

// Update LunarCrush data once per day at 4:00 AM UTC
// This is a good time as it's usually low traffic
const LUNARCRUSH_UPDATE_SCHEDULE = '0 4 * * *';

// Limit to top N users by follower count to avoid rate limiting
// We prioritize the most popular accounts
const TOP_USERS_LIMIT = 500;

/**
 * Initialize the LunarCrush update scheduler
 */
export function initLunarCrushScheduler() {
  console.log('[INFO] Starting LunarCrush data scheduler');
  console.log(`[INFO] LunarCrush data will be updated daily at 4:00 AM UTC for top ${TOP_USERS_LIMIT} users`);
  
  // Schedule the cron job
  cron.schedule(LUNARCRUSH_UPDATE_SCHEDULE, async () => {
    console.log(`[INFO] Running scheduled LunarCrush data update for top ${TOP_USERS_LIMIT} users`);
    
    try {
      const result = await updateAllUsersLunarCrushData(TOP_USERS_LIMIT);
      
      if (result.success) {
        console.log(`[INFO] Successfully updated LunarCrush data for ${result.updated} users`);
        console.log(`[INFO] Failed: ${result.failed}, Skipped: ${result.skipped}, Total processed: ${result.total}`);
      } else {
        console.error(`[ERROR] Failed to update LunarCrush data: ${result.message}`);
      }
    } catch (error) {
      console.error('[ERROR] Error running scheduled LunarCrush data update:', error);
    }
  });
  
  // Also run immediately on startup for testing
  console.log(`[INFO] Running initial LunarCrush data update for top 50 users`);
  updateAllUsersLunarCrushData(50)
    .then(result => {
      if (result.success) {
        console.log(`[INFO] Successfully updated LunarCrush data for ${result.updated} users`);
        console.log(`[INFO] Failed: ${result.failed}, Skipped: ${result.skipped}, Total processed: ${result.total}`);
      } else {
        console.error(`[ERROR] Failed to update LunarCrush data: ${result.message}`);
      }
    })
    .catch(error => {
      console.error('[ERROR] Error running initial LunarCrush data update:', error);
    });
}