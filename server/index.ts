import cluster from "cluster";
import pgSession from "connect-pg-simple";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import express, { NextFunction, type Request, Response } from "express";
import session from "express-session";
import cron from "node-cron";
import { pool } from "../db/index";
import { setupTwitterUserInfoCleanupJob } from "./cron/cleanup-twitter-user-info";
import {
  bigintSerializerMiddleware,
  preprocessObjectWithBigInt,
} from "./middleware/bigintSerializer";
import { cacheBustMiddleware } from "./middleware/cacheBust";
import { setCacheHeaders } from "./middleware/cacheMiddleware";
import { requestTimingMiddleware } from "./middleware/requestTimingMiddleware";
import { responseHeadersMiddleware } from "./middleware/responseHeadersMiddleware";
import { registerRoutes } from "./routes";
import { startMetricsRefreshScheduler } from "./schedulers/metrics-refresh-scheduler";
import { LoyaltyService } from "./services/loyalty-service";
import { initializeCache } from "./utils/cache";
import { log, serveStatic, setupVite } from "./vite";

// Load environment variables from .env file
dotenv.config();

// Debug: Check if environment variables are loaded correctly
console.log("Environment variables loaded:");
console.log("- Database URL defined:", !!process.env.DATABASE_URL);
console.log("- Apify API Token defined:", !!process.env.APIFY_API_TOKEN);

// Setup process error handlers to prevent crashes from read replica conflicts
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit the process for read replica conflicts
  if (reason && typeof reason === 'object' && 'code' in reason) {
    const error = reason as any;
    if (error.code === '40001' && error.message?.includes('conflict with recovery')) {
      console.warn('Ignoring read replica conflict in unhandled rejection');
      return;
    }
  }
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Don't exit for read replica conflicts
  if (error && 'code' in error) {
    const dbError = error as any;
    if (dbError.code === '40001' && dbError.message?.includes('conflict with recovery')) {
      console.warn('Ignoring read replica conflict in uncaught exception');
      return;
    }
  }
  // For other errors, exit after logging
  process.exit(1);
});
console.log(
  "- Apify API Token:",
  process.env.APIFY_API_TOKEN
    ? `${process.env.APIFY_API_TOKEN.substring(0, 5)}...`
    : "undefined"
);
console.log("- Admin Password defined:", !!process.env.ADMIN_PASSWORD);

const app = express();
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Apply cache control headers for static assets and API responses
app.use(setCacheHeaders);

// Apply cache busting for HTML responses to handle hashed asset filenames
app.use(cacheBustMiddleware);

// Apply response headers middleware to set no-cache headers in development mode
app.use(responseHeadersMiddleware);

// Apply proper MIME type headers for JavaScript modules
app.use((req, res, next) => {
  // For module scripts, ensure the correct content type
  if (req.path.endsWith(".js") || req.path.includes(".js?")) {
    res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  } else if (req.path.endsWith(".mjs") || req.path.includes(".mjs?")) {
    res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  } else if (req.path.includes("/assets/") && req.path.includes(".js")) {
    res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  }

  // For JSON responses
  if (req.path.endsWith(".json") || req.path.includes(".json?")) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
  }

  // For CSS files
  if (req.path.endsWith(".css") || req.path.includes(".css?")) {
    res.setHeader("Content-Type", "text/css; charset=utf-8");
  }

  next();
});

// Add health check middleware that doesn't interfere with the frontend routing
// This is specifically for deployment health checks that look for 200 responses at "/"
app.use((req, res, next) => {
  // For HEAD requests (used by Replit health checks), return 200 immediately
  if (req.method === "HEAD" && req.path === "/") {
    return res.status(200).end();
  }

  // If it's a GET request from a health check user agent, return 200 but don't send content
  // This allows the frontend to still work normally for regular users
  if (
    req.method === "GET" &&
    req.path === "/" &&
    req.headers["user-agent"] &&
    (req.headers["user-agent"].includes("HealthCheck") ||
      req.headers["user-agent"].includes("health") ||
      req.headers["user-agent"].includes("Replit"))
  ) {
    return res.status(200).end();
  }

  // For all other requests (regular user traffic), pass through to normal routes
  next();
});

// Initialize PostgreSQL session store
const PostgreSQLStore = pgSession(session);

// Enhanced session configuration for better persistence and debugging
app.use(
  session({
    store: new PostgreSQLStore({
      pool: pool,
      tableName: "sessions", // Create this table if it doesn't exist
      createTableIfMissing: true,
      ttl: 3600, // 1 hour session timeout
      // Enable error logging for session store
      errorLog: (error) => {
        console.error("PostgreSQL session store error:", error);
      },
    }),
    secret: process.env.SESSION_SECRET || "giverep-secret",
    resave: true, // Explicitly save on all requests
    saveUninitialized: true, // Save empty sessions
    rolling: true, // Reset expiration on each response
    cookie: {
      secure: false, // Set to false for development even if NODE_ENV is production
      sameSite: "lax",
      httpOnly: true,
      maxAge: 3600000, // 1 hour
      path: "/", // Ensure the cookie is available across all paths
    },
    name: "giverep.sid",
  })
);

