import { Request, Response } from 'express';
import { getCachedValue, setCachedValue, listCacheKeys, removeCachedValue } from './cache';

/**
 * Clears cache entries that match a given prefix
 * @param prefix - The prefix to match cache keys against
 * @returns The number of cache entries cleared
 */
export async function clearCacheByPrefix(prefix: string): Promise<number> {
  try {
    // Get all cache keys
    const allKeys = await listCacheKeys(prefix);
    
    // Delete matching keys
    let deletedCount = 0;
    for (const key of allKeys) {
      await removeCachedValue(key);
      deletedCount++;
    }
    
    console.log(`Cleared ${deletedCount} cache entries with prefix: ${prefix}`);
    return deletedCount;
  } catch (error) {
    console.error(`Error clearing cache with prefix ${prefix}:`, error);
    return 0;
  }
}

/**
 * A wrapper function for API controllers that adds caching capabilities
 * @param handler - The original request handler function
 * @param cacheInterval - Cache duration in minutes
 * @returns A wrapped handler function with caching
 */
export function withApiCache<T>(
  handler: (req: Request, res: Response) => Promise<T>,
  cacheInterval: number
) {
  return async (req: Request, res: Response): Promise<void> => {
    // Skip caching for non-GET requests
    if (req.method !== 'GET') {
      const result = await handler(req, res);
      return;
    }
    
    // Create a cache key from the original URL
    let cacheKey = `${req.originalUrl}`;
    
    // Special handling for the reputation leaderboard
    if (req.originalUrl.includes('/reputation/leaderboard')) {
      // Extract only the limit and offset parameters for cache key
      const limit = req.query.limit || '50';
      const offset = req.query.offset || '0';
      const baseUrl = req.originalUrl.split('?')[0];
      cacheKey = `${baseUrl}?limit=${limit}&offset=${offset}`;
    }
    
    try {
      // Try to get from cache
      const cachedValue = await getCachedValue<T>(cacheKey, cacheInterval);
      
      if (cachedValue !== null) {
        // Return cached data
        res.json(cachedValue);
        return;
      }
      
      // Intercept the response to cache it
      const originalJson = res.json.bind(res);
      res.json = function(body: any) {
        // Cache the response
        setCachedValue(cacheKey, body, cacheInterval).catch(err => {
          console.error('Failed to cache response:', err);
        });
        
        // Call the original handler
        return originalJson(body);
      };
      
      // Call the original handler
      await handler(req, res);
    } catch (error) {
      console.error('Error in API cache wrapper:', error);
      // Fall back to the original handler
      await handler(req, res);
    }
  };
}

/**
 * Function to directly get cached data for an API route or compute it if not cached
 * @param req - Express request object
 * @param dataFetcher - Function to fetch/compute the data if not in cache
 * @param cacheInterval - Cache duration in minutes
 * @returns The data (from cache or newly computed)
 */
export async function getOrComputeData<T>(
  req: Request,
  dataFetcher: () => Promise<T>,
  cacheInterval: number
): Promise<T> {
  // For development, return the data directly without caching
  if(process.env.REPLIT_ENV === 'development' || process.env.NODE_ENV !== 'production') {
    console.log('Development mode, bypassing cache and returning data directly');
    return await dataFetcher();
  }
  // Create a cache key from the URL
  // For reputation leaderboard, standardize the cache key to avoid duplicate caching with different parameters
  let cacheKey = `${req.originalUrl}`;
  
  // Special handling for the reputation leaderboard
  if (req.originalUrl.includes('/reputation/leaderboard')) {
    // Extract only the limit and offset parameters for cache key 
    const limit = req.query.limit || '50';
    const offset = req.query.offset || '0';
    const baseUrl = req.originalUrl.split('?')[0];
    cacheKey = `${baseUrl}?limit=${limit}&offset=${offset}`;
  }
  
  try {
    // Try to get from cache
    const cachedValue = await getCachedValue<T>(cacheKey, cacheInterval);
    
    if (cachedValue !== null) {
      // For reputation leaderboard, ensure the data actually contains users
      if (req.originalUrl.includes('/reputation/leaderboard')) {
        const data = cachedValue as any;
        if (!data?.users || !Array.isArray(data.users) || data.users.length === 0) {
          console.log(`Cache hit for ${cacheKey} but data appears empty, recomputing...`);
          throw new Error('Empty data in cache');
        }
      }
      return cachedValue;
    }
    
    // Not in cache, compute it
    const data = await dataFetcher();
    
    // For reputation leaderboard, only cache if we actually have results
    if (req.originalUrl.includes('/reputation/leaderboard')) {
      const leaderboardData = data as any;
      if (leaderboardData?.users && Array.isArray(leaderboardData.users) && leaderboardData.users.length > 0) {
        await setCachedValue(cacheKey, data, cacheInterval);
      } else {
        console.log(`Not caching empty leaderboard data for ${cacheKey}`);
      }
    } else {
      // Cache the computed data
      await setCachedValue(cacheKey, data, cacheInterval);
    }
    
    return data;
  } catch (error) {
    console.error('Error in getOrComputeData:', error);
    // Fall back to computing the data directly
    return await dataFetcher();
  }
}