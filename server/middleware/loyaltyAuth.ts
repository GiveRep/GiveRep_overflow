import { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import { db } from "../../db/index";
import { loyaltyProjects } from "../../db/loyalty_schema";
import { eq } from "drizzle-orm";

// Extend Express Request type to include loyaltyProjectId
declare global {
  namespace Express {
    interface Request {
      loyaltyProjectId?: number;
      isLoyaltyManager?: boolean;
    }
  }
}

// Extend express-session to include loyalty projects
declare module "express-session" {
  interface Session {
    adminPassword?: string;
    isAdmin?: boolean;
    loyaltyProjects?: Record<number, boolean>;
  }
}

/**
 * Check if the password matches the admin password
 */
async function checkAdminAuth(password: string): Promise<boolean> {
  const adminPassword = process.env.ADMIN_PASSWORD;
  return adminPassword ? password === adminPassword : false;
}

/**
 * Check if the password matches the loyalty project password
 */
async function checkLoyaltyProjectAuth(projectId: number, password: string): Promise<boolean> {
  try {
    const [project] = await db
      .select({ password_hash: loyaltyProjects.password_hash })
      .from(loyaltyProjects)
      .where(eq(loyaltyProjects.id, projectId))
      .limit(1);

    if (!project?.password_hash) {
      return false;
    }

    return await bcrypt.compare(password, project.password_hash);
  } catch (error) {
    console.error("Error checking loyalty project auth:", error);
    return false;
  }
}

/**
 * Extract password from various sources in the request
 */
function extractPassword(req: Request): string | null {
  // Check Authorization Bearer header (preferred)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.split(" ")[1];
  }

  // Check X-Admin-Password header
  const xAdminHeader = req.headers["x-admin-password"];
  if (xAdminHeader) {
    return String(xAdminHeader);
  }

  // Check Admin-Password header
  const adminHeader = req.headers["admin-password"];
  if (adminHeader) {
    return String(adminHeader);
  }

  // Check X-Loyalty-Password header (new for loyalty managers)
  const xLoyaltyHeader = req.headers["x-loyalty-password"];
  if (xLoyaltyHeader) {
    return String(xLoyaltyHeader);
  }

  // Check query parameter
  const queryPassword = req.query.adminPassword || req.query.loyaltyPassword || req.query.manager_password;
  if (queryPassword) {
    return String(queryPassword);
  }

  // Check session
  if (req.session?.adminPassword) {
    return req.session.adminPassword;
  }

  // Check request body
  if (req.body?.password) {
    return req.body.password;
  }

  return null;
}

/**
 * Middleware to check if the request has valid admin OR loyalty project manager authentication
 * This middleware is specifically for loyalty project routes where either admin or project manager can access
 */
export function isAdminOrLoyaltyManager(req: Request, res: Response, next: NextFunction) {
  // Extract project ID from route params or request body
  const projectId = parseInt(req.params.projectId || req.params.id || req.body?.projectId);
  
  if (isNaN(projectId)) {
    return res.status(400).json({
      success: false,
      error: "Invalid project ID",
    });
  }

  // Store project ID in request for later use
  req.loyaltyProjectId = projectId;

  // Check if already authenticated as admin via session
  if (req.session && (req.session.adminPassword === process.env.ADMIN_PASSWORD || req.session.isAdmin)) {
    console.log("Admin authenticated via session");
    next();
    return;
  }

  // Check Replit environment
  if (process.env.REPLIT_ENV && req.headers['x-replit-user-id']) {
    console.log("Admin authenticated via Replit environment");
    if (req.session) {
      req.session.isAdmin = true;
    }
    next();
    return;
  }

  // Extract password from request
  const password = extractPassword(req);
  
  if (!password) {
    return res.status(401).json({
      success: false,
      error: "Authentication required",
    });
  }

  // Check authentication asynchronously
  (async () => {
    try {
      // First check if it's admin password
      const isAdmin = await checkAdminAuth(password);
      if (isAdmin) {
        console.log("Admin authenticated for loyalty project", projectId);
        if (req.session) {
          req.session.adminPassword = password;
        }
        next();
        return;
      }

      // Then check if it's loyalty project password
      const isLoyaltyManager = await checkLoyaltyProjectAuth(projectId, password);
      if (isLoyaltyManager) {
        console.log("Loyalty manager authenticated for project", projectId);
        req.isLoyaltyManager = true;
        // Store in session for future requests
        if (req.session) {
          req.session.loyaltyProjects = req.session.loyaltyProjects || {};
          req.session.loyaltyProjects[projectId] = true;
        }
        next();
        return;
      }

      // Authentication failed
      return res.status(401).json({
        success: false,
        error: "Invalid credentials",
      });
    } catch (error) {
      console.error("Authentication error:", error);
      return res.status(500).json({
        success: false,
        error: "Authentication error",
      });
    }
  })();
}

/**
 * Middleware to ensure only admin can access (not loyalty managers)
 * Use this for sensitive operations that should be admin-only
 */
export function isAdminOnly(req: Request, res: Response, next: NextFunction) {
  // This reuses the existing isAdmin logic but doesn't check for loyalty project auth
  const { isAdmin } = require("./auth");
  return isAdmin(req, res, next);
}