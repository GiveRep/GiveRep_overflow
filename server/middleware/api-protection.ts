import { Request, Response, NextFunction } from "express";

/**
 * Middleware to protect API routes from unauthorized external access
 * This prevents API scraping or unauthorized usage of internal services
 */
export const requireApiAccess = (req: Request, res: Response, next: NextFunction) => {
  // Special handling for localhost during development
  if (req.hostname === 'localhost' || req.hostname === '0.0.0.0' || req.hostname === '127.0.0.1') {
    // Only allow local requests if they have no external origin or the origin is also localhost
    const origin = req.headers.origin || '';
    if (!origin || origin.includes('localhost')) {
      return next();
    }
  }
  
  // Get request headers for authorization check
  const referer = req.headers.referer || '';
  const origin = req.headers.origin || '';
  
  // Allow access from our app domains
  const allowedDomains = [
    'localhost',
    'giverep.com',
    'www.giverep.com',
    '.replit.app',
    '.replit.dev',
    '6ab2f303-c58a-473a-aef4-1da6b9a51e0e-00-34vk1shkioluh.riker.replit.dev'
  ];
  
  // Check if the request is from an allowed source
  const isAllowedOrigin = allowedDomains.some(domain => 
    (origin && origin.includes(domain)) || (referer && referer.includes(domain))
  );
  
  // For API requests made programmatically, check for API key
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;
  const validApiKey = process.env.INTERNAL_API_KEY;
  const hasValidApiKey = apiKey === validApiKey;
  
  // Also check if this is a request from our own server-side code
  const userAgent = req.headers['user-agent'] || '';
  const isServerSideRequest = userAgent.includes('node-fetch') || userAgent.includes('axios');
  
  // Check if user is authenticated via session
  const isAuthenticated = req.session && (req.session as any).user !== undefined;
  
  // Log more details for debugging
  console.log(`[API Protection] Checking request to ${req.path}:
  - Origin: ${origin || 'none'}
  - Referer: ${referer || 'none'}
  - User-Agent: ${userAgent || 'none'}
  - isAllowedOrigin: ${isAllowedOrigin}
  - hasValidApiKey: ${hasValidApiKey}
  - isServerSideRequest: ${isServerSideRequest}
  - isAuthenticated: ${isAuthenticated}
  `);
  
  // Allow access if any of our conditions are met
  if (isAllowedOrigin || hasValidApiKey || isServerSideRequest || isAuthenticated) {
    return next();
  } else {
    console.warn(`[API Protection] Blocked unauthorized access to ${req.path} from ${origin || 'unknown origin'}`);
    return res.status(403).json({
      success: false,
      error: "Unauthorized access. This API is for internal use only."
    });
  }
};