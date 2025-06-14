/**
 * Cache utility for API responses using Redis
 */
import {
  getRedisValue,
  setRedisValue,
  removeRedisValue,
  listRedisKeys,
  clearRedisByPrefix,
  initRedisClient
} from './redisCache';

/**
 * Initialize Redis client when the application starts
 */
export async function initializeCache() {
  try {
    await initRedisClient();
    console.log('Cache system initialized with Redis');
  } catch (error) {
    console.error('Failed to initialize cache system:', error);
  }
}

/**
 * Get a value from the cache
 * @param key - The cache key
 * @param cacheInterval - Cache expiration time in minutes
 * @returns The cached value (parsed JSON) or null if not found or expired
 */
export async function getCachedValue<T>(key: string, cacheInterval: number): Promise<T | null> {
  return getRedisValue<T>(key, cacheInterval);
}

/**
 * Set a value in the cache
 * @param key - The cache key
 * @param value - The value to cache
 * @returns A boolean indicating whether the operation was successful
 */
export async function setCachedValue<T>(key: string, value: T, cacheMinutesInterval: number): Promise<boolean> {
  return setRedisValue<T>(key, value, cacheMinutesInterval);
}

/**
 * Remove a value from the cache
 * @param key - The cache key to delete
 * @returns A boolean indicating whether the operation was successful
 */
export async function removeCachedValue(key: string): Promise<boolean> {
  return removeRedisValue(key);
}

/**
 * List all keys in the cache that match a prefix
 * @param prefix - The key prefix to match
 * @returns Array of matching keys, or empty array if error
 */
export async function listCacheKeys(prefix: string = ''): Promise<string[]> {
  const pattern = prefix ? `${prefix}*` : '*';
  return listRedisKeys(pattern);
}

/**
 * Clear all cache entries that match a prefix
 * @param prefix - The key prefix to match for clearing cache entries
 * @returns Number of entries cleared
 */
export async function clearCacheByPrefix(prefix: string): Promise<number> {
  return clearRedisByPrefix(prefix);
}

/**
 * Create a key from API parameters
 * @param baseKey - The base key (usually the API endpoint)
 * @param params - The parameters to include in the key
 * @returns A string key
 */
export function createCacheKey(baseKey: string, params: Record<string, any>): string {
  return `${baseKey}:${JSON.stringify(params)}`;
}

/**
 * Higher-order function to wrap an API handler with caching
 * @param handler - The original API handler function
 * @param baseKey - The base key for caching (usually the API endpoint)
 * @param cacheInterval - Cache expiration time in minutes
 * @returns A wrapped handler function with caching
 */
export function withCache<TParams extends Record<string, any>, TResult>(
  handler: (params: TParams) => Promise<TResult>,
  baseKey: string,
  cacheInterval: number
): (params: TParams) => Promise<TResult> {
  return async (params: TParams): Promise<TResult> => {
    const cacheKey = createCacheKey(baseKey, params);
    
    // Try to get from cache
    const cachedResult = await getCachedValue<TResult>(cacheKey, cacheInterval);
    if (cachedResult !== null) {
      return cachedResult;
    }
    
    // If not in cache or expired, call the original handler
    const result = await handler(params);
    
    // Cache the result
    await setCachedValue(cacheKey, result, cacheInterval);
    
    return result;
  };
}