import { Request, Response, NextFunction } from "express";

/**
 * Global error handler middleware
 */
export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Log the error
  console.error("Error in request:", {
    method: req.method,
    url: req.url,
    error: err.message,
    code: err.code,
    stack: err.stack
  });

  // Handle read replica conflicts
  if (err.code === '40001' && err.message?.includes('conflict with recovery')) {
    return res.status(503).json({
      error: "Database temporarily unavailable",
      message: "The database is currently synchronizing. Please try again in a moment.",
      code: "READ_REPLICA_CONFLICT"
    });
  }

  // Handle other database errors
  if (err.code?.startsWith('4') || err.code?.startsWith('5')) {
    return res.status(500).json({
      error: "Database error",
      message: "A database error occurred. Please try again later.",
      code: err.code
    });
  }

  // Default error response
  res.status(err.status || 500).json({
    error: err.message || "Internal server error",
    message: "An unexpected error occurred"
  });
}

/**
 * Handle unhandled promise rejections
 */
export function setupProcessErrorHandlers() {
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
}