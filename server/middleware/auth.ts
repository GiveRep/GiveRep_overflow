import { Request, Response, NextFunction } from "express";

/**
 * Middleware to check if the request has valid admin authentication
 * Supports multiple authentication methods for maximum compatibility
 * 
 * 🌟 PREFERRED METHOD: Authorization Bearer header
 * Example: headers: { "Authorization": "Bearer <admin_password>" }
 * 
 * Other supported methods (for backwards compatibility):
 * - Session-based auth
 * - Query parameters (?adminPassword=<password>)
 * - Headers (Admin-Password, X-Admin-Password)
 * - Request body password field
 */
export function isAdmin(req: Request, res: Response, next: NextFunction) {
  // Check if user is already authenticated as admin via session
  if (req.session && (req.session.adminPassword === process.env.ADMIN_PASSWORD || req.session.isAdmin)) {
    console.log("Admin authenticated via session");
    next();
    return;
  }
  
  // Check if this is a Replit environment with admin access
  if (process.env.REPLIT_ENV && req.headers['x-replit-user-id']) {
    console.log("Admin authenticated via Replit environment");
    // Store admin status in session for future requests
    if (req.session) {
      req.session.isAdmin = true;
    }
    next();
    return;
  }

  // Fall back to header-based authentication
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    console.error("ADMIN_PASSWORD environment variable not set");
    return res.status(500).json({
      success: false,
      error: "Server authentication configuration error",
    });
  }

  // Check query parameter first (mainly for testing)
  const queryAdminPw = req.query.adminPassword as string;
  if (queryAdminPw === adminPassword) {
    console.log("Admin authenticated via query parameter");
    // Store in session for future requests
    if (req.session) {
      req.session.adminPassword = adminPassword;
    }
    next();
    return;
  }

  // Support multiple admin authentication header formats
  const directAdminHeader = req.headers["admin-password"];
  const xAdminHeader = req.headers["x-admin-password"];
  const authHeader = req.headers.authorization;

  // Log details about this authentication attempt
  console.log("Admin auth attempt:", {
    session: req.session ? "present" : "missing",
    sessionAdminPw: req.session?.adminPassword ? "present" : "missing",
    queryParams: Object.keys(req.query),
    headerKeys: Object.keys(req.headers),
  });

  // Check both variants of the Admin-Password header
  if (directAdminHeader && String(directAdminHeader) === adminPassword) {
    console.log("Admin authenticated via direct Admin-Password header");
    // Store in session for future requests
    if (req.session) {
      req.session.adminPassword = adminPassword;
    }
    next();
    return;
  }

  // Check X-Admin-Password header
  if (xAdminHeader && String(xAdminHeader) === adminPassword) {
    console.log("Admin authenticated via X-Admin-Password header");
    // Store in session for future requests
    if (req.session) {
      req.session.adminPassword = adminPassword;
    }
    next();
    return;
  }

  // Then check Authorization Bearer token
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];

    if (token === adminPassword) {
      console.log("Admin authenticated via Bearer token");
      // Store in session for future requests
      if (req.session) {
        req.session.adminPassword = adminPassword;
      }
      next();
      return;
    }
  }

  // Check request body password (for POST/PUT requests)
  const { password } = req.body;
  if (password && password === adminPassword) {
    console.log("Admin authenticated via request body password");
    // Store in session for future requests
    if (req.session) {
      req.session.adminPassword = adminPassword;
    }
    next();
    return;
  }

  // If we get here, authentication failed
  return res.status(401).json({
    success: false,
    error: "Authentication required",
  });
}