// Session setup complete

// Session debugging middleware has been removed to reduce console noise

// Add the request timing middleware
app.use(requestTimingMiddleware);

// Debug middleware for routing issues
app.use((req, res, next) => {
  if (req.method === 'PUT' && req.path.includes('/loyalty/projects/')) {
    console.log('[ROUTING DEBUG] PUT request to loyalty project:', {
      path: req.path,
      originalUrl: req.originalUrl,
      baseUrl: req.baseUrl,
      method: req.method,
      headers: {
        authorization: req.headers.authorization ? 'Present' : 'None',
        contentType: req.headers['content-type']
      },
      body: req.body
    });
  }
  next();
});

// Add the BigInt serializer middleware to handle BigInt in JSON responses
app.use(bigintSerializerMiddleware);

// Legacy response logging middleware (keeping for backward compatibility)
// This is now mainly for Vite's internal logging system
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;

    // Define polling endpoints to skip from regular logging
    const pollingEndpoints = [
      "/api/xpump/tweets",
      "/api/xpump/twitter-status",
      "/api/xpump/buy-intent-tweets",
      "/api/xpump/admin-status",
      "/api/xpump/twitter-rules",
    ];

    // If it's a polling endpoint, only log it if there's an error (4xx or 5xx)
    // For all other endpoints, log normally
    const isPollingEndpoint = pollingEndpoints.includes(path);
    const isErrorResponse = res.statusCode >= 400; // 4xx and 5xx are error responses

    // Only log to Vite's internal logging for now (new middleware handles the console)
    if (path.startsWith("/api") && (!isPollingEndpoint || isErrorResponse)) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(
          preprocessObjectWithBigInt(capturedJsonResponse)
        )}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      // Send to Vite's internal logging system
      log(logLine);
    }
  });

  next();
});

let isServerInitialized = false;

