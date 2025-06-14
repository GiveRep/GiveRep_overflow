import { Request, Response, NextFunction } from "express";
import fs from "fs";
import path from "path";

/**
 * Cache durations in seconds
 */
const HIGH_TRAFFIC_CACHE_DURATION = 30 * 60; // 30 minutes
const ASSETS_CACHE_DURATION = 3 * 60 * 60; // 3 hours

/**
 * List of endpoints that should never be cached, even if they match patterns
 * These typically contain user-specific or frequently changing data
 */
const NEVER_CACHE_ENDPOINTS = [
  "/api/auth/", // Auth endpoints should never be cached
  "/api/giverep/users/me", // Current user profile
  "/api/giverep/users/session", // User session data
  "/api/loyalty/check-membership", // User membership status
  "/api/loyalty/user-memberships", // User membership list - needs real-time checking
  "/api/loyalty/projects/:id/join", // Member join status
  "/api/xpump/twitter-status", // Twitter status updates frequently
  "/api/cache/", // Cache management endpoints
  "/api/snapshot/", // Snapshot endpoints should not be cached
  "/api/blockvision/", // All Blockvision endpoints (blockchain data) should never be cached
  "/api/sui/", // All SUI blockchain endpoints should never be cached
  "/api/wallet/", // All wallet-related endpoints should never be cached
];

/**
 * List of all frontend routes from App.tsx
 * These routes should have longer cache times for better performance
 */
const FRONTEND_ROUTES = [
  "/",
  "/giverep",
  "/giverep/register",
  "/giverep/leaderboard",
  "/giverep/reputation-leaderboard",
  "/giverep/profile/", // Base path for profile
  "/admin",
  "/giverep/circles",
  "/register",
  "/leaderboard",
  "/reputation-leaderboard",
  "/profile/", // Base path for profile
  "/giverep/admin-dashboard",
  "/circles",
  "/giverep/mindshare",
  "/mindshare",
  "/giverep/loyalty",
  "/loyalty",
  "/admin/loyalty",
  "/admin/xpump",
  "/xpump",
  "/xpump/new",
  "/snapshot",
  "/airdrop",
];

/**
 * Check if a URL is a frontend route that should be cached
 * @param url The URL to check
 * @returns true if the URL is a frontend route
 */
function isFrontendRoute(url: string): boolean {
  // If the URL is the root, it's a frontend route
  if (url === "/") return true;

  // API routes are NOT frontend routes
  if (url.startsWith("/api/")) return false;

  // If the URL starts with any of the frontend routes, it's a frontend route
  return FRONTEND_ROUTES.some((route) => {
    // For routes that might have URL parameters (indicated by trailing slash)
    if (route.endsWith("/")) {
      return url.startsWith(route);
    }
    // For exact routes (no URL parameters)
    return url === route || url === `${route}/`;
  });
}

const HIGH_TRAFFIC_ENDPOINTS = [
  // Most frequently hit endpoints based on traffic data
  "/api/loyalty/projects", // Project listing - doesn't change frequently
  "/api/mindshare/projects", // Project listing - doesn't change frequently
  "/api/giverep/reputation/leaderboard", // Reputation rankings - calculated periodically
  "/api/giverep/stats", // Overall statistics - calculated periodically
  "/api/giverep/users", // User listing - doesn't change frequently
  "/favicon.ico", // Static asset

  // Loyalty program endpoints
  "/api/loyalty/projects/", // Individual project details
  "/api/loyalty/projects/:id/leaderboard", // Project leaderboards - updated periodically

  // Mindshare endpoints
  "/api/mindshare/projects/:id", // Individual project details
  "/api/mindshare/projects/:id/tweets", // Project tweets - batch updated
  "/api/mindshare/projects/:id/top-tweet", // Top tweet - changes infrequently
  "/api/mindshare/projects/:id/keywords", // Project keywords - rarely changed

  // RepCircles endpoints
  "/api/rep-circles", // Circles listing
  "/api/rep-circles/trending", // Trending circles

  // GiveRep endpoints
  "/api/giverep/engagement-leaderboard", // Engagement rankings
  "/api/giverep/top-tweet", // Top tweet - changes infrequently
  "/api/giverep/tweets", // Tweet listings
  "/api/giverep/content-quality/leaderboard", // Content quality rankings

  // Reputation endpoints
  "/api/reputation/points", // Reputation points summary
  "/api/reputation/leaderboard", // Reputation rankings

  // XPump endpoints
  "/api/xpump/projects", // XPump projects
  "/api/xpump/trends", // Trend data - updated periodically

  // XWallet endpoints
  "/api/xwallet/token-stats", // Token statistics
  "/api/xwallet/history", // Historical data

  // Blockvision endpoints
  "/api/blockvision/stats", // Blockchain statistics
];

/**
 * Middleware to add cache control headers for Cloudflare and other CDNs
 * This helps with efficient caching while allowing cache busting when needed
 *
 * @param req Express request
 * @param res Express response
 * @param next Express next function
 */
