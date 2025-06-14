import { Request, Response, NextFunction } from 'express';

/**
 * Middleware to log the time taken to process each request
 * 
 * @param req Express request object
 * @param res Express response object
 * @param next Next middleware function
 */
export const requestTimingMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Skip timing for non-API routes or static assets
  if (!req.path.startsWith('/api')) {
    return next();
  }

  // Record start time
  const start = process.hrtime();
  
  // Store the original end method
  const originalEnd = res.end;
  
  // Override end method to calculate and log timing
  // @ts-ignore - We're monkey patching res.end
  res.end = function(chunk?: any, encoding?: BufferEncoding) {
    // Calculate elapsed time
    const diff = process.hrtime(start);
    const time = diff[0] * 1000 + diff[1] / 1000000; // Convert to milliseconds
    
    // Format to 2 decimal places
    const timeFormatted = time.toFixed(2);
    
    // Format query parameters for GET requests
    const query = Object.keys(req.query).length > 0 
      ? `?${new URLSearchParams(req.query as Record<string, string>).toString()}`
      : '';
      
    // Color coding based on response time
    let timeColor = '\x1b[32m'; // Green for fast responses (< 500ms)
    let timeSymbol = '⚡'; // Fast
    
    if (time > 2000) {
      timeColor = '\x1b[31m'; // Red for very slow responses (> 2s)
      timeSymbol = '🐢'; // Very slow
    } else if (time > 1000) {
      timeColor = '\x1b[33m'; // Yellow for slow responses (> 1s)
      timeSymbol = '⏱️'; // Slow
    } else if (time > 500) {
      timeColor = '\x1b[36m'; // Cyan for medium responses (> 500ms)
      timeSymbol = '⏳'; // Medium
    }
    
    let bodyInfo = '';
    // For POST/PUT requests, summarize the body
    if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
      try {
        // Truncate large request bodies to avoid console spam
        const keys = Object.keys(req.body);
        if (keys.length > 0) {
          const truncatedBody = keys.length > 3 
            ? `${keys.slice(0, 3).join(', ')}... (${keys.length} fields)` 
            : keys.join(', ');
          bodyInfo = ` with payload: {${truncatedBody}}`;
        }
      } catch (e) {
        bodyInfo = ' with payload: [Error parsing body]';
      }
    }
    
    // Log with format [METHOD] /path -> STATUS CODE (time ms)
    console.log(
      `${timeSymbol} [API Timing] ${req.method} ${req.originalUrl.replace(/^\/api/, '')}${bodyInfo} -> ${res.statusCode} in ${timeColor}${timeFormatted}ms\x1b[0m`
    );
    
    // Call the original end method
    return originalEnd.apply(res, arguments as any);
  };
  
  next();
};