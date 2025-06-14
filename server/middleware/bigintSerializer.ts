import { Request, Response, NextFunction } from 'express';

/**
 * Middleware to handle BigInt serialization in JSON responses
 * This middleware replaces the default JSON serializer to convert BigInt values to strings
 * and also ensures Twitter IDs maintain their precision
 */
export function bigintSerializerMiddleware(req: Request, res: Response, next: NextFunction) {
  // Store the original json method
  const originalJson = res.json;
  
  // Override the json method with our custom implementation
  res.json = function(body: any) {
    try {
      // Process the body to ensure all BigInts and large Twitter IDs are handled correctly
      const processedBody = preprocessObjectWithBigInt(body);
      
      // Convert the processed body to a string with a custom replacer function
      const serializedBody = JSON.stringify(processedBody, (key, value) => {
        // Check if the value is a BigInt and convert it to a string
        if (typeof value === 'bigint') {
          return value.toString();
        }
        return value;
      });
      
      // Set the content type to application/json
      res.setHeader('Content-Type', 'application/json');
      
      // Send the serialized body
      return res.send(serializedBody);
    } catch (error) {
      console.error('Error serializing response with BigInt values:', error);
      // Fall back to original behavior if there's an error
      return originalJson.call(this, body);
    }
  };
  
  next();
}

/**
 * Recursively process an object to handle BigInt values and ensure Twitter IDs have correct precision
 * @param obj The object to process
 * @returns Processed object with BigInts as strings and Twitter IDs with correct precision
 */
export function preprocessObjectWithBigInt(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }
  // Handle Date objects
  if (obj instanceof Date) {
    return obj;
  }
  
  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map(item => preprocessObjectWithBigInt(item));
  }
  
  // Handle objects
  if (typeof obj === 'object') {
    // If object has no enumerable properties, return it as is
    if (Object.keys(obj).length === 0) {
      return obj;
    }
    
    const result: any = {};
    
    for (const [key, value] of Object.entries(obj)) {
      // Special handling for Twitter IDs to ensure precision
      if (key === 'twitter_id' && typeof value === 'number' && !Number.isSafeInteger(value)) {
        // If it's a Twitter ID that's a large number exceeding safe integer limits,
        // convert it to a string to maintain precision
        result[key] = String(value);
      } else if (typeof value === 'bigint') {
        // Convert BigInt to string
        result[key] = value.toString();
      } else if (value instanceof Date) {
        // Keep Date objects as is
        result[key] = value;
      } else if (typeof value === 'object') {
        // Recursively process nested objects
        result[key] = preprocessObjectWithBigInt(value);
      } else {
        // Keep other values as is
        result[key] = value;
      }
    }
    
    return result;
  }
  
  // Return primitive values as is
  return obj;
}