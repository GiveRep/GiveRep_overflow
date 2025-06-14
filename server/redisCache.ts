/**
 * Redis cache implementation
 */
import { createClient, type RedisClientType } from 'redis';

/**
 * Cache item interface representing the structure of cached data
 */
interface CacheItem {
  createdAt: number;
  value: string;
}

// Redis client singleton
let redisClient: RedisClientType | null = null;
// Flag to disable Redis after too many failed attempts
let redisDisabled = false;
// Counter for consecutive Redis errors
let redisErrorCount = 0;
// Max allowed errors before disabling Redis
const MAX_REDIS_ERRORS = 3;

// Initialize Redis client with singleton pattern and better error handling
export async function initRedisClient(): Promise<RedisClientType | null> {
  // If Redis is disabled due to too many errors, skip directly to fallback
  if (redisDisabled) {
    return null;
  }

  try {
    // Return existing client if it's connected
    if (redisClient?.isOpen) {
      return redisClient;
    }
    
    // If there's an existing client that's not connected, try to clean it up
    if (redisClient) {
      try {
        console.log('Cleaning up disconnected Redis client');
        await redisClient.quit().catch(() => {}); // Ignore errors during quit
        redisClient = null;
      } catch (err) {
        console.error('Error cleaning up Redis client:', err);
        redisClient = null;
      }
    }

    // Check if required Redis env vars are present
    if (!process.env.REDIS_CLIENT_URL || !process.env.REDIS_CLIENT_PORT) {
      console.log('Redis credentials not configured, fallback to Replit DB');
      redisDisabled = true;
      return null;
    }

    console.log('Initializing Redis client with provided credentials');
    
    // Create Redis client with the provided credentials and options
    redisClient = createClient({
      url: `redis://${process.env.REDIS_CLIENT_URL}:${process.env.REDIS_CLIENT_PORT}`,
      password: process.env.REDIS_CLIENT_SECRET,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 5) {
            // Disable Redis after 5 consecutive reconnect attempts
            console.log('Redis disabled after multiple reconnect attempts');
            redisDisabled = true;
            return false; // Stop reconnecting
          }
          // Exponential backoff with max 3 second delay
          const delay = Math.min(retries * 500, 3000);
          console.log(`Redis reconnecting in ${delay}ms...`);
          return delay;
        },
        connectTimeout: 5000, // 5 seconds connection timeout
      }
    });

    // Add event listeners for connection status
    redisClient.on('error', (err) => {
      console.error('Redis client error:', err);
      redisErrorCount++;
      
      // If we've had too many errors, disable Redis for this session
      if (redisErrorCount >= MAX_REDIS_ERRORS) {
        console.log(`Redis disabled after ${redisErrorCount} consecutive errors`);
        redisDisabled = true;
        if (redisClient) {
          try {
            redisClient.quit().catch(() => {});
          } catch (e) {
            // Ignore quit errors
          }
          redisClient = null;
        }
      }
      
      // If we get "max number of clients reached", immediately switch to fallback
      if (err.message?.includes('max number of clients reached')) {
        console.log('Redis max clients reached, switching to fallback');
        redisDisabled = true;
        if (redisClient) {
          try {
            redisClient.quit().catch(() => {});
          } catch (e) {
            // Ignore quit errors
          }
          redisClient = null;
        }
      }
    });
    
    redisClient.on('connect', () => {
      console.log('Redis client connected');
      // Reset error count on successful connection
      redisErrorCount = 0;
    });
    redisClient.on('reconnecting', () => console.log('Redis client reconnecting'));
    redisClient.on('ready', () => console.log('Redis client ready'));
    redisClient.on('end', () => console.log('Redis client connection closed'));

    // Connect to Redis with a timeout to prevent hanging
    try {
      const connectPromise = redisClient.connect();
      
      // Wait for connection with a timeout
      await Promise.race([
        connectPromise,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Redis connection timeout')), 5000)
        )
      ]);
      
      // Make sure client is still available after connection attempt
      if (!redisClient) {
        console.log('Redis client became null during connection');
        return null;
      }
      
      // Test connection
      const pingResult = await redisClient.ping();
      if (pingResult === 'PONG') {
        console.log('Redis connection tested successfully');
        return redisClient;
      } else {
        console.error('Redis connection test failed');
        return null;
      }
    } catch (connectError) {
      console.error('Error during Redis connection:', connectError);
      // Clean up if there was a connection error
      if (redisClient) {
        try {
          await redisClient.quit().catch(() => {});
        } catch (e) {
          // Ignore quit errors
        }
        redisClient = null;
      }
      return null;
    }
  } catch (error) {
    console.error('Error initializing Redis client:', error);
    
    // Increment error count
    redisErrorCount++;
    
    // If we've had too many errors, disable Redis
    if (redisErrorCount >= MAX_REDIS_ERRORS) {
      console.log(`Redis disabled after ${redisErrorCount} consecutive errors`);
      redisDisabled = true;
    }
    
    // If connection fails, set redisClient to null so we can try again next time
    if (redisClient) {
      try {
        await redisClient.quit().catch(() => {});
      } catch (e) {
        // Ignore quit errors
      }
      redisClient = null;
    }
    return null;
  }
}

