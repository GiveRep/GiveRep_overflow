/**
 * Utility functions for environment detection
 */

// For our project, we'll define development and production explicitly:
// - Always use Vite's dev server in the Replit IDE
// - When deployed to production, use static files

/**
 * Determines if the application is running in a production environment
 * @returns {boolean} True if in production, false if in development
 */
export function isProduction(): boolean {
  // Force development mode while in Replit IDE
  // This is the most reliable way to ensure hot reloading works here
  
  // This will be true in production (when site is deployed)
  // and false in development (in Replit IDE)
  const isProd = process.env.NODE_ENV === "production";
  
  // Log environment detection info
  console.log(`[ENV] Environment check: NODE_ENV=${process.env.NODE_ENV}`);
  console.log(`[ENV] Using ${isProd ? 'PRODUCTION' : 'DEVELOPMENT'} mode`);
  
  // For GiveRep, we'll explicitly check NODE_ENV only
  // This way, we can control the behavior by setting the environment variable
  return isProd;
}

/**
 * Determines if the application is running in a development environment
 * @returns {boolean} True if in development, false if in production
 */
export function isDevelopment(): boolean {
  return !isProduction();
}