export function setCacheHeaders(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const url = req.url;

  // Track if headers are already set using a Symbol to avoid property name conflicts
  const headerFlagSymbol = Symbol("hasExistingCacheHeaders");
  const headerValueSymbol = Symbol("cacheControlValue");
  (res as any)[headerFlagSymbol] = false;
  (res as any)[headerValueSymbol] = null;

  // Create a custom response.setHeader wrapper to detect if headers are set during request processing
  const originalSetHeader = res.setHeader;
  res.setHeader = function (name: string, value: any) {
    // Check if this is a Cache-Control header being set by a route handler
    if (name.toLowerCase() === "cache-control" && typeof value === "string") {
      // Store the flag that a cache header was explicitly set
      (this as any)[headerFlagSymbol] = true;
      // Store the actual value set by the route handler
      (this as any)[headerValueSymbol] = value;
      // console.log(`[Cloudflare Cache] Detected Cache-Control header for: ${url} - Value: ${value}`);
    }
    return originalSetHeader.call(this, name, value);
  };

  // Check if running in development mode
  const isDev = process.env.NODE_ENV !== "production";

  // In development mode, disable all caching
  if (isDev) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    res.setHeader('CDN-Cache-Control', 'no-store');
    
    // Disabled to reduce console spam
    // if (!url.includes('node_modules') && !url.includes('/@fs/') && !url.includes('/@vite/') && 
    //     !url.match(/\.(js|css|png|jpg|svg)$/) && !url.includes('/@react-refresh')) {
    //   console.log(`[Dev Mode] Disabling cache for: ${url}`);
    // }
    
    // Move on to the next middleware
    return next();
  }

  // PRODUCTION CACHING FOLLOWS BELOW

  // For JS and CSS files (assets), set long cache time
  if (url.match(/\/assets\/.*\.(js|css)(\?.*)?$/)) {
    // Cache for 1 year (immutable is important for hashed assets)
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  }
  // For images and other static assets
  else if (
    url.match(
      /\/assets\/.*\.(jpg|jpeg|png|gif|ico|svg|woff|woff2|ttf|eot)(\?.*)?$/
    )
  ) {
    // Cache for 1 week
    res.setHeader("Cache-Control", "public, max-age=604800");
  }
  // For development files (anything in /src/), don't cache
  else if (url.includes("/src/")) {
    res.setHeader("Cache-Control", "no-store, max-age=0");
  }
  // For HTML files, use a shorter cache time with validation
  // For frontend routes, cache for 3 hours, except for Snapshot
  else if (isFrontendRoute(url)) {
    // Don't cache the snapshot page
    if (url === "/snapshot" || url === "/snapshot/") {
      // Set no-cache headers for Snapshot page
      res.setHeader("Cache-Control", "no-store, max-age=0, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.setHeader("CDN-Cache-Control", "no-store");
    } else {
      // Only use CDN-Cache-Control, removing s-maxage directive
      res.setHeader(
        "Cache-Control",
        `public, max-age=${ASSETS_CACHE_DURATION}`
      );

      // Add Cloudflare-specific cache directive
      res.setHeader(
        "CDN-Cache-Control",
        `public, max-age=${ASSETS_CACHE_DURATION}`
      );

      // Set expiration header
      const expiresDate = new Date(Date.now() + ASSETS_CACHE_DURATION * 1000);
      res.setHeader("Expires", expiresDate.toUTCString());
    }
  }
  // For API responses
  else if (url.startsWith("/api/")) {
    // For GET requests to API
    if (req.method === "GET") {
      // Special case for API assets - cache for 3 hours
      if (url.startsWith("/api/assets/")) {
        // For API assets, use a longer cache time (3 hours)
        // Only use CDN-Cache-Control, removing s-maxage directive
        res.setHeader(
          "Cache-Control",
          `public, max-age=${ASSETS_CACHE_DURATION}`
        );

        // Add Cloudflare-specific cache directive
        res.setHeader(
          "CDN-Cache-Control",
          `public, max-age=${ASSETS_CACHE_DURATION}`
        );

        // Set expiration header
        const expiresDate = new Date(Date.now() + ASSETS_CACHE_DURATION * 1000);
        res.setHeader("Expires", expiresDate.toUTCString());

        return next();
      }

      // First check if this is an endpoint that should never be cached
      const shouldNeverCache = NEVER_CACHE_ENDPOINTS.some((endpoint) => {
        // If the endpoint contains a path parameter (indicated by :)
        if (endpoint.includes(":")) {
          // Replace path parameters with regex pattern
          const regexPattern = endpoint.replace(/:\w+/g, "[^/]+");
          // Create regex to match the URL
          const regex = new RegExp(`^${regexPattern}`);
          return regex.test(url);
        }
        // For regular endpoints, use simple prefix matching
        return url.startsWith(endpoint);
      });

      // If this is an endpoint that should never be cached
      if (shouldNeverCache) {
        // Set no-cache headers
        res.setHeader("Cache-Control", "no-store, max-age=0, must-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
        // Add Cloudflare-specific directive
        res.setHeader("CDN-Cache-Control", "no-store");

        return next();
      }

      // Check if this is a high-traffic endpoint with proper path parameter handling
      const isHighTrafficEndpoint = HIGH_TRAFFIC_ENDPOINTS.some((endpoint) => {
        // If the endpoint contains a path parameter (indicated by :)
        if (endpoint.includes(":")) {
          // Replace path parameters with regex pattern
          const regexPattern = endpoint.replace(/:\w+/g, "[^/]+");
          // Create regex to match the URL
          const regex = new RegExp(`^${regexPattern}`);
          return regex.test(url);
        }
        // For regular endpoints, use simple prefix matching
        return url.startsWith(endpoint);
      });

      if (isHighTrafficEndpoint) {
        // For high-traffic endpoints, use longer cache time (30 minutes)
        // Only use CDN-Cache-Control, removing s-maxage directive
        res.setHeader(
          "Cache-Control",
          `public, max-age=${HIGH_TRAFFIC_CACHE_DURATION}`
        );

        // Add Cloudflare-specific cache directive
        res.setHeader(
          "CDN-Cache-Control",
          `public, max-age=${HIGH_TRAFFIC_CACHE_DURATION}`
        );

        // Set expiration header
        const expiresDate = new Date(
          Date.now() + HIGH_TRAFFIC_CACHE_DURATION * 1000
        );
        res.setHeader("Expires", expiresDate.toUTCString());
      } else {
        // For regular API endpoints, allow some caching (1 minute)
        res.setHeader("Cache-Control", "public, max-age=60");
      }
    } else {
      // For POST/PUT/DELETE, don't cache
      res.setHeader("Cache-Control", "no-store, max-age=0");
    }
  }

  // Add Cloudflare-specific directives for better control
  if (url.match(/\/assets\/.*-[a-z0-9]+\.[a-f0-9]+\.(js|css)(\?.*)?$/)) {
    // Tell Cloudflare to cache even if there are cookies
    res.setHeader("CDN-Cache-Control", "public, max-age=31536000, immutable");
  }

  // Store the original methods
  const originalEnd = res.end;
  const originalWrite = res.write;
  const originalWriteHead = res.writeHead;

  // Track if headers are already sent
  let headersSent = false;

  // Override writeHead to track when headers are sent
  res.writeHead = function (...args: any[]) {
    headersSent = true;
    return (originalWriteHead as any).apply(this, args);
  };

  // Override write to track when content starts flowing (headers sent)
  res.write = function (...args: any[]) {
    headersSent = true;
    return (originalWrite as any).apply(this, args);
  };

  // Replace res.end to check cache headers right before the response is sent
  // Use 'any' to avoid TypeScript errors with function overloads
  (res.end as any) = function (
    this: Response,
    chunk: any,
    encoding?: string | Function,
    callback?: Function
  ) {
    // Only attempt to modify headers if they haven't been sent yet
    if (!headersSent && !this.headersSent) {
      try {
        // Check if any Cache-Control headers were set by route handlers
        if ((this as any)[headerFlagSymbol]) {
          const cacheControlValue = (this as any)[headerValueSymbol];

          // Respect the explicit Cache-Control value set by the route handler
          if (cacheControlValue) {
            this.setHeader("Cache-Control", cacheControlValue);

            // For no-cache/private values, add additional related headers for complete protection
            if (
              typeof cacheControlValue === "string" &&
              (cacheControlValue.includes("private") ||
                cacheControlValue.includes("no-store") ||
                cacheControlValue.includes("no-cache"))
            ) {
              // Add additional related headers to ensure consistent caching behavior
              this.setHeader("Pragma", "no-cache");
              this.setHeader("Expires", "0");
              this.setHeader("Surrogate-Control", "no-store");
              this.setHeader("CDN-Cache-Control", "no-store");
            } else {
              // For public caching headers, make sure CDN-Cache-Control is set to match
              if (
                typeof cacheControlValue === "string" &&
                cacheControlValue.includes("public")
              ) {
                this.setHeader("CDN-Cache-Control", cacheControlValue);
              }
            }
          }
        }
      } catch (error) {
        // If we get an error trying to set headers, silently continue
      }
    }

    // Call the original end method correctly based on arguments provided
    // Cast to any to avoid TypeScript errors with the different function signature overloads
    const end = originalEnd as any;

    if (typeof encoding === "function") {
      // Handle the case where the second argument is actually the callback
      return end.call(this, chunk, undefined, encoding);
    } else if (encoding !== undefined && callback !== undefined) {
      return end.call(this, chunk, encoding, callback);
    } else if (encoding !== undefined) {
      return end.call(this, chunk, encoding);
    } else {
      return end.call(this, chunk);
    }
  };

  next();
}