/**
 * Get a value from the Redis cache
 * @param key - The cache key
 * @param cacheInterval - Cache expiration time in minutes
 * @returns The cached value (parsed JSON) or null if not found or expired
 */
export async function getRedisValue<T>(key: string, cacheInterval: number): Promise<T | null> {
  if (cacheInterval === 0) {
    return null;
  }
  
  try {
    const client = await initRedisClient();
    if (!client) {
      // Fallback to Replit DB
      return getReplitDBValue(key, cacheInterval);
    }
    
    const cacheText = await client.get(key);
    if (!cacheText) {
      console.log(`Cache miss for key: ${key} (Not found in Redis)`);
      return null;
    }
    
    const cacheItem: CacheItem = JSON.parse(cacheText);
    const now = Date.now();
    const cacheAge = (now - cacheItem.createdAt) / (1000 * 60); // age in minutes
    
    // Check if cache is expired
    if (cacheAge > cacheInterval) {
      console.log(`Cache expired for key: ${key} (Age: ${cacheAge.toFixed(2)} min, Interval: ${cacheInterval} min)`);
      await client.del(key); // Clean up expired entries
      return null;
    }
    
    console.log(`Cache hit for key: ${key} (Age: ${cacheAge.toFixed(2)} min)`);
    return JSON.parse(cacheItem.value) as T;
  } catch (error) {
    console.error(`Error getting cached value from Redis for key ${key}:`, error);
    // Fallback to Replit DB
    return getReplitDBValue(key, cacheInterval);
  }
}

/**
 * Fallback implementation using Replit's DB
 */
