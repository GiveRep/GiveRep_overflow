import { Request, Response, NextFunction } from 'express';
import path from 'path';

/**
 * Middleware to set appropriate cache control headers for static assets
 * This will tell Cloudflare how long to cache different types of resources
 */
export function setCacheControlHeaders(req: Request, res: Response, next: NextFunction) {
  const url = req.url;
  
  // Set cache headers for built JS/CSS files
  if (url.match(/\.(js|css)(\?.*)?$/) && !url.includes('/src/')) {
    // Cache for 1 week (604800 seconds)
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
  } 
  // Set cache headers for images and other static assets
  else if (url.match(/\.(jpg|jpeg|png|gif|ico|svg|woff|woff2|ttf|eot)(\?.*)?$/)) {
    // Cache for 1 week (604800 seconds)
    res.setHeader('Cache-Control', 'public, max-age=604800');
  } 
  // For development files (anything in /src/), don't cache
  else if (url.includes('/src/')) {
    res.setHeader('Cache-Control', 'no-store, max-age=0');
  }
  // For HTML files, use a shorter cache time with validation
  else if (url.endsWith('.html') || url === '/') {
    // Cache for 10 minutes (600 seconds) but validate with server
    res.setHeader('Cache-Control', 'public, max-age=600, must-revalidate');
  }
  
  next();
}