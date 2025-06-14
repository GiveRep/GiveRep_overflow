/**
 * Middleware to modify response headers
 * Sets cache-control headers to disable caching when in development environment
 */
import { Request, Response, NextFunction } from 'express';

/**
 * Helper function to determine if we're in development mode
 * Checks REPLIT_ENV first, then falls back to NODE_ENV
 */
function isDevEnvironment(): boolean {
  // First check REPLIT_ENV if available
  if (process.env.REPLIT_ENV) {
    return process.env.REPLIT_ENV === 'development';
  }
  
  // Otherwise fall back to NODE_ENV
  return process.env.NODE_ENV !== 'production';
}

/**
 * Middleware that modifies response headers after the API has processed a request
 * Adds no-cache headers when in development environment
 * Adds proper MIME type headers for different file types
 */
export const responseHeadersMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Add an onFinish handler to set headers just before the response is sent
  res.on('finish', () => {
    // Log environment detection (useful for debugging)
    // Disabled to reduce console spam
    // console.log(`[Headers] Response for ${req.path} - Environment: ${isDevEnvironment() ? 'development' : 'production'}`);
  });
  
  // Set proper MIME types for various content types
  // This is critical for module scripts to load correctly
  const path = req.path.toLowerCase();
  
  // Javascript files
  if (path.endsWith('.js') || path.includes('.js?') || 
      (path.includes('/assets/') && path.includes('.js'))) {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  }
  // JavaScript modules
  else if (path.endsWith('.mjs') || path.includes('.mjs?')) {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  }
  // JSON files
  else if (path.endsWith('.json') || path.includes('.json?')) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
  }
  // CSS files
  else if (path.endsWith('.css') || path.includes('.css?')) {
    res.setHeader('Content-Type', 'text/css; charset=utf-8');
  }
  // SVG files
  else if (path.endsWith('.svg') || path.includes('.svg?')) {
    res.setHeader('Content-Type', 'image/svg+xml');
  }
  
  // Check if we're in development mode
  if (isDevEnvironment()) {
    // Disable all caching in development mode
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    
    // Add environment indicator header
    res.setHeader('X-Environment', 'development');
  }
  
  next();
};