async function getReplitDBValue<T>(key: string, cacheInterval: number): Promise<T | null> {
  try {
    console.log(`Falling back to Replit DB for getting key: ${key}`);
    const encodedKey = encodeURIComponent(key);
    
    const response = await fetch(`${process.env.REPLIT_DB_URL}/${encodedKey}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      }
    });
    
    if (!response.ok) {
      console.log(`Cache miss for key: ${key} (Response not OK from Replit DB)`);
      return null;
    }
    
    const cacheText = await response.text();
    if (!cacheText) {
      console.log(`Cache miss for key: ${key} (Empty response from Replit DB)`);
      return null;
    }
    
    const cacheItem: CacheItem = JSON.parse(cacheText);
    const now = Date.now();
    const cacheAge = (now - cacheItem.createdAt) / (1000 * 60); // age in minutes
    
    // Check if cache is expired
    if (cacheAge > cacheInterval) {
      console.log(`Cache expired for key: ${key} (Age: ${cacheAge.toFixed(2)} min, Interval: ${cacheInterval} min)`);
      await removeReplitDBValue(key); // Clean up expired entries
      return null;
    }
    
    console.log(`Cache hit from Replit DB for key: ${key} (Age: ${cacheAge.toFixed(2)} min)`);
    return JSON.parse(cacheItem.value) as T;
  } catch (error) {
    console.error(`Error getting cached value from Replit DB for key ${key}:`, error);
    return null;
  }
}

/**
 * Set a value in the Redis cache
 * @param key - The cache key
 * @param value - The value to cache
 * @returns A boolean indicating whether the operation was successful
 */
export async function setRedisValue<T>(key: string, value: T, cacheMinutesInterval: number = 60): Promise<boolean> {
  try {
    const client = await initRedisClient();
    if (!client) {
      // Fallback to Replit DB
      return setReplitDBValue(key, value);
    }
    
    const cacheItem: CacheItem = {
      createdAt: Date.now(),
      value: JSON.stringify(value)
    };
    
    // Set the value with an expiration time (TTL)
    // The second parameter is the value, third is the expiration option
    // EX sets expiration in seconds (60 seconds per minute)
    await client.set(key, JSON.stringify(cacheItem), {
      EX: cacheMinutesInterval * 60
    });
    console.log(`Cache set for key: ${key}`);
    return true;
  } catch (error) {
    console.error(`Error setting cached value in Redis for key ${key}:`, error);
    // Try fallback to Replit DB
    return setReplitDBValue(key, value);
  }
}

/**
 * Fallback implementation using Replit's DB
 */
async function setReplitDBValue<T>(key: string, value: T): Promise<boolean> {
  try {
    console.log(`Falling back to Replit DB for setting key: ${key}`);
    const encodedKey = encodeURIComponent(key);
    const encodedValue = encodeURIComponent(JSON.stringify({
      createdAt: Date.now(),
      value: JSON.stringify(value)
    }));
    
    const response = await fetch(`${process.env.REPLIT_DB_URL}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `${encodedKey}=${encodedValue}`
    });
    
    if (!response.ok) {
      console.error(`Failed to set cache in Replit DB for key ${key}: ${response.statusText}`);
      return false;
    }
    
    console.log(`Cache set in Replit DB for key: ${key}`);
    return true;
  } catch (error) {
    console.error(`Error setting cached value in Replit DB for key ${key}:`, error);
    return false;
  }
}

/**
 * Remove a value from the Redis cache
 * @param key - The cache key to delete
 * @returns A boolean indicating whether the operation was successful
 */
export async function removeRedisValue(key: string): Promise<boolean> {
  try {
    const client = await initRedisClient();
    if (!client) {
      // Fallback to Replit DB
      return removeReplitDBValue(key);
    }
    
    const result = await client.del(key);
    if (result === 0) {
      console.log(`Key ${key} not found in Redis cache`);
      return false;
    }
    
    console.log(`Cache removed for key: ${key}`);
    return true;
  } catch (error) {
    console.error(`Error removing cached value from Redis for key ${key}:`, error);
    // Try fallback to Replit DB
    return removeReplitDBValue(key);
  }
}

/**
 * Fallback implementation using Replit's DB
 */
