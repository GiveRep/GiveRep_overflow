/**
 * Redis Cache Middleware
 * 
 * A comprehensive Express middleware for caching API responses in Redis
 * with intelligent cache invalidation, compression, and error handling.
 */
import { Request, Response, NextFunction } from 'express';
import { getCachedValue, setCachedValue } from '../utils/cache';
import zlib from 'zlib';
import { promisify } from 'util';

// Promisify zlib methods
const gzipAsync = promisify(zlib.gzip);
const gunzipAsync = promisify(zlib.gunzip);

// Cache durations in minutes
export enum CacheDuration {
  NONE = 0,
  MICRO = 1,           // 1 minute
  SHORT = 5,           // 5 minutes
  MEDIUM = 15,         // 15 minutes
  HIGH_TRAFFIC = 30,   // 30 minutes
  LONG = 60,           // 1 hour
  EXTENDED = 180,      // 3 hours
  DAILY = 1440,        // 24 hours
}

// Configuration options for the cache middleware
interface RedisCacheOptions {
  duration: number;                      // Cache duration in minutes
  compress?: boolean;                    // Whether to compress the cached data
  keyPrefix?: string;                    // Prefix for cache keys
  paramBlacklist?: string[];            // Query parameters to exclude from cache key
  bypassHeader?: string;                // Header to bypass cache
  bypassCallback?: (req: Request) => boolean; // Function to determine if cache should be bypassed
  errorCallback?: (err: Error) => void; // Function to handle errors
  serveStaleOnError?: boolean;          // Whether to serve stale cache if error occurs
  staleIfError?: number;                // Duration in minutes to serve stale cache after error
  cacheNullValues?: boolean;            // Whether to cache null or undefined values
  setCacheHeaders?: boolean;            // Whether to set cache headers
}

/**
 * Default options for the Redis cache middleware
 */
const defaultOptions: RedisCacheOptions = {
  duration: CacheDuration.MEDIUM,
  compress: true,
  keyPrefix: 'api:',
  paramBlacklist: [],
  bypassHeader: 'X-Bypass-Cache',
  bypassCallback: () => false,
  errorCallback: (err) => console.error('Redis cache middleware error:', err),
  serveStaleOnError: true,
  staleIfError: CacheDuration.SHORT,
  cacheNullValues: false,
  setCacheHeaders: true,
};

/**
 * Generate a cache key from the request
 * 
 * @param req - Express request
 * @param options - Cache options
 * @returns Cache key string
 */
function generateCacheKey(req: Request, options: RedisCacheOptions): string {
  const { keyPrefix, paramBlacklist } = options;
  
  // Start with the request path
  let key = `${keyPrefix}${req.path}`;
  
  // If there are query parameters, include them in the key
  if (Object.keys(req.query).length > 0) {
    // Filter out blacklisted parameters
    const filteredQuery = { ...req.query };
    if (paramBlacklist && paramBlacklist.length > 0) {
      paramBlacklist.forEach(param => {
        delete filteredQuery[param];
      });
    }
    
    // Add filtered query parameters to the key
    if (Object.keys(filteredQuery).length > 0) {
      key += `:${JSON.stringify(filteredQuery)}`;
    }
  }
  
  return key;
}

/**
 * Set appropriate cache headers on the response
 * 
 * @param res - Express response
 * @param duration - Cache duration in minutes
 */
