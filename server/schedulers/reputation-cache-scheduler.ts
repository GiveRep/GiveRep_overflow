import cron from "node-cron";
import { ReputationCacheService } from "../services/reputation-cache-service";

export function startReputationCacheScheduler() {
  // Schedule cache refresh every hour at minute 5
  // This runs on the primary/write server only
  const task = cron.schedule('5 * * * *', async () => {
    console.log('[ReputationCacheScheduler] Starting scheduled cache refresh...');
    
    try {
      const startTime = Date.now();
      await ReputationCacheService.refreshCache();
      const duration = Date.now() - startTime;
      
      console.log(`[ReputationCacheScheduler] Cache refresh completed in ${duration}ms`);
    } catch (error) {
      console.error('[ReputationCacheScheduler] Cache refresh failed:', error);
    }
  }, {
    scheduled: false
  });

  // Only start the scheduler if we're on the write database
  if (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('read-only')) {
    task.start();
    console.log('[ReputationCacheScheduler] Started reputation cache scheduler (runs every hour at :05)');
  } else {
    console.log('[ReputationCacheScheduler] Skipping scheduler on read-only database');
  }

  return task;
}