async function removeReplitDBValue(key: string): Promise<boolean> {
  try {
    console.log(`Falling back to Replit DB for removing key: ${key}`);
    const encodedKey = encodeURIComponent(key);
    
    const response = await fetch(`${process.env.REPLIT_DB_URL}/${encodedKey}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      }
    });
    
    if (!response.ok) {
      console.error(`Failed to remove cache in Replit DB for key ${key}: ${response.statusText}`);
      return false;
    }
    
    console.log(`Cache removed from Replit DB for key: ${key}`);
    return true;
  } catch (error) {
    console.error(`Error removing cached value from Replit DB for key ${key}:`, error);
    return false;
  }
}

/**
 * List all keys in the Redis cache that match a pattern
 * @param pattern - The key pattern to match
 * @returns Array of matching keys, or empty array if error
 */
export async function listRedisKeys(pattern: string = '*'): Promise<string[]> {
  try {
    const client = await initRedisClient();
    if (!client) {
      // Fallback to Replit DB
      return listReplitDBKeys(pattern);
    }
    
    const keys = await client.keys(pattern);
    return keys;
  } catch (error) {
    console.error(`Error listing Redis cache keys with pattern ${pattern}:`, error);
    // Try fallback to Replit DB
    return listReplitDBKeys(pattern);
  }
}

/**
 * Fallback implementation using Replit's DB
 */
async function listReplitDBKeys(prefix: string = ''): Promise<string[]> {
  try {
    console.log(`Falling back to Replit DB for listing keys with prefix: ${prefix}`);
    const response = await fetch(`${process.env.REPLIT_DB_URL}?prefix=${encodeURIComponent(prefix)}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      }
    });
    
    if (!response.ok) {
      console.error(`Failed to list cache keys from Replit DB with prefix ${prefix}: ${response.statusText}`);
      return [];
    }
    
    const text = await response.text();
    if (!text) return [];
    
    return text.split('\n').filter(Boolean);
  } catch (error) {
    console.error(`Error listing cache keys from Replit DB with prefix ${prefix}:`, error);
    return [];
  }
}

/**
 * Clear all Redis cache entries that match a prefix
 * @param prefix - The key prefix to match for clearing cache entries
 * @returns Number of entries cleared
 */
export async function clearRedisByPrefix(prefix: string): Promise<number> {
  try {
    const client = await initRedisClient();
    if (!client) {
      // Fallback to Replit DB
      return clearReplitDBByPrefix(prefix);
    }
    
    const pattern = prefix ? `${prefix}*` : '*';
    const keys = await client.keys(pattern);
    
    if (keys.length === 0) {
      console.log(`No Redis cache keys found with prefix: ${prefix}`);
      return 0;
    }
    
    // If there are many keys, use pipeline for better performance
    if (keys.length > 10) {
      const pipeline = client.multi();
      for (const key of keys) {
        pipeline.del(key);
      }
      
      const results = await pipeline.exec();
      const clearCount = results ? results.filter(Boolean).length : 0;
      console.log(`Cleared ${clearCount}/${keys.length} Redis cache entries with prefix: ${prefix}`);
      return clearCount;
    } else {
      // For a small number of keys, delete them individually
      let clearCount = 0;
      for (const key of keys) {
        const result = await client.del(key);
        if (result > 0) clearCount++;
      }
      
      console.log(`Cleared ${clearCount}/${keys.length} Redis cache entries with prefix: ${prefix}`);
      return clearCount;
    }
  } catch (error) {
    console.error(`Error clearing Redis cache with prefix ${prefix}:`, error);
    // Try fallback to Replit DB
    return clearReplitDBByPrefix(prefix);
  }
}

/**
 * Fallback implementation using Replit's DB
 */
async function clearReplitDBByPrefix(prefix: string): Promise<number> {
  try {
    console.log(`Falling back to Replit DB for clearing keys with prefix: ${prefix}`);
    const keys = await listReplitDBKeys(prefix);
    if (keys.length === 0) {
      console.log(`No Replit DB cache keys found with prefix: ${prefix}`);
      return 0;
    }
    
    let clearCount = 0;
    for (const key of keys) {
      const success = await removeReplitDBValue(key);
      if (success) clearCount++;
    }
    
    console.log(`Cleared ${clearCount}/${keys.length} Replit DB cache entries with prefix: ${prefix}`);
    return clearCount;
  } catch (error) {
    console.error(`Error clearing Replit DB cache with prefix ${prefix}:`, error);
    return 0;
  }
}

/**
 * Get the Redis client for direct usage
 * @returns Redis client instance or null if not available
 */