(async () => {
  // Prevent multiple server initializations
  if (isServerInitialized) {
    console.log("Server already initialized, skipping...");
    return;
  }
  isServerInitialized = true;

  const server = registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    // Handle read replica conflicts
    if (err.code === '40001' && err.message?.includes('conflict with recovery')) {
      console.warn('Read replica conflict in error handler:', err.message);
      res.status(503).json({ 
        message: "Database temporarily unavailable. Please try again in a moment.",
        code: "READ_REPLICA_CONFLICT"
      });
      return; // Don't throw the error again
    }

    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    
    // Only throw non-database conflict errors
    if (err.code !== '40001') {
      throw err;
    }
  });

  // Import our environment detection utility
  const { isProduction } = await import("./utils/environment");

  // In Replit development environment, we always use Vite's dev server
  // This ensures hot reload works in development

  // Explicitly set NODE_ENV to development in Replit IDE to ensure
  // all caching is disabled and we always see latest changes
  if (process.env.REPL_ID && process.env.NODE_ENV !== "production") {
    process.env.NODE_ENV = "development";
  }

  const isProd = isProduction(); // Get environment from our utility
  const expressEnv = app.get("env");

  console.log(
    `[ENV] Environment detection: Express env=${expressEnv}, NODE_ENV=${process.env.NODE_ENV}, isProd=${isProd}`
  );

  // Only use production mode when explicitly in production environment
  if (isProd) {
    console.log("[ENV] Production environment detected, serving static build");
    serveStatic(app);
  } else {
    // Default to development mode with Vite HMR in all other cases
    console.log("[ENV] Development environment detected, setting up Vite HMR");
    await setupVite(app, server);
  }

  // Initialize the Redis cache
  await initializeCache();

  // Temporary disabled all schedulers as they will be executed via script deployment respectively, but don't delete these code
  // // Initialize the schedulers
  // startGiveRepScheduler(); // Primary scheduler for tweet collection

  // // Reputation schedulers - prefer the new one but keep the old one for backward compatibility
  // startReputationScheduler(); // New standardized reputation scheduler
  // // startGiveRepReputationScheduler(); // Legacy GiveRep reputation scheduler (disabled)

  // // Start InsideX trading data scheduler
  // startInsideXScheduler(); // Updates trading PnL data from InsideX

  // // Start XPump tweet processing scheduler
  // startXPumpScheduler(); // Processes any unanalyzed tweets at regular intervals

  // Only run schedulers in production on the first worker (worker.id === 1)
  // This prevents duplicate cron jobs and schedulers in multi-instance deployments
  // Note: cluster.worker.id starts from 1, not 0
  const isFirstWorker = !cluster.worker || cluster.worker.id === 1;
  const shouldRunSchedulers = isProd && isFirstWorker;

  if (shouldRunSchedulers) {
    console.log("[SCHEDULER] Starting schedulers on primary instance...");

    // Start metrics refresh scheduler (this one is lightweight and can run in the main process)
    // It keeps materialized views up-to-date for better API performance
    startMetricsRefreshScheduler();

    // Start Twitter user info cleanup job (runs weekly to remove old data)
    // This is lightweight and helps keep the database size under control
    setupTwitterUserInfoCleanupJob();
    
    // Start a simple cron to deactivate expired loyalty projects
    // Runs every hour to check for projects that have passed their end_time
    const loyaltyService = new LoyaltyService();
    cron.schedule("0 * * * *", async () => {
      try {
        console.log("[SCHEDULER] Checking for expired loyalty projects");
        const deactivatedCount = await loyaltyService.deactivateExpiredProjects();
        if (deactivatedCount > 0) {
          console.log(`[SCHEDULER] Deactivated ${deactivatedCount} expired loyalty projects`);
        }
      } catch (error) {
        console.error("[SCHEDULER] Error deactivating expired projects:", error);
      }
    });
  } else {
    const workerInfo = cluster.worker
      ? `worker ${cluster.worker.id}`
      : "master process";
    console.log(
      `[SCHEDULER] Skipping schedulers - ${workerInfo}, not primary instance or in development`
    );
  }

  // Default to port 5000 for Replit workflow compatibility, but allow override via environment
  // this serves both the API and the client
  const PORT = parseInt(process.env.PORT || "5000");
  const ALTERNATIVE_PORT = PORT + 1;

  // Try to start on the default port first
  try {
    // First attempt on the main port
    const serverInstance = server.listen(PORT, "0.0.0.0", () => {
      log(`Server running on port ${PORT}`);
    });

    // Set up graceful shutdown process to properly close database connections
    const gracefulShutdown = async () => {
      console.log("Received shutdown signal, closing connections...");

      try {
        // Close the database pool
        try {
          await pool.end();
          console.log("Database pool has been closed");
        } catch (err) {
          // Pool might already be closed, that's okay
          console.log(
            "Database pool was already closed or failed to close:",
            err
          );
        }

        // Close the HTTP server
        serverInstance.close(() => {
          console.log("HTTP server has been closed");
          // Reset initialization flag for hot-reload
          isServerInitialized = false;
          process.exit(0);
        });

        // Force exit after 3 seconds if server won't close gracefully (reduced timeout for faster hot-reload)
        setTimeout(() => {
          console.log("Forcing server shutdown after timeout");
          isServerInitialized = false;
          process.exit(1);
        }, 3000);
      } catch (err) {
        console.error("Error during graceful shutdown:", err);
        isServerInitialized = false;
        process.exit(1);
      }
    };

    // Listen for termination signals
    process.on("SIGTERM", gracefulShutdown);
    process.on("SIGINT", gracefulShutdown);

    // Handle port conflicts
    serverInstance.on("error", (err: any) => {
      if (err.code === "EADDRINUSE") {
        console.log(
          `Port ${PORT} is already in use. Using alternate port ${ALTERNATIVE_PORT}...`
        );

        // Use the alternative port
        const alternateServer = server.listen(
          ALTERNATIVE_PORT,
          "0.0.0.0",
          () => {
            log(`Server running on alternate port ${ALTERNATIVE_PORT}`);
          }
        );

        // Set up same shutdown handlers for alternate server
        const alternateShutdown = async () => {
          console.log(
            "Received shutdown signal for alternate server, closing connections..."
          );
          try {
            try {
              await pool.end();
              console.log("Database pool has been closed (alternate server)");
            } catch (err) {
              console.log(
                "Database pool was already closed or failed to close (alternate):",
                err
              );
            }
            alternateServer.close(() => {
              isServerInitialized = false;
              process.exit(0);
            });
            setTimeout(() => {
              isServerInitialized = false;
              process.exit(1);
            }, 3000);
          } catch (err) {
            console.error("Error during alternate server shutdown:", err);
            isServerInitialized = false;
            process.exit(1);
          }
        };

        process.on("SIGTERM", alternateShutdown);
        process.on("SIGINT", alternateShutdown);
      } else {
        console.error(`Failed to start server: ${err.message}`);
      }
    });
  } catch (err) {
    console.error(`Error starting server: ${err}`);

    // Last resort - try the alternative port
    try {
      const fallbackServer = server.listen(ALTERNATIVE_PORT, "0.0.0.0", () => {
        log(`Server running on fallback port ${ALTERNATIVE_PORT}`);
      });

      // Set up graceful shutdown for fallback server too
      process.on("SIGTERM", async () => {
        console.log(
          "Received shutdown signal for fallback server, closing connections..."
        );
        await pool.end();
        fallbackServer.close(() => process.exit(0));
        setTimeout(() => process.exit(1), 5000);
      });
      process.on("SIGINT", async () => {
        console.log(
          "Received interrupt for fallback server, closing connections..."
        );
        await pool.end();
        fallbackServer.close(() => process.exit(0));
        setTimeout(() => process.exit(1), 5000);
      });
    } catch (fallbackErr) {
      console.error(`Failed to start server on fallback port: ${fallbackErr}`);
    }
  }
})();