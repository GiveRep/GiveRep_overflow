import { Request, Response, NextFunction } from 'express';
import { getCachedValue, setCachedValue } from './cache';

/**
 * Express middleware for caching API responses
 * @param cacheInterval - Cache duration in minutes
 * @returns Express middleware function
 */
export function cacheMiddleware(cacheInterval: number) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Skip caching for non-GET requests
    if (req.method !== 'GET') {
      return next();
    }

    const cacheKey = getCacheKeyFromRequest(req);
    
    try {
      // Check if we have a cached response
      const cachedData = await getCachedValue<any>(cacheKey, cacheInterval);
      
      if (cachedData !== null) {
        // Return the cached response
        return res.json(cachedData);
      }
      
      // Create a response interceptor to cache the response
      const originalJson = res.json;
      res.json = function(body) {
        // Save the response in the cache
        setCachedValue(cacheKey, body).catch(error => {
          console.error('Error saving to cache:', error);
        });
        
        // Call the original json method
        return originalJson.call(this, body);
      };
      
      next();
    } catch (error) {
      console.error('Cache middleware error:', error);
      next();
    }
  };
}

/**
 * Create a cache key from the request
 * @param req - Express request object
 * @returns Cache key string
 */
function getCacheKeyFromRequest(req: Request): string {
  // Combine the URL path with query parameters for a unique key
  const queryParams = JSON.stringify(req.query);
  return `${req.path}:${queryParams}`;
}

/**
 * Helper for applying cache expiration headers
 * @param res - Express response object
 * @param cacheInterval - Cache duration in minutes
 */
export function setCacheHeaders(res: Response, cacheInterval: number): void {
  const seconds = cacheInterval * 60;
  res.set('Cache-Control', `public, max-age=${seconds}`);
  res.set('Expires', new Date(Date.now() + seconds * 1000).toUTCString());
}