export async function getRedisClient(): Promise<RedisClientType | null> {
  return initRedisClient();
}

/**
 * Get cache keys older than a specified number of hours
 * @param hours - Number of hours threshold 
 * @param prefix - Optional prefix to filter keys (default to all keys)
 * @returns Object with count of old keys and array of old keys
 */
export async function getOldCacheKeys(hours: number, prefix: string = ''): Promise<{count: number, keys: string[]}> {
  try {
    const client = await initRedisClient();
    if (!client) {
      console.error('[Redis Cache] Failed to initialize Redis client for old cache check');
      return { count: 0, keys: [] };
    }
    
    // Get all keys (with optional prefix)
    const pattern = prefix ? `${prefix}*` : '*';
    const keys = await client.keys(pattern);
    
    if (keys.length === 0) {
      console.log(`[Redis Cache] No cache entries found with prefix: ${prefix}`);
      return { count: 0, keys: [] };
    }
    
    const oldKeys: string[] = [];
    const now = Date.now();
    const maxAgeMs = hours * 60 * 60 * 1000;
    
    // Process in batches to avoid blocking the event loop
    const batchSize = 100;
    for (let i = 0; i < keys.length; i += batchSize) {
      const batch = keys.slice(i, i + batchSize);
      
      // For each key in the batch, get the value and check its age
      for (const key of batch) {
        try {
          const cacheText = await client.get(key);
          if (!cacheText) continue;
          
          // Parse the cache item to get its creation timestamp
          const cacheItem = JSON.parse(cacheText);
          
          if (!cacheItem.createdAt) continue;
          
          const ageMs = now - cacheItem.createdAt;
          
          // Add to old keys list if older than specified hours
          if (ageMs > maxAgeMs) {
            oldKeys.push(key);
          }
        } catch (error) {
          console.error(`[Redis Cache] Error checking age for cache key ${key}:`, error);
        }
      }
      
      // Log progress for large caches
      if (keys.length > 1000 && i % 1000 === 0) {
        console.log(`[Redis Cache] Old cache check progress: ${i}/${keys.length} keys scanned`);
      }
    }
    
    console.log(`[Redis Cache] Found ${oldKeys.length} entries older than ${hours} hour(s)`);
    return { 
      count: oldKeys.length, 
      keys: oldKeys 
    };
  } catch (error) {
    console.error(`[Redis Cache] Error getting old cache keys:`, error);
    return { count: 0, keys: [] };
  }
}

/**
 * Clear cache entries older than specified hours
 * @param hours - Number of hours threshold
 * @param prefix - Optional prefix to filter keys (default to all keys)
 * @returns Number of entries cleared
 */
export async function clearOldCache(hours: number, prefix: string = ''): Promise<number> {
  try {
    const { keys } = await getOldCacheKeys(hours, prefix);
    
    if (keys.length === 0) {
      console.log(`[Redis Cache] No old cache entries to clear`);
      return 0;
    }
    
    const client = await initRedisClient();
    if (!client) {
      console.error('[Redis Cache] Failed to initialize Redis client for clearing old cache');
      return 0;
    }
    
    // If there are many keys, use pipeline for better performance
    if (keys.length > 10) {
      const pipeline = client.multi();
      for (const key of keys) {
        pipeline.del(key);
      }
      
      const results = await pipeline.exec();
      const clearCount = results ? results.filter(Boolean).length : 0;
      console.log(`[Redis Cache] Cleared ${clearCount}/${keys.length} old cache entries`);
      return clearCount;
    } else {
      // For a small number of keys, delete them individually
      let clearCount = 0;
      for (const key of keys) {
        const result = await client.del(key);
        if (result > 0) clearCount++;
      }
      
      console.log(`[Redis Cache] Cleared ${clearCount}/${keys.length} old cache entries`);
      return clearCount;
    }
  } catch (error) {
    console.error(`[Redis Cache] Error clearing old cache:`, error);
    return 0;
  }
}