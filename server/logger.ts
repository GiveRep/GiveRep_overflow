/**
 * Logger utility for server-side logging
 */

// Simple logger function
export const logger = {
  info: (message: string): void => {
    console.log(`[INFO] ${message}`);
  },
  
  warn: (message: string): void => {
    console.warn(`[WARN] ${message}`);
  },
  
  error: (message: string): void => {
    console.error(`[ERROR] ${message}`);
  },
  
  debug: (message: string): void => {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[DEBUG] ${message}`);
    }
  }
};