function applyCacheHeaders(res: Response, duration: number): void {
  if (duration <= 0) {
    // No caching
    res.setHeader('Cache-Control', 'no-store, max-age=0, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    return;
  }
  
  // Convert minutes to seconds for HTTP headers
  const seconds = duration * 60;
  
  // Set standard cache headers
  res.setHeader('Cache-Control', `public, max-age=${seconds}`);
  res.setHeader('Expires', new Date(Date.now() + seconds * 1000).toUTCString());
  
  // Set Cloudflare-specific cache directive
  res.setHeader('CDN-Cache-Control', `public, max-age=${seconds}`);
}

/**
 * Express middleware for Redis caching with enhanced features
 * 
 * @param customOptions - Cache middleware options
 * @returns Express middleware function
 */
export function redisCacheMiddleware(customOptions?: Partial<RedisCacheOptions>) {
  // Merge custom options with defaults
  const options: RedisCacheOptions = { 
    ...defaultOptions, 
    ...customOptions 
  };
  
  return async (req: Request, res: Response, next: NextFunction) => {
    // Check if running in development mode
    const isDev = process.env.NODE_ENV !== 'production';
    
    // In development mode, always bypass caching
    if (isDev) {
      // Set no-cache headers
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('X-Cache', 'DEV-MODE');
      
      if (!req.path.includes('/assets/') && !req.path.includes('/node_modules/')) {
        console.log(`[Redis Cache] Bypassing cache in dev mode for: ${req.path}`);
      }
      
      return next();
    }
    
    // Skip caching for non-GET requests
    if (req.method !== 'GET') {
      return next();
    }
    
    // Check if cache should be bypassed
    const bypassCache = 
      req.get(options.bypassHeader!) || 
      options.bypassCallback!(req);
      
    if (bypassCache) {
      // Add header to indicate cache was bypassed
      res.setHeader('X-Cache', 'BYPASS');
      return next();
    }
    
    // Generate cache key
    const cacheKey = generateCacheKey(req, options);
    
    try {
      // Try to get data from cache
      const cachedData = await getCachedValue<any>(cacheKey, options.duration);
      
      if (cachedData !== null) {
        // We have cached data
        
        // Handle compressed data if needed
        let responseData = cachedData;
        
        if (options.compress && 
            cachedData && 
            typeof cachedData === 'object' && 
            cachedData.compressed === true) {
          try {
            // Decompress the data
            const decompressedBuffer = await gunzipAsync(Buffer.from(cachedData.data, 'base64'));
            responseData = JSON.parse(decompressedBuffer.toString());
          } catch (decompressError) {
            options.errorCallback!(new Error(`Failed to decompress cached data: ${decompressError}`));
            // Fall through to continue with request processing
            return next();
          }
        }
        
        // Set appropriate cache headers if enabled
        if (options.setCacheHeaders) {
          applyCacheHeaders(res, options.duration);
        }
        
        // Add header to indicate cache hit
        res.setHeader('X-Cache', 'HIT');
        
        // Send the cached response
        return res.json(responseData);
      }
      
      // Cache miss, continue with request processing
      res.setHeader('X-Cache', 'MISS');
      
      // We'll use a different approach - instead of overriding res.json,
      // we'll intercept just before sending by using our own middleware
      // This avoids the TypeScript issues with overriding methods
      
      // Create a custom response sender that will cache the response
      const oldSend = res.send;
      
      res.send = function(body: any) {
        // Only cache JSON responses
        const contentType = res.getHeader('content-type');
        const isJSON = contentType && contentType.toString().includes('application/json');
        
        if (isJSON) {
          // Don't cache if body is null/undefined and cacheNullValues is false
          const parsedBody = typeof body === 'string' ? JSON.parse(body) : body;
          
          if (!((!parsedBody || (Array.isArray(parsedBody) && parsedBody.length === 0)) && !options.cacheNullValues)) {
            // Handle caching asynchronously, but don't wait for it
            (async () => {
              try {
                let cacheValue = parsedBody;
                
                // Compress the data if compression is enabled
                if (options.compress) {
                  const dataString = typeof body === 'string' ? body : JSON.stringify(body);
                  const compressedData = await gzipAsync(Buffer.from(dataString));
                  cacheValue = {
                    compressed: true,
                    data: compressedData.toString('base64')
                  };
                }
                
                // Store in cache
                await setCachedValue(cacheKey, cacheValue, options.duration);
              } catch (cacheError) {
                options.errorCallback!(new Error(`Failed to cache response: ${cacheError}`));
                // Continue with the response even if caching fails
              }
            })();
          }
          
          // Set cache headers if enabled
          if (options.setCacheHeaders) {
            applyCacheHeaders(res, options.duration);
          }
        }
        
        // Send the original response
        return oldSend.call(this, body);
      };
      
      next();
    } catch (error) {
      options.errorCallback!(error as Error);
      
      // Try to serve stale content if configured
      if (options.serveStaleOnError && options.staleIfError! > 0) {
        try {
          // Force longer lookup with staleIfError duration
          const staleData = await getCachedValue<any>(cacheKey, options.staleIfError!);
          
          if (staleData !== null) {
            // We have stale data to serve
            
            // Handle compressed data if needed
            let responseData = staleData;
            
            if (options.compress && 
                staleData && 
                typeof staleData === 'object' && 
                staleData.compressed === true) {
              try {
                // Decompress the data
                const decompressedBuffer = await gunzipAsync(Buffer.from(staleData.data, 'base64'));
                responseData = JSON.parse(decompressedBuffer.toString());
              } catch (decompressError) {
                // If decompression fails, fall through to normal request handling
                return next();
              }
            }
            
            // Set cache headers to indicate stale content
            res.setHeader('X-Cache', 'STALE');
            
            // Serve the stale data
            return res.json(responseData);
          }
        } catch (staleError) {
          // Silently ignore stale serving errors and continue
        }
      }
      
      // Continue with normal request processing
      next();
    }
  };
}

/**
 * Helper to create a cache middleware with specific duration
 * 
 * @param duration - Cache duration in minutes
 * @param options - Additional cache options
 * @returns Configured cache middleware
 */
export function withCache(duration: number, options?: Partial<RedisCacheOptions>) {
  return redisCacheMiddleware({
    ...options,
    duration
  });
}

/**
 * Pre-configured cache middleware for high-traffic endpoints
 * 
 * @param options - Additional cache options
 * @returns Configured cache middleware
 */
export function highTrafficCache(options?: Partial<RedisCacheOptions>) {
  return redisCacheMiddleware({
    ...options,
    duration: CacheDuration.HIGH_TRAFFIC,
    compress: true
  });
}

/**
 * Pre-configured cache middleware for long-term caching (1 hour)
 * 
 * @param options - Additional cache options
 * @returns Configured cache middleware
 */
export function longTermCache(options?: Partial<RedisCacheOptions>) {
  return redisCacheMiddleware({
    ...options,
    duration: CacheDuration.LONG,
    compress: true
  });
}

/**
 * Pre-configured cache middleware for extended caching (3 hours)
 * 
 * @param options - Additional cache options
 * @returns Configured cache middleware
 */
export function extendedCache(options?: Partial<RedisCacheOptions>) {
  return redisCacheMiddleware({
    ...options,
    duration: CacheDuration.EXTENDED,
    compress: true
  });
}

/**
 * Pre-configured cache middleware for daily caching (24 hours)
 * 
 * @param options - Additional cache options
 * @returns Configured cache middleware
 */
export function dailyCache(options?: Partial<RedisCacheOptions>) {
  return redisCacheMiddleware({
    ...options,
    duration: CacheDuration.DAILY,
    compress: true
  });
}

/**
 * Pre-configured cache middleware for short-term caching (5 minutes)
 * 
 * @param options - Additional cache options
 * @returns Configured cache middleware
 */
export function shortTermCache(options?: Partial<RedisCacheOptions>) {
  return redisCacheMiddleware({
    ...options,
    duration: CacheDuration.SHORT
  });
}

/**
 * Pre-configured cache middleware for micro caching (1 minute)
 * 
 * @param options - Additional cache options
 * @returns Configured cache middleware
 */
export function microCache(options?: Partial<RedisCacheOptions>) {
  return redisCacheMiddleware({
    ...options,
    duration: CacheDuration.MICRO,
    compress: false
  });
}

/**
 * No-cache middleware that explicitly sets no-cache headers
 * 
 * @returns Configured no-cache middleware
 */
export function noCache() {
  return (req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store, max-age=0, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
  };
}