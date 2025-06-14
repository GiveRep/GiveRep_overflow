import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

// Rate limiter for manual tweet addition endpoint
export const manualTweetRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each user to 10 requests per windowMs
  message: 'Too many manual tweet additions from this IP, please try again later.',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  // Use Twitter handle from request body (will be verified by endpoint)
  keyGenerator: (req: Request): string => {
    // For rate limiting, we'll use IP first and then switch to Twitter handle after verification
    // This prevents the rate limiter from blocking requests before body parsing
    return req.ip || 'unknown';
  },
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error: 'Too many requests. You can only add 10 tweets manually every 15 minutes.',
      reputationEligible: false,
      reputationMessage: 'Rate limit exceeded'
    });
  }
});

// General API rate limiter (more lenient)
export const generalApiRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // Limit each IP to 100 requests per minute
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict rate limiter for sensitive endpoints
export const strictRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Only 5 requests per 15 minutes
  message: 'Too many requests for this sensitive operation, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});